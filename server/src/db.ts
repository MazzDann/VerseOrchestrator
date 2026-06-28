import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {
  parseReference,
  normalizeForSearch,
  type Translation,
  type Book,
  type Verse,
  type SearchResult,
  type StrongDefinition,
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

/**
 * Drop the cached connection so the next query reopens the database. Called after
 * a rebuild so the server serves the freshly-built library (handles the case where
 * the file was replaced, not just rewritten in place).
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
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
      `SELECT translation_id, book_number, chapter, verse, text, text_raw
       FROM verses
       WHERE translation_id = ? AND book_number = ? AND chapter = ?
       ORDER BY verse`,
    )
    .all(translationId, bookNumber, chapter) as any[];
  return rows.map((r) => ({ ...rowToVerse(r), textRaw: r.text_raw ?? undefined }));
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

function tableExists(name: string): boolean {
  return !!getDb()
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
}

export interface DictionaryInfo {
  abbr: string;
  name: string;
  language: string;
  type: string;
  isStrong: boolean;
}

export function listDictionaries(): DictionaryInfo[] {
  const rows = getDb()
    .prepare('SELECT abbr, name, language, type, is_strong FROM dictionaries ORDER BY name')
    .all() as any[];
  return rows.map((r) => ({
    abbr: r.abbr,
    name: r.name,
    language: r.language,
    type: r.type,
    isStrong: !!r.is_strong,
  }));
}

function columnExists(table: string, column: string): boolean {
  try {
    return (getDb().prepare(`PRAGMA table_info(${table})`).all() as any[]).some(
      (c) => c.name === column,
    );
  } catch {
    return false;
  }
}

/** Look up a Strong's number in any imported Strong's dictionary. */
export function lookupStrong(num: string, book?: number): StrongDefinition[] {
  const digits = String(num).match(/\d+/)?.[0];
  if (!digits) return [];
  const norm = String(Number.parseInt(digits, 10));
  const hasLang = columnExists('dictionary_entries', 'strong_lang');
  const rows = getDb()
    .prepare(
      `SELECT d.name, d.language, e.topic, e.definition,
              ${hasLang ? 'e.strong_lang' : "'' AS strong_lang"}
       FROM dictionary_entries e
       JOIN dictionaries d ON d.id = e.dictionary_id
       WHERE d.is_strong = 1 AND e.topic_norm = ?`,
    )
    .all(norm) as any[];

  // OT books (MyBible number < 470) prefer the Hebrew (H) entry; NT prefer Greek (G).
  const want = book != null && book < 470 ? 'H' : 'G';
  const rank = (r: any): number => {
    const tag = (r.strong_lang || '').toUpperCase();
    if (tag) return tag === want ? 0 : 1;
    // No per-entry tag (old build): fall back to the dictionary's own language.
    const l = (r.language || '').toLowerCase();
    const heb = l.startsWith('he') || l.startsWith('iw');
    return (want === 'H' ? heb : !heb) ? 0 : 1;
  };
  return rows
    .sort((a, b) => rank(a) - rank(b))
    .map((r) => ({
      dictionary: r.name,
      language: r.language,
      topic: r.topic,
      definition: r.definition,
    }));
}

/** Look up a plain word in explanatory (non-Strong) dictionaries. */
export function lookupWord(word: string): StrongDefinition[] {
  const norm = word.trim().toLowerCase();
  if (!norm) return [];
  const rows = getDb()
    .prepare(
      `SELECT d.name, d.language, e.topic, e.definition
       FROM dictionary_entries e
       JOIN dictionaries d ON d.id = e.dictionary_id
       WHERE d.is_strong = 0 AND e.topic_norm = ?
       LIMIT 12`,
    )
    .all(norm) as any[];
  return rows.map((r) => ({
    dictionary: r.name,
    language: r.language,
    topic: r.topic,
    definition: r.definition,
  }));
}

export interface StrongRefsResult {
  strong: number;
  /** Total occurrences matching the filter (may exceed `results.length`). */
  total: number;
  /** Whether more occurrences exist than were returned (`total > results.length`). */
  truncated: boolean;
  results: SearchResult[];
}

/**
 * Concordance: every verse that carries a given Strong number, optionally scoped
 * to one translation (so the listed verse text matches what the user is reading).
 * Served from the `verse_strongs` index built by the builder.
 */
export function strongRefs(
  num: string,
  opts: { translationId?: number; limit?: number } = {},
): StrongRefsResult {
  const digits = String(num).match(/\d+/)?.[0];
  if (!digits) return { strong: 0, total: 0, truncated: false, results: [] };
  const strong = Number.parseInt(digits, 10);
  const limit = Math.min(Math.max(opts.limit ?? 300, 1), 1000);

  if (!tableExists('verse_strongs')) {
    throw new ApiError(503, 'Strong index not built. Run: npm run build:library');
  }

  const where: string[] = ['vs.strong = ?'];
  const filterParams: any[] = [strong];
  if (opts.translationId != null) {
    where.push('vs.translation_id = ?');
    filterParams.push(opts.translationId);
  }
  const whereSql = where.join(' AND ');

  const total = (
    getDb()
      .prepare(`SELECT COUNT(*) AS n FROM verse_strongs vs WHERE ${whereSql}`)
      .get(...filterParams) as any
  ).n as number;

  const rows = getDb()
    .prepare(
      `SELECT v.translation_id, v.book_number, v.chapter, v.verse, v.text,
              b.long_name, b.short_name
       FROM verse_strongs vs
       JOIN verses v ON v.id = vs.verse_id
       JOIN books b ON b.translation_id = v.translation_id AND b.book_number = v.book_number
       WHERE ${whereSql}
       ORDER BY v.translation_id, v.book_number, v.chapter, v.verse
       LIMIT ?`,
    )
    .all(...filterParams, limit) as any[];

  return { strong, total, truncated: total > rows.length, results: rows.map(rowToResult) };
}

export interface CrossRefTarget {
  bookNumber: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}

/** Cross-references (related passages) for a verse — book/chapter/verse keyed. */
export function getCrossrefs(book: number, chapter: number, verse: number): CrossRefTarget[] {
  if (!tableExists('cross_references')) return [];
  const rows = getDb()
    .prepare(
      `SELECT book_to, chapter_to, verse_to_start, verse_to_end
       FROM cross_references
       WHERE book = ? AND chapter = ? AND verse = ?
       ORDER BY book_to, chapter_to, verse_to_start`,
    )
    .all(book, chapter, verse) as any[];
  return rows.map((r) => ({
    bookNumber: r.book_to,
    chapter: r.chapter_to,
    verseStart: r.verse_to_start,
    verseEnd: r.verse_to_end || r.verse_to_start,
  }));
}

export interface CommentaryNote {
  source: string;
  marker: string;
  text: string;
}

/** Commentary notes whose verse range covers (book, chapter, verse). */
export function getCommentary(book: number, chapter: number, verse: number): CommentaryNote[] {
  if (!tableExists('commentaries')) return [];
  const rows = getDb()
    .prepare(
      `SELECT source, marker, text FROM commentaries
       WHERE book = ?
         AND (chapter_from < ? OR (chapter_from = ? AND verse_from <= ?))
         AND (chapter_to   > ? OR (chapter_to   = ? AND verse_to   >= ?))
       ORDER BY source, chapter_from, verse_from`,
    )
    .all(book, chapter, chapter, verse, chapter, chapter, verse) as any[];
  return rows.map((r) => ({ source: r.source, marker: r.marker ?? '', text: r.text ?? '' }));
}

export interface SongInfo {
  id: number;
  number: number | null;
  title: string;
}
export interface SongSlideOut {
  text: string;
  /** Faithful pptx style {bg,color,font,bold,align,x,y,w,h} or null. */
  style: unknown | null;
}
export interface SongDetail extends SongInfo {
  slides: SongSlideOut[];
}

/** Search hymns by number (prefix) or title (diacritic-insensitive); empty query lists by number. */
export function searchSongs(q: string, limit = 60): SongInfo[] {
  if (!tableExists('songs')) return [];
  const query = q.trim();
  const db = getDb();
  let rows: any[];
  if (/^\d+$/.test(query)) {
    rows = db
      .prepare(
        `SELECT id, number, title FROM songs
         WHERE number = ? OR CAST(number AS TEXT) LIKE ?
         ORDER BY number LIMIT ?`,
      )
      .all(Number(query), `${query}%`, limit) as any[];
  } else if (query) {
    rows = db
      .prepare(
        `SELECT id, number, title FROM songs WHERE title_norm LIKE ? ORDER BY number LIMIT ?`,
      )
      .all(`%${normalizeForSearch(query)}%`, limit) as any[];
  } else {
    rows = db
      .prepare('SELECT id, number, title FROM songs ORDER BY number LIMIT ?')
      .all(limit) as any[];
  }
  return rows.map((r) => ({ id: r.id, number: r.number, title: r.title }));
}

/** A hymn with its stanzas (one per slide). */
export function getSong(id: number): SongDetail | null {
  if (!tableExists('songs')) return null;
  const s = getDb().prepare('SELECT id, number, title FROM songs WHERE id = ?').get(id) as any;
  if (!s) return null;
  const slides = (
    getDb()
      .prepare('SELECT text, render FROM song_slides WHERE song_id = ? ORDER BY ord')
      .all(id) as any[]
  ).map((r) => ({ text: r.text as string, style: r.render ? JSON.parse(r.render) : null }));
  return { id: s.id, number: s.number, title: s.title, slides };
}

export interface SearchResponse {
  kind: 'reference' | 'text' | 'empty';
  results: SearchResult[];
}

/**
 * Search either by reference ("Ів 3:16") or full text. Reference is tried first;
 * if the query does not look like a reference we fall back to FTS5 text search.
 */
/**
 * Build an FTS5 MATCH expression from a free-form query, supporting operators:
 *   "exact phrase"   → a phrase match
 *   -word / !word    → exclude (NOT)
 *   word             → prefix term ("любов" matches "любов'ю")
 * Everything is normalized the same way as the indexed column. Returns null when
 * there is nothing positive to match.
 */
function buildFtsMatch(query: string): string | null {
  const parts = query.match(/[-!]?"[^"]+"|\S+/g) ?? [];
  const pos: string[] = [];
  const neg: string[] = [];
  for (const raw of parts) {
    let p = raw;
    let exclude = false;
    if (p[0] === '-' || p[0] === '!') {
      exclude = true;
      p = p.slice(1);
    }
    const quoted = p.length >= 2 && p[0] === '"' && p[p.length - 1] === '"';
    const norm = normalizeForSearch(quoted ? p.slice(1, -1) : p);
    if (!norm) continue;
    if (quoted) {
      (exclude ? neg : pos).push(`"${norm}"`);
    } else {
      for (const w of norm.split(' ').filter(Boolean)) (exclude ? neg : pos).push(`"${w}"*`);
    }
  }
  if (pos.length === 0) return null; // pure-exclusion has no anchor to match
  let expr = pos.join(' AND ');
  if (neg.length) expr += ` NOT (${neg.join(' OR ')})`;
  return expr;
}

export function search(query: string, translationIds: number[]): SearchResponse {
  const ids = translationIds.length ? translationIds : getTranslations().map((t) => t.id);
  if (ids.length === 0) return { kind: 'empty', results: [] };

  const ref = parseReference(query);
  if (ref) {
    const results = resolveReference(query, ids);
    if (results.length) return { kind: 'reference', results };
  }

  // Strong number search: "G2424" / "H0430" → verses carrying that Strong number.
  const strongQ = query.trim().match(/^([GHgh])\s*0*(\d{1,5})$/);
  if (strongQ && tableExists('verse_strongs')) {
    const refs = strongRefs(strongQ[2], { translationId: ids[0], limit: 300 });
    return { kind: 'text', results: refs.results };
  }

  const match = buildFtsMatch(query);
  if (!match) return { kind: 'empty', results: [] };

  let rows: any[];
  try {
    rows = getDb()
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
  } catch {
    // A malformed MATCH (rare, from odd operator combos) → no results, not a 500.
    return { kind: 'empty', results: [] };
  }

  return { kind: 'text', results: rows.map(rowToResult) };
}

/** Does (book, chapter[, verse]) exist in any of the given translations? */
function locationExists(
  ids: number[],
  bookNumber: number,
  chapter: number,
  verse?: number,
): boolean {
  if (ids.length === 0) return false;
  let sql = `SELECT 1 FROM verses
             WHERE book_number = ? AND chapter = ? AND translation_id IN (${placeholders(ids.length)})`;
  const params: any[] = [bookNumber, chapter, ...ids];
  if (verse != null) {
    sql += ' AND verse = ?';
    params.push(verse);
  }
  sql += ' LIMIT 1';
  return getDb().prepare(sql).get(...params) != null;
}

function resolveReference(query: string, ids: number[]): SearchResult[] {
  const ref = parseReference(query);
  if (!ref) return [];
  const candidates = resolveBookCandidates(ref.bookToken);
  if (candidates.length === 0) return [];
  // Prefer the candidate book whose requested chapter:verse actually exists — this
  // disambiguates by validity, e.g. "іс 4:6" → Ісая (has v6) but "іс 4:7" → Ісус
  // Навин (Ісая 4 has no v7). For a range, prefer a book that has the END verse too
  // (so "іс 4:6-24" → Joshua, not Isaiah which ends at v6). Falls back to the first
  // book with the start verse, then to the best name match.
  let chosen: number | null = null;
  let firstStartOk: number | null = null;
  for (const bn of candidates) {
    if (!locationExists(ids, bn, ref.chapter, ref.verseStart)) continue;
    if (firstStartOk == null) firstStartOk = bn;
    const rangeOk =
      ref.verseEnd == null ||
      ref.verseEnd === ref.verseStart ||
      locationExists(ids, bn, ref.chapter, ref.verseEnd);
    if (rangeOk) {
      chosen = bn;
      break;
    }
  }
  const bookNumber = chosen ?? firstStartOk ?? candidates[0];

  // MyBible book numbers are canonical across modules, so the book resolved from
  // ANY translation's names is fetched from each SELECTED translation. This makes
  // reference search cross-translation: type the book in any language and read it
  // in the chosen translation (e.g. an English name to read a Hebrew text).
  const out: SearchResult[] = [];
  for (const translationId of ids) {
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
    out.push(
      ...(
        getDb()
          .prepare(sql)
          .all(...params) as any[]
      ).map(rowToResult),
    );
  }
  return out;
}

/**
 * Resolve a (normalized) book token to a canonical MyBible book number, matching
 * forgivingly across ALL translations' names (any language), not just the selected
 * ones. Three ways a token can match a stored name, scored best-first:
 *   1. the name starts with the token            ("ів" → "Ів", "john" → "John");
 *   2. the token starts at a word inside the name ("iva" → "Від Івана");
 *   3. the token starts with the name             ("іва"/"івана" → the abbr "Ів"),
 *      i.e. the user typed a longer form than the stored abbreviation.
 * Because book numbers are canonical, the resolved book is then read from whichever
 * translation the caller selected — which makes reference search cross-translation.
 * Returns ALL matching book numbers ranked best-first, so the caller can prefer the
 * one whose requested chapter:verse actually exists (validity disambiguation).
 */
export function resolveBookCandidates(token: string): number[] {
  if (token.length < 2) return []; // too short to disambiguate
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT book_number, name_norm FROM book_names
       WHERE name_norm LIKE ? OR name_norm LIKE ?
          OR (length(name_norm) >= 2 AND ? LIKE name_norm || '%')`,
    )
    .all(`${token}%`, `% ${token}%`, token) as any[];

  const best = new Map<number, number>(); // book_number -> best score
  for (const r of rows) {
    const nm = String(r.name_norm);
    let score: number;
    if (nm.startsWith(token)) score = 1000 - nm.length; // exact-ish: shorter name is more specific
    else if (nm.includes(` ${token}`)) score = 800 - nm.length; // token at a word boundary
    else if (nm.length >= 2 && token.startsWith(nm)) score = 600 + nm.length; // longer abbr is more specific
    else continue;
    const bn = r.book_number as number;
    if (!best.has(bn) || score > (best.get(bn) as number)) best.set(bn, score);
  }
  return [...best.entries()].sort((a, b) => b[1] - a[1]).map(([bn]) => bn);
}
