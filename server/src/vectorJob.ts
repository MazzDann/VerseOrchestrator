import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  LibraryError,
  N_,
  packChapter,
  VECTORS_SQL,
  type Embedder,
  type EmbedModelId,
} from '@vo/shared';

/**
 * «Обчислити вектори» (1.15.0-beta.2): every verse of a translation through the chosen model, in
 * the background, into data/vectors.db — a file of its own (the builder writes library.db over
 * whole; vectors take minutes to make and outlive a rebuild). A translation is known by its
 * module's hash, so a rebuild that renumbers translations keeps its vectors.
 *
 * A book is written in one transaction: a stop (or a closed app) loses at most the book under way,
 * and the next run goes on from the books already in. `vector_sets.done` marks a whole translation —
 * only those are searched.
 *
 * Measured on the PC (i3-10100F, half the threads = 4): see the commit — about 3 min a Bible with
 * «Швидка», 12–18 with «Точна».
 */

export type VectorPhase = 'idle' | 'running' | 'done' | 'failed' | 'stopped';

export interface VectorJobState {
  phase: VectorPhase;
  model: EmbedModelId | null;
  /** the translation under way: its verses done of all */
  current: { translationId: number; abbr: string; done: number; total: number } | null;
  /** translations waiting after it */
  left: number;
  startedAt: number | null;
  endedAt: number | null;
  /** verses a second, since the start */
  rate: number;
  error: { key: string; vars?: Record<string, string> } | null;
}

export const vectorsPath = (dataDir: string) => path.join(dataDir, 'vectors.db');

/** data/vectors.db for writing, its tables made if new. */
export function openVectors(dataDir: string): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(vectorsPath(dataDir));
  db.pragma('busy_timeout = 5000');
  db.exec(VECTORS_SQL);
  return db;
}

/** A translation's vectors of a model: all of them, or the books in so far. */
export interface VectorSet {
  done: boolean;
  books: number;
}

export function readVectorSets(dataDir: string, model: EmbedModelId): Map<string, VectorSet> {
  const out = new Map<string, VectorSet>();
  if (!fs.existsSync(vectorsPath(dataDir))) return out;
  const db = new Database(vectorsPath(dataDir), { readonly: true });
  try {
    db.pragma('busy_timeout = 3000');
    const has = db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'chapter_vectors'").get();
    if (!has) return out;
    for (const r of db
      .prepare(
        'SELECT source_hash h, COUNT(DISTINCT book) n FROM chapter_vectors WHERE model = ? GROUP BY source_hash',
      )
      .all(model) as { h: string; n: number }[])
      out.set(r.h, { done: false, books: r.n });
    for (const r of db
      .prepare('SELECT source_hash h FROM vector_sets WHERE model = ? AND done = 1')
      .all(model) as { h: string }[])
      out.set(r.h, { done: true, books: out.get(r.h)?.books ?? 0 });
    return out;
  } finally {
    db.close();
  }
}

/** The library's translations with their modules' hashes — what vectors are kept by. */
export function listTranslations(
  libraryPath: string,
): { id: number; abbr: string; title: string; hash: string | null }[] {
  if (!fs.existsSync(libraryPath)) return [];
  const db = new Database(libraryPath, { readonly: true, fileMustExist: true });
  try {
    db.pragma('busy_timeout = 3000');
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'translations'").get()) return [];
    return (
      db.prepare('SELECT id, abbr, title, source_hash FROM translations ORDER BY abbr').all() as {
        id: number;
        abbr: string;
        title: string | null;
        source_hash: string | null;
      }[]
    ).map((t) => ({ id: t.id, abbr: t.abbr, title: t.title ?? '', hash: t.source_hash }));
  } finally {
    db.close();
  }
}

const BATCH = 32;

class Stopped extends Error {}

export function createVectorJob(d: {
  dataDir: string;
  libraryPath: string;
  /** the model, opened for this job (released at its end) */
  open: (model: EmbedModelId) => Promise<Embedder & { release: () => Promise<void> }>;
  onChange?: (s: VectorJobState) => void;
  /** a translation got all its vectors */
  onSet?: () => void;
}) {
  let s: VectorJobState = {
    phase: 'idle',
    model: null,
    current: null,
    left: 0,
    startedAt: null,
    endedAt: null,
    rate: 0,
    error: null,
  };
  let stopping = false;
  let last = 0;
  const changed = (force = true) => {
    const now = Date.now();
    if (!force && now - last < 500) return;
    last = now;
    d.onChange?.({ ...s, current: s.current && { ...s.current } });
  };

  async function run(model: EmbedModelId, ids: number[] | null): Promise<void> {
    let lib: Database.Database | null = null;
    let vdb: Database.Database | null = null;
    let embedder: (Embedder & { release: () => Promise<void> }) | null = null;
    let made = 0;
    // the job's end, written once everything is closed: a new start can't overlap this one (review)
    let end: VectorPhase = 'done';
    try {
      lib = new Database(d.libraryPath, { readonly: true, fileMustExist: true });
      lib.pragma('busy_timeout = 3000');
      vdb = openVectors(d.dataDir);
      const sets = readVectorSets(d.dataDir, model);
      const all = lib
        .prepare('SELECT id, abbr, source_hash FROM translations ORDER BY abbr')
        .all() as { id: number; abbr: string; source_hash: string | null }[];
      const todo = all.filter(
        (t) => t.source_hash && (!ids || ids.includes(t.id)) && !sets.get(t.source_hash)?.done,
      );
      embedder = await d.open(model);
      const verses = lib.prepare(
        `SELECT v.book_number b, v.chapter c, v.verse n, v.text FROM verses v
         JOIN translations t ON t.id = v.translation_id
         WHERE t.source_hash = ? ORDER BY v.book_number, v.chapter, v.verse`,
      );
      const booksIn = vdb
        .prepare('SELECT DISTINCT book FROM chapter_vectors WHERE model = ? AND source_hash = ?')
        .pluck();
      const put = vdb.prepare(
        `INSERT OR REPLACE INTO chapter_vectors (model, source_hash, book, chapter, verses, vecs)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const finish = vdb.prepare(
        `INSERT OR REPLACE INTO vector_sets (model, source_hash, abbr, verses, done) VALUES (?, ?, ?, ?, 1)`,
      );
      for (const [i, t] of todo.entries()) {
        const hash = t.source_hash!;
        // by the module's hash, not the id: a rebuild between two translations can renumber them
        const rows = verses.all(hash) as { b: number; c: number; n: number; text: string | null }[];
        const done = new Set(booksIn.all(model, hash) as number[]);
        s.current = {
          translationId: t.id,
          abbr: t.abbr,
          done: rows.filter((r) => done.has(r.b)).length,
          total: rows.length,
        };
        s.left = todo.length - i - 1;
        changed();
        const byBook = new Map<number, typeof rows>();
        for (const r of rows) {
          if (done.has(r.b)) continue;
          const list = byBook.get(r.b);
          if (list) list.push(r);
          else byBook.set(r.b, [r]);
        }
        for (const [book, list] of byBook) {
          if (stopping) throw new Stopped();
          const withText = list.filter((r) => r.text && r.text.trim());
          const vec = new Map<(typeof list)[number], Int8Array>();
          // shortest first: a batch pads little
          const order = [...withText].sort((a, b) => a.text!.length - b.text!.length);
          for (let k = 0; k < order.length; k += BATCH) {
            if (stopping) throw new Stopped();
            const part = order.slice(k, k + BATCH);
            const out = await embedder.embed(
              part.map((r) => r.text!),
              'passage',
            );
            part.forEach((r, j) => vec.set(r, out[j]));
            made += part.length;
            s.current.done += part.length;
            s.rate = Math.round(made / ((Date.now() - (s.startedAt ?? Date.now())) / 1000 || 1));
            changed(false);
          }
          s.current.done += list.length - withText.length;
          const chapters = new Map<number, typeof list>();
          for (const r of withText) {
            const cv = chapters.get(r.c);
            if (cv) cv.push(r);
            else chapters.set(r.c, [r]);
          }
          vdb.transaction(() => {
            for (const [chapter, cv] of chapters) {
              const p = packChapter(
                cv.map((r) => r.n),
                cv.map((r) => vec.get(r)!),
              );
              put.run(model, hash, book, chapter, p.verses, p.vecs);
            }
          })();
        }
        finish.run(model, hash, t.abbr, rows.length);
        d.onSet?.();
      }
    } catch (err) {
      if (err instanceof Stopped) end = 'stopped';
      else {
        end = 'failed';
        s.error = {
          key: N_('Не вдалося обчислити вектори: {error}'),
          vars: { error: (err as Error).message },
        };
        console.warn(`[vectors] ${(err as Error).stack ?? err}`);
      }
    } finally {
      await embedder?.release().catch(() => undefined);
      lib?.close();
      vdb?.close();
      s.phase = end;
      s.endedAt = Date.now();
      s.current = null;
      s.left = 0;
      stopping = false;
      changed();
    }
  }

  return {
    state: (): VectorJobState => ({ ...s, current: s.current && { ...s.current } }),
    running: () => s.phase === 'running',
    /** these translations (null: every one still without them) — or joined, when one runs */
    start(model: EmbedModelId, ids: number[] | null): VectorJobState {
      if (s.phase === 'running') return this.state();
      if (!fs.existsSync(d.libraryPath)) throw new LibraryError(503, N_('Бібліотеки ще немає'));
      stopping = false;
      s = {
        phase: 'running',
        model,
        current: null,
        left: 0,
        startedAt: Date.now(),
        endedAt: null,
        rate: 0,
        error: null,
      };
      changed();
      void run(model, ids);
      return this.state();
    },
    /** «Зупинити»: after the batch under way; the books already in stay */
    stop(): VectorJobState {
      if (s.phase === 'running') stopping = true;
      return this.state();
    },
  };
}

export type VectorJob = ReturnType<typeof createVectorJob>;
