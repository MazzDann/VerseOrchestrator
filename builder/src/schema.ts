/** DDL for the merged library database, our own clean schema (not MyBible's). */
export const SCHEMA_SQL = /* sql */ `
DROP TABLE IF EXISTS verse_strongs;
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
  text_norm      TEXT,       -- normalized for search
  text_raw       TEXT        -- original MyBible markup, kept for a future Strong's dictionary
);
CREATE INDEX idx_verses_loc ON verses (translation_id, book_number, chapter, verse);

-- Concordance index: one row per (verse, distinct Strong number) for Strong-tagged
-- modules. translation_id is denormalized so "occurrences of #N in this translation"
-- is served straight from the index. Populated by the builder from verses.text_raw.
CREATE TABLE verse_strongs (
  translation_id INTEGER NOT NULL,
  verse_id       INTEGER NOT NULL,
  strong         INTEGER NOT NULL
);
CREATE INDEX idx_verse_strongs ON verse_strongs (strong, translation_id);

CREATE TABLE book_names (
  translation_id INTEGER NOT NULL,
  book_number    INTEGER NOT NULL,
  name_norm      TEXT NOT NULL
);
CREATE INDEX idx_book_names ON book_names (translation_id, name_norm);

CREATE VIRTUAL TABLE verses_fts USING fts5 (
  text_norm,
  content='verses',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

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
  definition    TEXT
);
CREATE INDEX idx_dict_topic ON dictionary_entries (topic_norm, dictionary_id);
`;
