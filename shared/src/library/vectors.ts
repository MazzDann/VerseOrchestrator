import type { SyncConn } from './moduleFormat.js';
import type { PgConn } from './postgres.js';

/**
 * «Пошук за змістом» (1.15.0-beta.2): where verse vectors live, per engine. One logical table —
 * a vector per (model, translation, place) — stored the way each engine reads it fastest:
 *
 * - SQLite (the server, SQLite-WASM): a row per CHAPTER — its verse numbers (int16) and its
 *   int8 vectors one after another — scanned in JS (shared/src/embed/vectors.ts `nearest`).
 *   Measured on better-sqlite3, 31 102 verses × 384: a SQL function over a row per verse 78 ms,
 *   a row per verse read and scanned in JS 81 ms, a row per chapter 37 ms.
 * - PostgreSQL (PGlite + pgvector): a row per verse, `vector`, ordered by `<#>` (inner product).
 *
 * A translation is known by its module's hash (`translations.source_hash`), not its id: ids follow
 * the import order and change with a rebuild; vectors take minutes to make and must outlive it.
 * `vector_sets.done` marks a translation whose every book is in (a stopped job leaves the books it
 * finished, and goes on from there).
 *
 * On the server these tables are a file of their own, data/vectors.db, ATTACHed to the read-only
 * library connection — never in library.db, which the builder writes over whole.
 */
export const VECTORS_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS vector_sets (
  model       TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  abbr        TEXT,
  verses      INTEGER NOT NULL DEFAULT 0,
  done        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (model, source_hash)
);
CREATE TABLE IF NOT EXISTS chapter_vectors (
  model       TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  book        INTEGER NOT NULL,
  chapter     INTEGER NOT NULL,
  verses      BLOB NOT NULL,
  vecs        BLOB NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chapter_vectors ON chapter_vectors (model, source_hash, book, chapter);
`;

/** The same for Postgres — pgvector must be loaded (PGlite: the `vector` extension). */
export const PG_VECTORS_SQL = /* sql */ `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS vector_sets (
  model       TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  abbr        TEXT,
  verses      INTEGER NOT NULL DEFAULT 0,
  done        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (model, source_hash)
);
CREATE TABLE IF NOT EXISTS verse_vectors (
  model       TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  book        INTEGER NOT NULL,
  chapter     INTEGER NOT NULL,
  verse       INTEGER NOT NULL,
  vec         vector NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verse_vectors ON verse_vectors (model, source_hash);
`;

/**
 * An int8 vector as pgvector's text form, the integers as they are («[12,-5,…]»): float32 holds
 * them exactly, so `<#>` ranks as SQLite's integer dot product does (the score is ÷ 127²), and the
 * text is a third of seven-digit fractions' — what COPY reads (measured: UBIO'62, 31 170 verses).
 */
export function pgVector(v: ArrayLike<number>): string {
  let s = '[';
  for (let i = 0; i < v.length; i++) s += (i ? ',' : '') + v[i];
  return s + ']';
}

/** One CSV field for COPY, always quoted. */
const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/**
 * A vector segment (chapter rows, open in SQLite as `seg`) into Postgres: each chapter's vectors
 * spread into a row per verse and put in with COPY, in one transaction; a translation loaded again
 * replaces its rows. Returns the verses put in.
 */
export async function loadVectorsPg(seg: SyncConn, pg: PgConn): Promise<number> {
  await pg.exec(PG_VECTORS_SQL);
  const sets = seg.all('SELECT model, source_hash, abbr, verses, done FROM vector_sets');
  let n = 0;
  await pg.exec('BEGIN');
  try {
    for (const s of sets) {
      const model = String(s.model);
      const hash = String(s.source_hash);
      await pg.query('DELETE FROM verse_vectors WHERE model = $1 AND source_hash = $2', [
        model,
        hash,
      ]);
      const lines: string[] = [];
      for (const r of seg.all(
        'SELECT book, chapter, verses, vecs FROM chapter_vectors WHERE model = ? AND source_hash = ?',
        [model, hash],
      )) {
        const nums = r.verses as Uint8Array;
        const vecs = r.vecs as Uint8Array;
        const dv = new DataView(nums.buffer, nums.byteOffset, nums.byteLength);
        const x = new Int8Array(vecs.buffer, vecs.byteOffset, vecs.byteLength);
        const count = nums.byteLength / 2;
        const d = x.length / Math.max(1, count);
        for (let i = 0; i < count; i++)
          lines.push(
            [model, hash, Number(r.book), Number(r.chapter), dv.getInt16(i * 2, true)]
              .map(csv)
              .concat(csv(pgVector(x.subarray(i * d, (i + 1) * d))))
              .join(','),
          );
      }
      if (lines.length)
        await pg.query(
          `COPY verse_vectors (model, source_hash, book, chapter, verse, vec) FROM '/dev/blob' WITH (FORMAT csv)`,
          [],
          { blob: new Blob([lines.join('\n')]) },
        );
      await pg.query(
        `INSERT INTO vector_sets (model, source_hash, abbr, verses, done) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (model, source_hash) DO UPDATE
         SET abbr = EXCLUDED.abbr, verses = EXCLUDED.verses, done = EXCLUDED.done`,
        [model, hash, s.abbr == null ? null : String(s.abbr), Number(s.verses), Number(s.done)],
      );
      n += lines.length;
    }
    await pg.exec('COMMIT');
  } catch (err) {
    await pg.exec('ROLLBACK');
    throw err;
  }
  return n;
}
