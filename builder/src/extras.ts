import Database from 'better-sqlite3';

export interface CrossRef {
  book: number;
  chapter: number;
  verse: number;
  bookTo: number;
  chapterTo: number;
  verseToStart: number;
  verseToEnd: number;
}

export interface CommentaryEntry {
  book: number;
  chapterFrom: number;
  verseFrom: number;
  chapterTo: number;
  verseTo: number;
  marker: string;
  text: string;
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
    const rows = db
      .prepare(
        `SELECT book_number, chapter_number_from, verse_number_from,
                chapter_number_to, verse_number_to, marker, text
         FROM commentaries`,
      )
      .all() as Record<string, number | string | null>[];
    return rows
      .map((r) => ({
        book: Number(r.book_number),
        chapterFrom: Number(r.chapter_number_from),
        verseFrom: Number(r.verse_number_from),
        chapterTo: Number(r.chapter_number_to ?? r.chapter_number_from),
        verseTo: Number(r.verse_number_to ?? r.verse_number_from),
        marker: String(r.marker ?? ''),
        text: String(r.text ?? ''),
      }))
      .filter((c) => c.text.trim());
  } finally {
    db.close();
  }
}
