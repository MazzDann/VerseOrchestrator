import Database from 'better-sqlite3';
import { commentaryEntry, MYBIBLE_COMMENTARIES_SQL, type CommentaryEntry } from '@vo/shared';

export type { CommentaryEntry };

export interface CrossRef {
  book: number;
  chapter: number;
  verse: number;
  bookTo: number;
  chapterTo: number;
  verseToStart: number;
  verseToEnd: number;
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

/** Read a MyBible `*.crossreferences.SQLite3` module (table `cross_references`). */
export function readCrossrefs(path: string): CrossRef[] {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (!tableExists(db, 'cross_references')) return [];
    const rows = db
      .prepare(
        'SELECT book, chapter, verse, book_to, chapter_to, verse_to_start, verse_to_end FROM cross_references',
      )
      .all() as Record<string, number>[];
    return rows.map((r) => ({
      book: r.book,
      chapter: r.chapter,
      verse: r.verse,
      bookTo: r.book_to,
      chapterTo: r.chapter_to,
      verseToStart: r.verse_to_start,
      verseToEnd: r.verse_to_end,
    }));
  } finally {
    db.close();
  }
}

/** Read a MyBible `*.commentaries.SQLite3` module (table `commentaries`). */
export function readCommentaries(path: string): CommentaryEntry[] {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (!tableExists(db, 'commentaries')) return [];
    const rows = db.prepare(MYBIBLE_COMMENTARIES_SQL).all() as Record<string, unknown>[];
    return rows.map(commentaryEntry).filter((c) => c.text.trim());
  } finally {
    db.close();
  }
}
