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

/** Copy every segment table into main (same schema → same column order). */
export function mergeSql(alias: string): string[] {
  return SEGMENT_TABLES.map((t) => `INSERT OR IGNORE INTO main.${t} SELECT * FROM ${alias}.${t}`);
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
