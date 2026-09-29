import { normalizeForSearch } from '../normalize.js';

/**
 * Assembling a working database from segments (see segments.ts). The engine ATTACHes a
 * segment file under an alias, runs `mergeSql(alias)`, then fills the full-text index
 * from `ftsSourceSql(alias)` rows via `ftsRow` — FTS is contentless, so its rows can't be
 * copied with SQL and are rebuilt from the verse text with the builder's normalization.
 * Verse ids are global across segments, so plain INSERTs never collide.
 */

/** Plain tables a segment may carry, in dependency-free order. */
export const SEGMENT_TABLES = [
  'translations',
  'books',
  'book_names',
  'verses',
  'verse_strongs',
  'dictionaries',
  'dictionary_entries',
  'cross_references',
  'commentaries',
  'songs',
  'song_slides',
] as const;

/**
 * Copy every segment table into main (same schema → same column order). A songs segment
 * built before 0.10.0 has no `bundle` column: the second songs statement copies it without
 * one (for a newer segment it finds every id already there and adds nothing).
 */
export function mergeSql(alias: string): string[] {
  return [
    ...SEGMENT_TABLES.map((t) => `INSERT OR IGNORE INTO main.${t} SELECT * FROM ${alias}.${t}`),
    `INSERT OR IGNORE INTO main.songs (id, number, title, title_norm)
     SELECT id, number, title, title_norm FROM ${alias}.songs`,
  ];
}

/** Verses of the attached segment, to (re)build their FTS rows. */
export function ftsSourceSql(alias: string): string {
  return `SELECT id, translation_id, text, text_raw FROM ${alias}.verses`;
}

export const FTS_INSERT_SQL = 'INSERT INTO main.verses_fts (rowid, text_norm, tr) VALUES (?, ?, ?)';

/** One FTS row for a verse — identical to what the builder writes. */
export function ftsRow(v: {
  id: number;
  translation_id: number;
  text: string | null;
  text_raw: string | null;
}): [number, string, string] {
  return [v.id, normalizeForSearch(v.text_raw ?? v.text ?? ''), `t${v.translation_id}`];
}

/**
 * Segments (format ≥ 2) also carry `verses_norm (id, text_norm)` — the normalized text
 * the builder already computed. With it the engine fills the FTS index with ONE SQL
 * statement inside SQLite (measured in WASM: 1373 → 346 ms for a 31k-verse translation)
 * instead of normalizing in JS and crossing into WASM once per verse.
 */
export const SEGMENT_NORM_TABLE_SQL =
  'CREATE TABLE verses_norm (id INTEGER PRIMARY KEY, text_norm TEXT)';

export function ftsFillSql(alias: string): string {
  return `INSERT INTO main.verses_fts (rowid, text_norm, tr)
          SELECT n.id, n.text_norm, 't' || v.translation_id
          FROM ${alias}.verses_norm n JOIN ${alias}.verses v ON v.id = n.id`;
}
