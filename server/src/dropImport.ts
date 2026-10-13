import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import Database from 'better-sqlite3';
import {
  LibraryError,
  moduleFileKind,
  N_,
  VECTORS_SQL,
  type ModuleFileKind,
  type ModuleKind,
} from '@vo/shared';

/**
 * Files dropped anywhere on the control window (1.17.1, the user's ask: «драг ен дроп документів і
 * модулів і презентацій і векторів будь-де, а не в налаштуваннях»): a module goes into modules/
 * (the library takes it at the next rescan), a vectors file from another copy is merged into
 * data/vectors.db. The body comes as a stream, written straight to disk (a module can be big).
 */

/** Bigger than this is no module or vectors file anyone drops. */
export const DROP_FILE_MAX = 1024 * 1024 * 1024;

/** The request's body into `file`; refused past `max` bytes (the part is removed). */
export function receiveFile(
  req: IncomingMessage,
  file: string,
  max = DROP_FILE_MAX,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    let bytes = 0;
    let failed = false;
    const fail = (e: Error) => {
      if (failed) return;
      failed = true;
      req.unpipe(out);
      out.destroy();
      fs.rmSync(file, { force: true });
      reject(e);
    };
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > max) fail(new LibraryError(413, N_('Файл завеликий')));
    });
    req.on('error', fail);
    req.on('aborted', () => fail(new Error('aborted')));
    out.on('error', fail);
    out.on('finish', () => {
      if (!failed) resolve(bytes);
    });
    req.pipe(out);
  });
}

/** The tables of an SQLite file; null when it isn't one. */
function tablesOf(file: string): string[] | null {
  const head = Buffer.alloc(16);
  const fd = fs.openSync(file, 'r');
  try {
    fs.readSync(fd, head, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (head.toString('latin1') !== 'SQLite format 3\u0000') return null;
  let db: Database.Database | null = null;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    return (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((r) => r.name);
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/** Two files with the same bytes (read in pieces: a module can be big). */
function sameBytes(a: string, b: string): boolean {
  if (fs.statSync(a).size !== fs.statSync(b).size) return false;
  const fa = fs.openSync(a, 'r');
  const fb = fs.openSync(b, 'r');
  try {
    const ba = Buffer.alloc(1 << 20);
    const bb = Buffer.alloc(1 << 20);
    for (let at = 0; ; at += ba.length) {
      const na = fs.readSync(fa, ba, 0, ba.length, at);
      const nb = fs.readSync(fb, bb, 0, bb.length, at);
      if (na !== nb || !ba.subarray(0, na).equals(bb.subarray(0, nb))) return false;
      if (na < ba.length) return true;
    }
  } finally {
    fs.closeSync(fa);
    fs.closeSync(fb);
  }
}

/** A module kind's suffix, as the builder tells modules apart by their names (build.ts). */
const SUFFIX: Record<ModuleFileKind, string> = {
  bible: '',
  dictionary: '.dictionary',
  commentaries: '.commentaries',
  crossreferences: '.crossreferences',
  subheadings: '.subheadings',
};
const KIND: Record<ModuleFileKind, ModuleKind> = {
  bible: 'bibles',
  dictionary: 'dictionaries',
  commentaries: 'commentaries',
  crossreferences: 'crossreferences',
  subheadings: 'subheadings',
};

/**
 * The module's file name in modules/: the dropped name, its kind's suffix put right by its tables
 * (a dictionary dropped as «Strong.SQLite3» is «Strong.dictionary.SQLite3» — the builder reads
 * the kind from the name), characters no system takes replaced.
 */
export function moduleFileName(dropped: string, kind: ModuleFileKind): string | null {
  const base = dropped.replace(/^.*[\\/]/, '').normalize('NFC');
  const stem = base
    .replace(/\.sqlite3$/i, '')
    .replace(
      /\.(dictionary|commentaries|crossreferences|subheadings|devotions|plan|bundle|referencedata)$/i,
      '',
    )
    // eslint-disable-next-line no-control-regex -- control characters are in no file name
    .replace(/[<>:"|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/, '')
    .trim();
  if (!stem || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(stem) || stem.startsWith('.')) return null;
  return `${stem}${SUFFIX[kind]}.SQLite3`;
}

export interface ModuleAdded {
  file: string;
  kind: ModuleKind;
  /** the same file was there already */
  same: boolean;
}

/**
 * A received file into modules/ as a module: refused when it is no module the library takes or a
 * different file of that name is there (never written over). The caller adds it to the library's
 * selection and starts the rescan.
 */
export function placeModule(tmp: string, dropped: string, modulesDir: string): ModuleAdded {
  const tables = tablesOf(tmp);
  const kind = tables ? moduleFileKind(tables) : null;
  if (!kind) {
    fs.rmSync(tmp, { force: true });
    throw new LibraryError(400, N_('Це не модуль, який бере бібліотека: «{file}»'), {
      file: dropped,
    });
  }
  const file = moduleFileName(dropped, kind);
  if (!file) {
    fs.rmSync(tmp, { force: true });
    throw new LibraryError(400, N_('Така назва файлу не підходить — перейменуйте його'));
  }
  const to = path.join(modulesDir, file);
  if (fs.existsSync(to)) {
    const same = sameBytes(to, tmp);
    fs.rmSync(tmp, { force: true });
    if (same) return { file, kind: KIND[kind], same: true };
    throw new LibraryError(409, N_('У modules/ уже є інший «{file}» — перейменуйте один із них'), {
      file,
    });
  }
  fs.renameSync(tmp, to);
  return { file, kind: KIND[kind], same: false };
}

export interface VectorsMerged {
  /** translation × model sets taken in */
  sets: number;
  verses: number;
  /** sets this copy has whole already */
  kept: number;
}

/**
 * A vectors file from another copy (its data/vectors.db) merged into this one: each finished set
 * (a model × a translation's text) this copy lacks or has unfinished comes in whole; the sets it
 * has whole stay as they are. Vectors are keyed by the translation's text, so they serve this
 * copy's translations with the same text whatever their numbers here.
 */
export function mergeVectors(tmp: string, target: string): VectorsMerged {
  const tables = tablesOf(tmp);
  if (!tables || !tables.includes('vector_sets') || !tables.includes('chapter_vectors')) {
    fs.rmSync(tmp, { force: true });
    throw new LibraryError(400, N_('Це не файл векторів (vectors.db з іншої копії застосунку)'));
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const db = new Database(target);
  try {
    db.pragma('busy_timeout = 5000');
    db.exec(VECTORS_SQL);
    db.prepare('ATTACH ? AS drop_in').run(tmp);
    try {
      const sets = db
        .prepare(
          `SELECT d.model, d.source_hash, d.verses FROM drop_in.vector_sets d
           WHERE d.done = 1`,
        )
        .all() as { model: string; source_hash: string; verses: number }[];
      const have = db.prepare(
        'SELECT done FROM main.vector_sets WHERE model = ? AND source_hash = ?',
      );
      const out: VectorsMerged = { sets: 0, verses: 0, kept: 0 };
      db.transaction(() => {
        for (const s of sets) {
          const mine = have.get(s.model, s.source_hash) as { done: number } | undefined;
          if (mine?.done === 1) {
            out.kept++;
            continue;
          }
          db.prepare('DELETE FROM main.chapter_vectors WHERE model = ? AND source_hash = ?').run(
            s.model,
            s.source_hash,
          );
          db.prepare(
            `INSERT INTO main.chapter_vectors (model, source_hash, book, chapter, verses, vecs)
             SELECT model, source_hash, book, chapter, verses, vecs FROM drop_in.chapter_vectors
             WHERE model = ? AND source_hash = ?`,
          ).run(s.model, s.source_hash);
          db.prepare(
            `INSERT OR REPLACE INTO main.vector_sets (model, source_hash, abbr, verses, done)
             SELECT model, source_hash, abbr, verses, done FROM drop_in.vector_sets
             WHERE model = ? AND source_hash = ?`,
          ).run(s.model, s.source_hash);
          out.sets++;
          out.verses += s.verses;
        }
      })();
      return out;
    } finally {
      db.exec('DETACH drop_in');
    }
  } finally {
    db.close();
    fs.rmSync(tmp, { force: true });
  }
}
