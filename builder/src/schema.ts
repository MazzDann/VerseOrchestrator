/** DDL for the merged library database, our own clean schema (not MyBible's). */
export const SCHEMA_SQL = /* sql */ `
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
  text           TEXT,
  text_norm      TEXT
);
CREATE INDEX idx_verses_loc ON verses (translation_id, book_number, chapter, verse);

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
`;
