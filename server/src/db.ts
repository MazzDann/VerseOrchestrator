import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {
  searchTokens,
  parseReference,
  type Translation,
  type Book,
  type Verse,
  type SearchResult,
} from '@vo/shared';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DB_PATH = process.env.LIBRARY_DB ?? path.join(repoRoot, 'data', 'library.db');

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  if (!fs.existsSync(DB_PATH)) {
    throw new ApiError(503, 'Library not built yet. Run: npm run build:library');
  }
  db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  db.pragma('busy_timeout = 3000');
  return db;
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',');
}

export function getTranslations(): Translation[] {
  const rows = getDb()
    .prepare('SELECT id, abbr, title, language, rtl, has_strong FROM translations ORDER BY abbr')
    .all() as any[];
  return rows.map((r) => ({
    id: r.id,
    abbr: r.abbr,
    title: r.title,
    language: r.language,
    rtl: !!r.rtl,
    hasStrong: !!r.has_strong,
  }));
}

export function getBooks(translationId: number): Book[] {
  const rows = getDb()
    .prepare(
      'SELECT book_number, short_name, long_name, color FROM books WHERE translation_id = ? ORDER BY book_number',
    )
    .all(translationId) as any[];
  return rows.map((r) => ({
    bookNumber: r.book_number,
    shortName: r.short_name,
    longName: r.long_name,
    color: r.color,
  }));
}

export function getChapters(translationId: number, bookNumber: number): number[] {
  const rows = getDb()
    .prepare(
      'SELECT DISTINCT chapter FROM verses WHERE translation_id = ? AND book_number = ? ORDER BY chapter',
    )
    .all(translationId, bookNumber) as any[];
  return rows.map((r) => r.chapter);
}

export function getVerses(translationId: number, bookNumber: number, chapter: number): Verse[] {
  const rows = getDb()
    .prepare(
      `SELECT translation_id, book_number, chapter, verse, text
       FROM verses
       WHERE translation_id = ? AND book_number = ? AND chapter = ?
       ORDER BY verse`,
    )
    .all(translationId, bookNumber, chapter) as any[];
  return rows.map(rowToVerse);
}

function rowToVerse(r: any): Verse {
  return {
    translationId: r.translation_id,
    bookNumber: r.book_number,
    chapter: r.chapter,
    verse: r.verse,
    text: r.text,
  };
}

function rowToResult(r: any): SearchResult {
  return { ...rowToVerse(r), longName: r.long_name, shortName: r.short_name };
}

export interface SearchResponse {
  kind: 'reference' | 'text' | 'empty';
  results: SearchResult[];
}

/**
 * Search either by reference ("Ів 3:16") or full text. Reference is tried first;
 * if the query does not look like a reference we fall back to FTS5 text search.
 */
export function search(query: string, translationIds: number[]): SearchResponse {
  const ids = translationIds.length ? translationIds : getTranslations().map((t) => t.id);
  if (ids.length === 0) return { kind: 'empty', results: [] };

  const ref = parseReference(query);
  if (ref) {
    const results = resolveReference(query, ids);
    if (results.length) return { kind: 'reference', results };
  }

  const tokens = searchTokens(query);
  if (tokens.length === 0) return { kind: 'empty', results: [] };
  const match = tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');

  const rows = getDb()
    .prepare(
      `SELECT v.translation_id, v.book_number, v.chapter, v.verse, v.text,
              b.long_name, b.short_name
       FROM verses_fts
       JOIN verses v ON v.id = verses_fts.rowid
       JOIN books b ON b.translation_id = v.translation_id AND b.book_number = v.book_number
       WHERE verses_fts MATCH ? AND v.translation_id IN (${placeholders(ids.length)})
       ORDER BY rank
       LIMIT 300`,
    )
    .all(match, ...ids) as any[];

  return { kind: 'text', results: rows.map(rowToResult) };
}

function resolveReference(query: string, ids: number[]): SearchResult[] {
  const ref = parseReference(query);
  if (!ref) return [];

  // Find the matching book per translation by normalized-name prefix.
  const books = getDb()
    .prepare(
      `SELECT DISTINCT translation_id, book_number
       FROM book_names
       WHERE translation_id IN (${placeholders(ids.length)}) AND name_norm LIKE ?
       ORDER BY translation_id, length(name_norm)`,
    )
    .all(...ids, `${ref.bookToken}%`) as any[];

  // Keep the first (shortest-name) match per translation.
  const byTranslation = new Map<number, number>();
  for (const b of books) {
    if (!byTranslation.has(b.translation_id)) {
      byTranslation.set(b.translation_id, b.book_number);
    }
  }

  const out: SearchResult[] = [];
  for (const [translationId, bookNumber] of byTranslation) {
    let sql = `SELECT v.translation_id, v.book_number, v.chapter, v.verse, v.text,
                      b.long_name, b.short_name
               FROM verses v
               JOIN books b ON b.translation_id = v.translation_id AND b.book_number = v.book_number
               WHERE v.translation_id = ? AND v.book_number = ? AND v.chapter = ?`;
    const params: any[] = [translationId, bookNumber, ref.chapter];
    if (ref.verseStart != null) {
      sql += ' AND v.verse BETWEEN ? AND ?';
      params.push(ref.verseStart, ref.verseEnd ?? ref.verseStart);
    }
    sql += ' ORDER BY v.verse';
    const rows = getDb()
      .prepare(sql)
      .all(...params) as any[];
    out.push(...rows.map(rowToResult));
  }
  return out;
}
