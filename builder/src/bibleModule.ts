import Database from 'better-sqlite3';
import {
  bibleMeta,
  readSubheadings,
  type BibleMeta,
  type ModuleNote,
  type Subheading,
} from '@vo/shared';
import { readTextModule } from '@vo/shared/modules-node';

export type BibleModuleInfo = BibleMeta;

export interface BibleModuleBook {
  book_color: string | null;
  book_number: number;
  short_name: string | null;
  long_name: string | null;
}

export interface BibleModuleVerse {
  book_number: number;
  chapter: number;
  verse: number;
  text: string | null;
}

export interface BibleModule {
  info: BibleModuleInfo;
  books: BibleModuleBook[];
  verses: BibleModuleVerse[];
  /** section titles (1.16.0-beta.2) */
  subheadings: Subheading[];
  /** a text module's footnotes (1.25.0-beta.6): commentaries named after it */
  notes: ModuleNote[];
  /** book codes of a text module the library has no number for: left out */
  skipped: string[];
}

function fromText(path: string): BibleModule {
  const m = readTextModule(path);
  return {
    info: m.info,
    books: m.books.map((b) => ({
      book_color: b.color,
      book_number: b.number,
      short_name: b.short,
      long_name: b.long,
    })),
    verses: m.verses.map((v) => ({
      book_number: v.book,
      chapter: v.chapter,
      verse: v.verse,
      text: v.text,
    })),
    subheadings: m.subheadings,
    notes: m.notes,
    skipped: m.skipped,
  };
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

/**
 * Read a `.SQLite3` module. Returns null if the file is not a Bible text
 * module (e.g. a commentary, dictionary, cross-reference or cache file), i.e. it
 * lacks the `books`/`verses` tables. Any other file is a module in a text format (USFM, OSIS,
 * Zefania, VPL — textFormats.ts).
 */
export function readModule(path: string): BibleModule | null {
  if (!/\.sqlite3$/i.test(path)) return fromText(path);
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (!tableExists(db, 'books') || !tableExists(db, 'verses')) return null;

    const info: Record<string, string> = {};
    if (tableExists(db, 'info')) {
      for (const row of db.prepare('SELECT name, value FROM info').all() as {
        name: string;
        value: string;
      }[]) {
        info[row.name] = row.value;
      }
    }

    const books = db
      .prepare(
        'SELECT book_color, book_number, short_name, long_name FROM books ORDER BY book_number',
      )
      .all() as BibleModuleBook[];

    const verses = db
      .prepare('SELECT book_number, chapter, verse, text FROM verses')
      .all() as BibleModuleVerse[];

    if (books.length === 0 || verses.length === 0) return null;

    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((t) => t.name);
    return {
      info: bibleMeta(info),
      books,
      verses,
      subheadings: readSubheadings(
        (sql) => db.prepare(sql).all() as Record<string, unknown>[],
        tables,
      ),
      notes: [],
      skipped: [],
    };
  } finally {
    db.close();
  }
}
