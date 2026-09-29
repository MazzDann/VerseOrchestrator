/**
 * DDL for the library database — our own clean schema (not MyBible's). ONE schema for
 * every engine (driver.ts): the builder writes it with better-sqlite3, the browser can
 * create it in sql.js. (FTS5 is SQLite-only; a Postgres engine maps it separately.)
 */
export const SCHEMA_SQL = /* sql */ `
DROP TABLE IF EXISTS verse_strongs;
DROP TABLE IF EXISTS verses_fts_vocab;
DROP TABLE IF EXISTS verses_fts;
DROP TABLE IF EXISTS verses;
DROP TABLE IF EXISTS book_names;
DROP TABLE IF EXISTS books;
DROP TABLE IF EXISTS translations;

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
  id             INTEGER PRIMARY KEY,
  translation_id INTEGER NOT NULL,
  book_number    INTEGER NOT NULL,
  chapter        INTEGER NOT NULL,
  verse          INTEGER NOT NULL,
  text           TEXT,       -- clean display text (tags + Strong/morphology stripped)
  text_raw       TEXT        -- original MyBible markup (Strong/red-letter tags); NULL when it
                             -- equals text (no markup) — readers fall back to text
);
CREATE INDEX idx_verses_loc ON verses (translation_id, book_number, chapter, verse);

-- Concordance index: one row per (verse, distinct Strong number) for Strong-tagged
-- modules. lang separates Hebrew (H, OT) from Greek (G, NT and Greek OTs like the LXX)
-- — the number alone is ambiguous (H2424 ≠ G2424). WITHOUT ROWID: the table IS its
-- primary-key b-tree, so there is no second copy as a separate index.
CREATE TABLE verse_strongs (
  strong         INTEGER NOT NULL,
  lang           TEXT NOT NULL,     -- 'H' | 'G'
  translation_id INTEGER NOT NULL,
  verse_id       INTEGER NOT NULL,
  PRIMARY KEY (strong, lang, translation_id, verse_id)
) WITHOUT ROWID;

CREATE TABLE book_names (
  translation_id INTEGER NOT NULL,
  book_number    INTEGER NOT NULL,
  name_norm      TEXT NOT NULL
);
CREATE INDEX idx_book_names ON book_names (translation_id, name_norm);

-- Full-text index, SEGMENTED BY TRANSLATION: every row carries a tr token ('t<id>'),
-- so a search intersects with the selected translations' posting lists inside FTS
-- instead of ranking matches from the whole library and filtering afterwards — cost
-- follows what you read, not how big the library is. Contentless (content=''): rowid =
-- verses.id, the normalized text lives only in the index (no text_norm column needed).
CREATE VIRTUAL TABLE verses_fts USING fts5 (
  text_norm,
  tr,
  content='',
  tokenize='unicode61 remove_diacritics 2'
);

-- Read-only view of the index's vocabulary (no storage): per-term document counts let
-- the search planner tell a rare word from a frequent one before choosing a strategy.
CREATE VIRTUAL TABLE verses_fts_vocab USING fts5vocab('verses_fts', 'row');

DROP TABLE IF EXISTS dictionary_entries;
DROP TABLE IF EXISTS dictionaries;

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
  topic_norm    TEXT NOT NULL, -- normalized key for lookup (Strong digits, or lowercased word)
  strong_lang   TEXT,          -- 'H' (Hebrew/OT) or 'G' (Greek/NT) from the Strong topic prefix, else ''
  definition    TEXT
);
CREATE INDEX idx_dict_topic ON dictionary_entries (topic_norm, dictionary_id);

DROP TABLE IF EXISTS cross_references;
DROP TABLE IF EXISTS commentaries;

-- Cross-references (a verse → related passages), book/chapter/verse keyed (MyBible numbering).
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

-- Verse commentaries, one row per note; source is the module label.
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

DROP TABLE IF EXISTS sources;

-- Provenance: which module file (per kind) the library was built from.
CREATE TABLE sources (
  kind TEXT NOT NULL, -- bibles | dictionaries | commentaries | crossreferences
  file TEXT NOT NULL  -- file name in the modules folder
);

DROP TABLE IF EXISTS song_slides;
DROP TABLE IF EXISTS songs;

-- Songs from the song bundles (data/songs/*.vosongs, 0.10.0; one slide = one stanza).
-- id is stable: derived from the bundle's id and the song's key (songs/bundle.ts).
CREATE TABLE songs (
  id         INTEGER PRIMARY KEY,
  number     INTEGER,
  title      TEXT,
  title_norm TEXT,
  bundle     TEXT          -- the bundle's name
);
CREATE INDEX idx_songs_num ON songs (number);
CREATE INDEX idx_songs_norm ON songs (title_norm);

CREATE TABLE song_slides (
  song_id INTEGER NOT NULL,
  ord     INTEGER NOT NULL,
  text    TEXT NOT NULL,
  render  TEXT          -- JSON faithful style {bg,color,font,bold,align,x,y,w,h}, or NULL
);
CREATE INDEX idx_song_slides ON song_slides (song_id, ord);
`;
