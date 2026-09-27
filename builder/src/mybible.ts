import Database from 'better-sqlite3';
import { bibleMeta, type BibleMeta } from '@vo/shared';

export type MyBibleInfo = BibleMeta;

export interface MyBibleBook {
  book_color: string | null;
  book_number: number;
  short_name: string | null;
  long_name: string | null;
}

export interface MyBibleVerse {
  book_number: number;
  chapter: number;
  verse: number;
  text: string | null;
}

export interface MyBibleModule {
  info: MyBibleInfo;
  books: MyBibleBook[];
  verses: MyBibleVerse[];
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

/**
 * Read a MyBible `.SQLite3` module. Returns null if the file is not a Bible text
 * module (e.g. a commentary, dictionary, cross-reference or cache file), i.e. it
 * lacks the `books`/`verses` tables.
 */
export function readModule(path: string): MyBibleModule | null {
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
      .all() as MyBibleBook[];

    const verses = db
      .prepare('SELECT book_number, chapter, verse, text FROM verses')
      .all() as MyBibleVerse[];

    if (books.length === 0 || verses.length === 0) return null;

    return {
      info: bibleMeta(info),
      books,
      verses,
    };
  } finally {
    db.close();
  }
}
