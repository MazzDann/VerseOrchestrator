import fs from 'node:fs';
import Database from 'better-sqlite3';
import {
  N_,
  packChapter,
  songPassages,
  songPassagesHash,
  type Embedder,
  type EmbedModelId,
} from '@vo/shared';
import { openVectors, vectorsPath } from './vectorJob.js';

/**
 * Songs by meaning (1.25.0-beta.1, the author: «пишеш тему як от спасіння і воно тобі автопідбирає
 * пісні»): every song's passages (songPassages — its title, each slide once) through the chosen
 * model into data/vectors.db `song_vectors`, a row per song. It runs by itself (the author: «самі,
 * якщо модель є») — at the start, after a bundle changed, after a model was chosen or a rebuild —
 * and only for the songs whose passages changed (songPassagesHash); a stop or a closed app keeps
 * the songs written so far. A pass also drops the rows of songs gone from the library.
 */

export type SongVectorPhase = 'idle' | 'running' | 'done' | 'failed' | 'stopped';

export interface SongVectorState {
  phase: SongVectorPhase;
  model: EmbedModelId | null;
  /** songs with their vectors of all the library's songs (`done` counts during a pass) */
  done: number;
  total: number;
  startedAt: number | null;
  endedAt: number | null;
  /** passages a second, since the start */
  rate: number;
  error: { key: string; vars?: Record<string, string> } | null;
}

/** Songs written in one transaction: a stop loses at most these. */
const CHUNK = 50;
const BATCH = 32;

class Stopped extends Error {}

interface LibrarySong {
  id: number;
  passages: { ords: number[]; texts: string[] };
  hash: string;
}

/** The library's songs with their passages and hashes (≈ 2 500 songs read in ~50 ms). */
export function readLibrarySongs(libraryPath: string): LibrarySong[] {
  if (!fs.existsSync(libraryPath)) return [];
  const lib = new Database(libraryPath, { readonly: true, fileMustExist: true });
  try {
    lib.pragma('busy_timeout = 3000');
    if (!lib.prepare("SELECT 1 FROM sqlite_master WHERE name = 'song_slides'").get()) return [];
    const rows = lib
      .prepare(
        `SELECT s.id, s.title, sl.ord, sl.text FROM songs s
         JOIN song_slides sl ON sl.song_id = s.id ORDER BY s.id, sl.ord`,
      )
      .all() as { id: number; title: string; ord: number; text: string | null }[];
    const bySong = new Map<number, { title: string; slides: string[] }>();
    for (const r of rows) {
      const song = bySong.get(r.id) ?? { title: r.title, slides: [] };
      song.slides[r.ord] = r.text ?? '';
      bySong.set(r.id, song);
    }
    const out: LibrarySong[] = [];
    for (const [id, song] of bySong) {
      const passages = songPassages(
        song.title,
        Array.from(song.slides, (t) => t ?? ''),
      );
      if (passages.texts.length) out.push({ id, passages, hash: songPassagesHash(passages) });
    }
    return out;
  } finally {
    lib.close();
  }
}

/** How many of the library's songs have their vectors of this model now (for «Дані»). */
export function songVectorCounts(
  dataDir: string,
  libraryPath: string,
  model: EmbedModelId,
): { done: number; total: number } {
  const songs = readLibrarySongs(libraryPath);
  if (!songs.length || !fs.existsSync(vectorsPath(dataDir)))
    return { done: 0, total: songs.length };
  const db = new Database(vectorsPath(dataDir), { readonly: true });
  try {
    db.pragma('busy_timeout = 3000');
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'song_vectors'").get())
      return { done: 0, total: songs.length };
    const have = new Map(
      (
        db.prepare('SELECT song_id, hash FROM song_vectors WHERE model = ?').all(model) as {
          song_id: number;
          hash: string;
        }[]
      ).map((r) => [r.song_id, r.hash]),
    );
    return { done: songs.filter((s) => have.get(s.id) === s.hash).length, total: songs.length };
  } finally {
    db.close();
  }
}

export function createSongVectorJob(d: {
  dataDir: string;
  libraryPath: string;
  /** the model, opened for this pass (released at its end) */
  open: (model: EmbedModelId) => Promise<Embedder & { release: () => Promise<void> }>;
  onChange?: (s: SongVectorState) => void;
  /** some songs got their vectors (a library connection opened before vectors.db existed reopens) */
  onWritten?: () => void;
}) {
  let s: SongVectorState = {
    phase: 'idle',
    model: null,
    done: 0,
    total: 0,
    startedAt: null,
    endedAt: null,
    rate: 0,
    error: null,
  };
  let stopping = false;
  /** the pass under way, settled when it has closed everything (another job waits for it) */
  let passing: Promise<void> = Promise.resolve();
  /** asked again while a pass ran: one more pass after it (a bundle changed meanwhile) */
  let again: EmbedModelId | null = null;
  let last = 0;
  const changed = (force = true) => {
    const now = Date.now();
    if (!force && now - last < 500) return;
    last = now;
    d.onChange?.({ ...s });
  };

  async function run(model: EmbedModelId): Promise<void> {
    let vdb: Database.Database | null = null;
    let embedder: (Embedder & { release: () => Promise<void> }) | null = null;
    let end: SongVectorPhase = 'done';
    let made = 0;
    try {
      const songs = readLibrarySongs(d.libraryPath);
      vdb = openVectors(d.dataDir);
      const have = new Map(
        (
          vdb.prepare('SELECT song_id, hash FROM song_vectors WHERE model = ?').all(model) as {
            song_id: number;
            hash: string;
          }[]
        ).map((r) => [r.song_id, r.hash]),
      );
      const todo = songs.filter((x) => have.get(x.id) !== x.hash);
      s.total = songs.length;
      s.done = songs.length - todo.length;
      changed();
      if (todo.length) {
        embedder = await d.open(model);
        // stopped while the model opened (the cores test can take minutes): not a song embedded
        if (stopping) throw new Stopped();
        const began = Date.now();
        const put = vdb.prepare(
          'INSERT OR REPLACE INTO song_vectors (model, song_id, hash, ords, vecs) VALUES (?, ?, ?, ?, ?)',
        );
        for (let k = 0; k < todo.length; k += CHUNK) {
          if (stopping) throw new Stopped();
          const part = todo.slice(k, k + CHUNK);
          // every passage of these songs, shortest first: a batch pads little
          const items = part.flatMap((song) =>
            song.passages.texts.map((text, i) => ({ song, i, text })),
          );
          items.sort((a, b) => a.text.length - b.text.length);
          const vec = new Map<LibrarySong, Int8Array[]>();
          for (let b = 0; b < items.length; b += BATCH) {
            if (stopping) throw new Stopped();
            const batch = items.slice(b, b + BATCH);
            const out = await embedder.embed(
              batch.map((x) => x.text),
              'passage',
            );
            batch.forEach((x, j) => {
              const list = vec.get(x.song) ?? [];
              list[x.i] = out[j];
              vec.set(x.song, list);
            });
            made += batch.length;
            s.rate = Math.round(made / ((Date.now() - began) / 1000 || 1));
            changed(false);
          }
          vdb.transaction(() => {
            for (const song of part) {
              const p = packChapter(song.passages.ords, vec.get(song)!);
              put.run(model, song.id, song.hash, p.verses, p.vecs);
            }
          })();
          s.done += part.length;
          d.onWritten?.();
          changed(false);
        }
      }
      // the rows of songs no longer in the library (a deleted bundle, a changed key)
      const ids = new Set(songs.map((x) => x.id));
      const gone = [...have.keys()].filter((id) => !ids.has(id));
      if (gone.length) {
        const del = vdb.prepare('DELETE FROM song_vectors WHERE model = ? AND song_id = ?');
        vdb.transaction(() => {
          for (const id of gone) del.run(model, id);
        })();
      }
    } catch (err) {
      // a cores test stopped under our opening is a stop too (index.ts openForJob)
      if (err instanceof Stopped || stopping || (err as Error).message === 'stopped')
        end = 'stopped';
      else {
        end = 'failed';
        s.error = {
          key: N_('Не вдалося обчислити вектори: {error}'),
          vars: { error: (err as Error).message },
        };
        console.warn(`[song vectors] ${(err as Error).stack ?? err}`);
      }
    } finally {
      await embedder?.release().catch(() => undefined);
      vdb?.close();
      s.phase = end;
      s.endedAt = Date.now();
      stopping = false;
      changed();
      if (again && end !== 'failed') {
        const m = again;
        again = null;
        start(m);
      } else again = null;
    }
  }

  function start(model: EmbedModelId): SongVectorState {
    if (s.phase === 'running') {
      again = model;
      return { ...s };
    }
    if (!fs.existsSync(d.libraryPath)) return { ...s };
    stopping = false;
    s = {
      phase: 'running',
      model,
      done: 0,
      total: 0,
      startedAt: Date.now(),
      endedAt: null,
      rate: 0,
      error: null,
    };
    changed();
    passing = run(model);
    return { ...s };
  }

  return {
    state: (): SongVectorState => ({ ...s }),
    running: () => s.phase === 'running',
    /** a pass over the songs whose passages changed — or one more after the pass under way */
    start,
    /** settled when no pass runs (the one under way has released its model) */
    settled: (): Promise<void> => passing,
    /** after the batch under way; the songs written stay (another job needs the processor) */
    stop(): SongVectorState {
      again = null;
      if (s.phase === 'running') stopping = true;
      return { ...s };
    },
  };
}

export type SongVectorJob = ReturnType<typeof createSongVectorJob>;
