import Database from 'better-sqlite3';
import {
  commentaryEntry,
  MODULE_COMMENTARIES_SQL,
  readSubheadings,
  stripTags,
  type CommentaryEntry,
  type Subheading,
} from '@vo/shared';

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

/** Read a Module `*.crossreferences.SQLite3` module (table `cross_references`). */
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

/** Read a Module `*.commentaries.SQLite3` module (table `commentaries`). */
export function readCommentaries(path: string): CommentaryEntry[] {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (!tableExists(db, 'commentaries')) return [];
    const rows = db.prepare(MODULE_COMMENTARIES_SQL).all() as Record<string, unknown>[];
    return rows.map(commentaryEntry).filter((c) => c.text.trim());
  } finally {
    db.close();
  }
}

/** A Module `*.subheadings.SQLite3` set (1.16.0-beta.3): its name, language and titles. */
export function readSubheadingSet(path: string): {
  title: string;
  language: string;
  rows: Subheading[];
} {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((t) => t.name);
    const info = new Map<string, string>();
    if (tableExists(db, 'info'))
      for (const r of db.prepare('SELECT name, value FROM info').all() as Record<string, unknown>[])
        info.set(String(r.name), String(r.value ?? ''));
    return {
      title: stripTags(info.get('description') ?? '').trim(),
      language: (info.get('language') ?? '').trim(),
      rows: readSubheadings((sql) => db.prepare(sql).all() as Record<string, unknown>[], tables),
    };
  } finally {
    db.close();
  }
}
