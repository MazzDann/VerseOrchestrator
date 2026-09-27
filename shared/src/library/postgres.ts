import type { Row } from './driver.js';
import { ftsRow, ftsSourceSql, SEGMENT_TABLES } from './merge.js';
import type { SyncConn } from './mybible.js';

/**
 * The library in PostgreSQL (PGlite — Postgres compiled to WASM — in the browser). Same
 * tables and columns as SCHEMA_SQL, so the shared queries run unchanged apart from a few
 * dialect branches (schema probes, full-text search). What differs:
 *   - FTS5 → tsvector: `verses_fts (id, translation_id, tsv)` with a GIN index, filled
 *     with to_tsvector('simple', text_norm) — the text is already normalized by
 *     normalizeForSearch, so the 'simple' configuration (no stemming, no stop words)
 *     indexes exactly the words the SQLite index has;
 *   - verse ids are BIGINT (dropped modules use ids ≥ 10^11, see mybible.ts).
 * Data arrives as the same segments the SQLite engine merges: read with SQLite, bulk-
 * loaded here with COPY (loadSegmentPg).
 */
export const PG_SCHEMA_SQL = /* sql */ `
CREATE TABLE translations (
  id          INTEGER PRIMARY KEY,
  abbr        TEXT NOT NULL,
  title       TEXT,
  language    TEXT,
  rtl         INTEGER NOT NULL DEFAULT 0,
  has_strong  INTEGER NOT NULL DEFAULT 0,
  source_file TEXT,
  source_hash TEXT
);

CREATE TABLE books (
  translation_id INTEGER NOT NULL,
  book_number    INTEGER NOT NULL,
  short_name     TEXT,
  long_name      TEXT,
  color          TEXT,
  PRIMARY KEY (translation_id, book_number)
);

CREATE TABLE verses (
  id             BIGINT PRIMARY KEY,
  translation_id INTEGER NOT NULL,
  book_number    INTEGER NOT NULL,
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  text           TEXT,
  text_raw       TEXT
);
CREATE INDEX idx_verses_loc ON verses (translation_id, book_number, chapter, verse);

CREATE TABLE verse_strongs (
  strong         INTEGER NOT NULL,
  lang           TEXT NOT NULL,
  translation_id INTEGER NOT NULL,
  verse_id       BIGINT NOT NULL,
  PRIMARY KEY (strong, lang, translation_id, verse_id)
);

CREATE TABLE book_names (
  translation_id INTEGER NOT NULL,
  book_number    INTEGER NOT NULL,
  name_norm      TEXT NOT NULL
);
CREATE INDEX idx_book_names ON book_names (translation_id, name_norm);

CREATE TABLE verses_fts (
  id             BIGINT PRIMARY KEY,
  translation_id INTEGER NOT NULL,
  tsv            TSVECTOR NOT NULL
);
CREATE INDEX idx_verses_fts ON verses_fts USING GIN (tsv);

CREATE TABLE dictionaries (
  id        INTEGER PRIMARY KEY,
  abbr      TEXT,
  name      TEXT,
  language  TEXT,
  type      TEXT,
  is_strong INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE dictionary_entries (
  dictionary_id INTEGER NOT NULL,
  topic         TEXT NOT NULL,
  topic_norm    TEXT NOT NULL,
  strong_lang   TEXT,
  definition    TEXT
);
CREATE INDEX idx_dict_topic ON dictionary_entries (topic_norm, dictionary_id);

CREATE TABLE cross_references (
  book           INTEGER NOT NULL,
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  book_to        INTEGER NOT NULL,
  chapter_to     INTEGER NOT NULL,
  verse_to_start INTEGER NOT NULL,
  verse_to_end   INTEGER NOT NULL
);
CREATE INDEX idx_xref ON cross_references (book, chapter, verse);

CREATE TABLE commentaries (
  source       TEXT NOT NULL,
  book         INTEGER NOT NULL,
  chapter_from INTEGER NOT NULL,
  verse_from   INTEGER NOT NULL,
  chapter_to   INTEGER NOT NULL,
  verse_to     INTEGER NOT NULL,
  marker       TEXT,
  text         TEXT
);
CREATE INDEX idx_commentary ON commentaries (book, chapter_from, verse_from);

CREATE TABLE songs (
  id         INTEGER PRIMARY KEY,
  number     INTEGER,
  title      TEXT,
  title_norm TEXT
);
CREATE INDEX idx_songs_num ON songs (number);
CREATE INDEX idx_songs_norm ON songs (title_norm);

CREATE TABLE song_slides (
  song_id INTEGER NOT NULL,
  ord     INTEGER NOT NULL,
  text    TEXT NOT NULL,
  render  TEXT
);
CREATE INDEX idx_song_slides ON song_slides (song_id, ord);
`;

/** Text-search configuration: plain lowercase words, like the SQLite index. */
export const PG_TS_CONFIG = 'simple';

/**
 * `?` placeholders (SQLite style, as the shared queries are written) → `$1, $2, …`.
 * Question marks inside quoted literals are left alone.
 */
export function pgPlaceholders(sql: string): string {
  let n = 0;
  let out = '';
  let quote: string | null = null;
  for (const ch of sql) {
    if (quote) {
      if (ch === quote) quote = null;
      out += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === '?') {
      out += `$${++n}`;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * The little the loader needs from a Postgres connection — a PGlite instance fits
 * (`options.blob` feeds `COPY … FROM '/dev/blob'`).
 */
export interface PgConn {
  exec(sql: string): Promise<unknown>;
  query<T = Row>(
    sql: string,
    params?: unknown[],
    options?: { blob?: Blob },
  ): Promise<{ rows: T[] }>;
}

// Postgres text can't hold NUL; a lone surrogate can't be encoded as UTF-8. Both can
// turn up in module text that SQLite stored happily.
// eslint-disable-next-line no-control-regex -- matching NUL is the point
const BAD_CHARS = /[\u0000\ud800-\udfff]/;
// eslint-disable-next-line no-control-regex -- matching NUL is the point
const NUL = /\u0000/g;
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/** One CSV field for COPY: unquoted empty = NULL, strings always quoted ("" = empty). */
function csvField(v: unknown): string {
  if (v == null) return '';
  if (typeof v !== 'string') return String(v);
  const s = BAD_CHARS.test(v) ? v.replace(NUL, '').replace(LONE_SURROGATE, '�') : v;
  return `"${s.replace(/"/g, '""')}"`;
}

const csvBlob = (rows: Row[], cols: string[]) =>
  new Blob([rows.map((r) => cols.map((c) => csvField(r[c])).join(',')).join('\n')]);

/**
 * Put rows into a table with COPY (Postgres's bulk path: KJV+'s 376k Strong rows in
 * 1.3 s vs 4.5 s as JSON inserts). COPY has no ON CONFLICT, so `ignoreDuplicates`
 * stages the rows first and skips clashes (≈2.5× slower — the fallback only).
 */
async function put(
  pg: PgConn,
  table: string,
  rows: Row[],
  ignoreDuplicates: boolean,
): Promise<void> {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const list = cols.join(', ');
  const copy = (into: string) =>
    pg.query(`COPY ${into} (${list}) FROM '/dev/blob' WITH (FORMAT csv)`, [], {
      blob: csvBlob(rows, cols),
    });
  if (!ignoreDuplicates) {
    await copy(table);
    return;
  }
  // Temp tables live in the load's transaction: a failure's ROLLBACK removes them too
  // (no `finally` — a statement in an aborted transaction would mask the real error).
  await pg.exec(`CREATE TEMP TABLE vo_stage (LIKE ${table})`);
  await copy('vo_stage');
  await pg.exec(
    `INSERT INTO ${table} (${list}) SELECT ${list} FROM vo_stage ON CONFLICT DO NOTHING;
     DROP TABLE vo_stage`,
  );
}

async function loadTables(
  seg: SyncConn,
  pg: PgConn,
  present: Set<string>,
  ignoreDuplicates: boolean,
): Promise<number> {
  let verses = 0;
  for (const table of SEGMENT_TABLES) {
    if (!present.has(table)) continue;
    const rows = seg.all(`SELECT * FROM ${table}`);
    if (table === 'verses') verses = rows.length;
    await put(pg, table, rows, ignoreDuplicates);
  }
  // The text index: normalized text staged by COPY, tokenized inside Postgres. Format ≥ 2
  // ships the normalized text; older segments normalize here, like the builder.
  const fts = present.has('verses_norm')
    ? seg.all(
        'SELECT n.id, v.translation_id, n.text_norm FROM verses_norm n JOIN verses v ON v.id = n.id',
      )
    : seg.all(ftsSourceSql('main')).map((r) => {
        const [id, textNorm] = ftsRow(r as Parameters<typeof ftsRow>[0]);
        return { id, translation_id: r.translation_id, text_norm: textNorm };
      });
  if (fts.length > 0) {
    await pg.exec(
      'CREATE TEMP TABLE vo_fts_stage (id BIGINT, translation_id INTEGER, text_norm TEXT)',
    );
    await pg.query(
      "COPY vo_fts_stage (id, translation_id, text_norm) FROM '/dev/blob' WITH (FORMAT csv)",
      [],
      { blob: csvBlob(fts, ['id', 'translation_id', 'text_norm']) },
    );
    await pg.exec(
      `INSERT INTO verses_fts (id, translation_id, tsv)
       SELECT id, translation_id, to_tsvector('${PG_TS_CONFIG}', text_norm) FROM vo_fts_stage
       ${ignoreDuplicates ? 'ON CONFLICT DO NOTHING' : ''};
       DROP TABLE vo_fts_stage`,
    );
  }
  return verses;
}

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === '23505';

/**
 * Bulk-load one segment (open in SQLite as `seg`) into the Postgres library, in one
 * transaction: every table with COPY, then the text index via to_tsvector. Segments
 * don't overlap (global ids; dropped modules get their own id range), so the fast path
 * almost always holds; should rows clash anyway (the same data under another key), the
 * load is redone skipping duplicates — SQLite's INSERT OR IGNORE. Returns the verse count.
 */
export async function loadSegmentPg(seg: SyncConn, pg: PgConn): Promise<number> {
  const present = new Set(
    seg.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => String(r.name)),
  );
  const attempt = async (ignoreDuplicates: boolean) => {
    await pg.exec('BEGIN');
    try {
      const n = await loadTables(seg, pg, present, ignoreDuplicates);
      await pg.exec('COMMIT');
      return n;
    } catch (err) {
      await pg.exec('ROLLBACK');
      throw err;
    }
  };
  try {
    return await attempt(false);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return attempt(true);
  }
}
