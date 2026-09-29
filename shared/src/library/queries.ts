import { normalizeForSearch } from '../normalize.js';
import { parseReference } from '../reference.js';
import type { Book, SearchResult, StrongDefinition, Translation, Verse } from '../types.js';
import { LibraryError, type SqlDriver, type SqlParam } from './driver.js';
import { PG_TS_CONFIG } from './postgres.js';

/**
 * Every read the app makes against a library database, written once against the
 * engine-agnostic SqlDriver (driver.ts). The server serves these over HTTP; the browser
 * engines (SQLite-WASM, PGlite) run the very same functions locally. Postgres differs
 * only in schema probes and full-text search (`pg` branches); `?` placeholders are
 * rewritten by its driver (pgPlaceholders).
 */

export interface DictionaryInfo {
  abbr: string;
  name: string;
  language: string;
  type: string;
  isStrong: boolean;
}

export interface StrongRefsResult {
  strong: number;
  /** Total occurrences matching the filter (may exceed `results.length`). */
  total: number;
  /** Whether more occurrences exist than were returned (`total > results.length`). */
  truncated: boolean;
  results: SearchResult[];
}

export interface CrossRefTarget {
  bookNumber: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}

export interface CommentaryNote {
  source: string;
  marker: string;
  text: string;
}

export interface SongInfo {
  id: number;
  number: number | null;
  title: string;
  /** The song bundle's name (0.10.0); '' in a library built before bundles. */
  bundle: string;
}
export interface SongSlideOut {
  text: string;
  /** Faithful pptx style {bg,color,font,bold,align,x,y,w,h} or null. */
  style: unknown | null;
}
export interface SongDetail extends SongInfo {
  slides: SongSlideOut[];
}

export interface SearchResponse {
  kind: 'reference' | 'text' | 'empty';
  results: SearchResult[];
  /** Alternative books for an ambiguous reference token ("did you mean…"). */
  suggestions?: SearchResult[];
}

// Rows come back loosely typed from any engine; map them explicitly.
type AnyRow = any;

function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(',');
}

function rowToVerse(r: AnyRow): Verse {
  return {
    translationId: r.translation_id,
    bookNumber: r.book_number,
    chapter: r.chapter,
    verse: r.verse,
    text: r.text,
  };
}

function rowToResult(r: AnyRow): SearchResult {
  return { ...rowToVerse(r), longName: r.long_name, shortName: r.short_name };
}

/** A positive search term: exact word, prefix, or the words of a quoted phrase. */
export interface FtsTerm {
  word: string;
  prefix: boolean;
}

/** One search clause: a prefix word, or the exact words of a quoted phrase. */
interface SearchClause {
  words: string[];
  phrase: boolean;
}

/**
 * Parse a free-form text query, supporting operators:
 *   "exact phrase"   → a phrase match
 *   -word / !word    → exclude (NOT)
 *   word             → prefix term ("любов" matches "любов'ю")
 * Everything is normalized the same way as the indexed column. Engine-neutral: FTS5
 * (parseFtsQuery) and Postgres (tsQuery) render the same clauses.
 */
function parseSearchClauses(query: string): { pos: SearchClause[]; neg: SearchClause[] } {
  const parts = query.match(/[-!]?"[^"]+"|\S+/g) ?? [];
  const pos: SearchClause[] = [];
  const neg: SearchClause[] = [];
  for (const raw of parts) {
    let p = raw;
    let exclude = false;
    if (p[0] === '-' || p[0] === '!') {
      exclude = true;
      p = p.slice(1);
    }
    const quoted = p.length >= 2 && p[0] === '"' && p[p.length - 1] === '"';
    const words = normalizeForSearch(quoted ? p.slice(1, -1) : p)
      .split(' ')
      .filter(Boolean);
    if (words.length === 0) continue;
    const into = exclude ? neg : pos;
    if (quoted) into.push({ words, phrase: true });
    else for (const w of words) into.push({ words: [w], phrase: false });
  }
  return { pos, neg };
}

/**
 * The query as an FTS5 MATCH expression. `terms` lists the positive words (for the
 * planner's frequency estimate). `expr` is null when there is nothing positive to match.
 */
export function parseFtsQuery(query: string): { expr: string | null; terms: FtsTerm[] } {
  const { pos, neg } = parseSearchClauses(query);
  const terms = pos.flatMap((c) => c.words.map((word) => ({ word, prefix: !c.phrase })));
  const fts5 = (c: SearchClause) => (c.phrase ? `"${c.words.join(' ')}"` : `"${c.words[0]}"*`);
  if (pos.length === 0) return { expr: null, terms }; // pure-exclusion has no anchor to match
  let expr = pos.map(fts5).join(' AND ');
  if (neg.length) expr += ` NOT (${neg.map(fts5).join(' OR ')})`;
  return { expr, terms };
}

/**
 * The same query as a Postgres tsquery (to_tsquery syntax): 'word':* for prefixes,
 * 'a' <-> 'b' for phrases, & / ! / | for AND / NOT / OR. null when nothing positive.
 */
export function tsQuery(query: string): string | null {
  const { pos, neg } = parseSearchClauses(query);
  if (pos.length === 0) return null;
  const lexeme = (w: string) => `'${w.replace(/'/g, "''")}'`;
  const clause = (c: SearchClause) =>
    c.phrase ? `(${c.words.map(lexeme).join(' <-> ')})` : `${lexeme(c.words[0])}:*`;
  let q = pos.map(clause).join(' & ');
  if (neg.length) q += ` & !(${neg.map(clause).join(' | ')})`;
  return q;
}

/** Smallest string greater than every string starting with `s` (prefix range end). */
function prefixEnd(s: string): string {
  const last = s.codePointAt(s.length - 1)!;
  return s.slice(0, s.length - String.fromCodePoint(last).length) + String.fromCodePoint(last + 1);
}

/**
 * Full-text planner thresholds, calibrated on the 20-translation / 537k-verse library
 * (npm run bench:db, 0.3.2). Filtering by translation INSIDE the MATCH (the segmented
 * `tr` token) costs ~1 ms per selected translation's posting list; filtering AFTER the
 * MATCH costs ~2 µs per matching verse in the whole library. So:
 *   rare word (few matches)          → post-filter  («никодим» 0.1 ms vs 1–20 ms)
 *   frequent word, ≤ 60 % selected   → in-MATCH     («бог» ×1: 9 ms vs 56 ms)
 *   frequent word, most selected     → post-filter  («бог» ×20: 78 ms vs 113 ms)
 */
export const FTS_RARE_DOCS = 5000;
export const FTS_SEGMENT_SHARE = 0.6;

/** Levenshtein edit distance (small strings — book name tokens). */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export type Library = ReturnType<typeof createLibrary>;

/**
 * Bind the queries to one open database. Schema probes (which optional tables/columns
 * exist) are cached per instance — create a new instance after the file is rebuilt.
 */
export function createLibrary(db: SqlDriver) {
  const pg = db.dialect === 'postgres';
  const tables = new Map<string, boolean>();
  const tableExists = async (name: string): Promise<boolean> => {
    if (!tables.has(name)) {
      const sql = pg
        ? 'SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ?'
        : "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?";
      tables.set(name, !!(await db.get(sql, [name])));
    }
    return tables.get(name)!;
  };
  const columns = new Map<string, boolean>();
  const columnExists = async (table: string, column: string): Promise<boolean> => {
    const key = `${table}.${column}`;
    if (!columns.has(key)) {
      let ok = false;
      try {
        const cols = pg
          ? await db.all<AnyRow>(
              'SELECT column_name AS name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?',
              [table],
            )
          : await db.all<AnyRow>(`PRAGMA table_info(${table})`);
        ok = cols.some((c) => c.name === column);
      } catch {
        ok = false;
      }
      columns.set(key, ok);
    }
    return columns.get(key)!;
  };

  async function getTranslations(): Promise<Translation[]> {
    const rows = await db.all<AnyRow>(
      'SELECT id, abbr, title, language, rtl, has_strong FROM translations ORDER BY abbr',
    );
    return rows.map((r) => ({
      id: r.id,
      abbr: r.abbr,
      title: r.title,
      language: r.language,
      rtl: !!r.rtl,
      hasStrong: !!r.has_strong,
    }));
  }

  async function getBooks(translationId: number): Promise<Book[]> {
    const rows = await db.all<AnyRow>(
      'SELECT book_number, short_name, long_name, color FROM books WHERE translation_id = ? ORDER BY book_number',
      [translationId],
    );
    return rows.map((r) => ({
      bookNumber: r.book_number,
      shortName: r.short_name,
      longName: r.long_name,
      color: r.color,
    }));
  }

  async function getChapters(translationId: number, bookNumber: number): Promise<number[]> {
    const rows = await db.all<AnyRow>(
      'SELECT DISTINCT chapter FROM verses WHERE translation_id = ? AND book_number = ? ORDER BY chapter',
      [translationId, bookNumber],
    );
    return rows.map((r) => r.chapter);
  }

  async function getVerses(
    translationId: number,
    bookNumber: number,
    chapter: number,
  ): Promise<Verse[]> {
    const rows = await db.all<AnyRow>(
      `SELECT translation_id, book_number, chapter, verse, text, text_raw
       FROM verses
       WHERE translation_id = ? AND book_number = ? AND chapter = ?
       ORDER BY verse`,
      [translationId, bookNumber, chapter],
    );
    return rows.map((r) => ({ ...rowToVerse(r), textRaw: r.text_raw ?? undefined }));
  }

  async function listDictionaries(): Promise<DictionaryInfo[]> {
    if (!(await tableExists('dictionaries'))) return [];
    const rows = await db.all<AnyRow>(
      'SELECT abbr, name, language, type, is_strong FROM dictionaries ORDER BY name',
    );
    return rows.map((r) => ({
      abbr: r.abbr,
      name: r.name,
      language: r.language,
      type: r.type,
      isStrong: !!r.is_strong,
    }));
  }

  /** Look up a Strong's number in any imported Strong's dictionary. */
  async function lookupStrong(num: string, book?: number): Promise<StrongDefinition[]> {
    const digits = String(num).match(/\d+/)?.[0];
    if (!digits || !(await tableExists('dictionary_entries'))) return [];
    const norm = String(Number.parseInt(digits, 10));
    const hasLang = await columnExists('dictionary_entries', 'strong_lang');
    const rows = await db.all<AnyRow>(
      `SELECT d.name, d.language, e.topic, e.definition,
              ${hasLang ? 'e.strong_lang' : "'' AS strong_lang"}
       FROM dictionary_entries e
       JOIN dictionaries d ON d.id = e.dictionary_id
       WHERE d.is_strong = 1 AND e.topic_norm = ?`,
      [norm],
    );

    // OT books (MyBible number < 470) prefer the Hebrew (H) entry; NT prefer Greek (G).
    const want = book != null && book < 470 ? 'H' : 'G';
    const rank = (r: AnyRow): number => {
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
  async function lookupWord(word: string): Promise<StrongDefinition[]> {
    const norm = word.trim().toLowerCase();
    if (!norm || !(await tableExists('dictionary_entries'))) return [];
    const rows = await db.all<AnyRow>(
      `SELECT d.name, d.language, e.topic, e.definition
       FROM dictionary_entries e
       JOIN dictionaries d ON d.id = e.dictionary_id
       WHERE d.is_strong = 0 AND e.topic_norm = ?
       LIMIT 12`,
      [norm],
    );
    return rows.map((r) => ({
      dictionary: r.name,
      language: r.language,
      topic: r.topic,
      definition: r.definition,
    }));
  }

  /**
   * Concordance: every verse that carries a given Strong number, optionally scoped
   * to one translation (so the listed verse text matches what the user is reading).
   * Served from the `verse_strongs` index built by the builder.
   */
  async function strongRefs(
    num: string,
    opts: { translationId?: number; limit?: number; lang?: 'H' | 'G' } = {},
  ): Promise<StrongRefsResult> {
    const digits = String(num).match(/\d+/)?.[0];
    if (!digits) return { strong: 0, total: 0, truncated: false, results: [] };
    const strong = Number.parseInt(digits, 10);
    // "G2424" / "H2424": the prefix picks the lexicon (the number alone is ambiguous).
    const prefix = String(num).trim().charAt(0).toUpperCase();
    const lang = opts.lang ?? (prefix === 'G' || prefix === 'H' ? prefix : undefined);
    const limit = Math.min(Math.max(opts.limit ?? 300, 1), 1000);

    if (!(await tableExists('verse_strongs'))) {
      throw new LibraryError(503, 'Strong index not built. Run: npm run build:library');
    }

    const where: string[] = ['vs.strong = ?'];
    const filterParams: SqlParam[] = [strong];
    if (lang && (await columnExists('verse_strongs', 'lang'))) {
      where.push('vs.lang = ?');
      filterParams.push(lang);
    }
    if (opts.translationId != null) {
      where.push('vs.translation_id = ?');
      filterParams.push(opts.translationId);
    }
    const whereSql = where.join(' AND ');

    const total = Number(
      (
        await db.get<AnyRow>(
          `SELECT COUNT(*) AS n FROM verse_strongs vs WHERE ${whereSql}`,
          filterParams,
        )
      )?.n ?? 0,
    );

    const rows = await db.all<AnyRow>(
      `SELECT v.translation_id, v.book_number, v.chapter, v.verse, v.text,
              b.long_name, b.short_name
       FROM verse_strongs vs
       JOIN verses v ON v.id = vs.verse_id
       JOIN books b ON b.translation_id = v.translation_id AND b.book_number = v.book_number
       WHERE ${whereSql}
       ORDER BY v.translation_id, v.book_number, v.chapter, v.verse
       LIMIT ?`,
      [...filterParams, limit],
    );

    return { strong, total, truncated: total > rows.length, results: rows.map(rowToResult) };
  }

  /** Cross-references (related passages) for a verse — book/chapter/verse keyed. */
  async function getCrossrefs(
    book: number,
    chapter: number,
    verse: number,
  ): Promise<CrossRefTarget[]> {
    if (!(await tableExists('cross_references'))) return [];
    const rows = await db.all<AnyRow>(
      `SELECT book_to, chapter_to, verse_to_start, verse_to_end
       FROM cross_references
       WHERE book = ? AND chapter = ? AND verse = ?
       ORDER BY book_to, chapter_to, verse_to_start`,
      [book, chapter, verse],
    );
    return rows.map((r) => ({
      bookNumber: r.book_to,
      chapter: r.chapter_to,
      verseStart: r.verse_to_start,
      verseEnd: r.verse_to_end || r.verse_to_start,
    }));
  }

  /** Commentary notes whose verse range covers (book, chapter, verse). */
  async function getCommentary(
    book: number,
    chapter: number,
    verse: number,
  ): Promise<CommentaryNote[]> {
    if (!(await tableExists('commentaries'))) return [];
    const rows = await db.all<AnyRow>(
      `SELECT source, marker, text FROM commentaries
       WHERE book = ?
         AND (chapter_from < ? OR (chapter_from = ? AND verse_from <= ?))
         AND (chapter_to   > ? OR (chapter_to   = ? AND verse_to   >= ?))
       ORDER BY source, chapter_from, verse_from`,
      [book, chapter, chapter, verse, chapter, chapter, verse],
    );
    return rows.map((r) => ({ source: r.source, marker: r.marker ?? '', text: r.text ?? '' }));
  }

  /** The song columns this library has (`bundle` since 0.10.0). */
  const songColumns = async (): Promise<string> =>
    (await columnExists('songs', 'bundle'))
      ? 'id, number, title, bundle'
      : `id, number, title, '' AS bundle`;

  /** The song bundles in the library, by name (0.10.0). */
  async function listSongBundles(): Promise<{ name: string; count: number }[]> {
    if (!(await tableExists('songs')) || !(await columnExists('songs', 'bundle'))) return [];
    const rows = await db.all<AnyRow>(
      `SELECT bundle AS name, COUNT(*) AS count FROM songs
       WHERE bundle IS NOT NULL GROUP BY bundle ORDER BY bundle`,
    );
    return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
  }

  /**
   * Search songs by number (prefix) or title (diacritic-insensitive); an empty query lists
   * them by number. `bundle` narrows the search to one bundle.
   */
  async function searchSongs(q: string, limit = 60, bundle?: string): Promise<SongInfo[]> {
    if (!(await tableExists('songs'))) return [];
    const cols = await songColumns();
    const inBundle = bundle && cols.endsWith(', bundle') ? ' AND bundle = ?' : '';
    const bundleArg = inBundle ? [bundle!] : [];
    const query = q.trim();
    let rows: AnyRow[];
    if (/^\d+$/.test(query)) {
      rows = await db.all(
        `SELECT ${cols} FROM songs
         WHERE (number = ? OR CAST(number AS TEXT) LIKE ?)${inBundle}
         ORDER BY number, bundle LIMIT ?`,
        [Number(query), `${query}%`, ...bundleArg, limit],
      );
    } else if (query) {
      rows = await db.all(
        `SELECT ${cols} FROM songs WHERE title_norm LIKE ?${inBundle}
         ORDER BY number, bundle LIMIT ?`,
        [`%${normalizeForSearch(query)}%`, ...bundleArg, limit],
      );
    } else {
      rows = await db.all(
        `SELECT ${cols} FROM songs WHERE 1 = 1${inBundle} ORDER BY number, bundle LIMIT ?`,
        [...bundleArg, limit],
      );
    }
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      bundle: r.bundle ?? '',
    }));
  }

  /** A song with its stanzas (one per slide). */
  async function getSong(id: number): Promise<SongDetail | null> {
    if (!(await tableExists('songs'))) return null;
    const s = await db.get<AnyRow>(`SELECT ${await songColumns()} FROM songs WHERE id = ?`, [id]);
    if (!s) return null;
    const slides = (
      await db.all<AnyRow>('SELECT text, render FROM song_slides WHERE song_id = ? ORDER BY ord', [
        id,
      ])
    ).map((r) => ({ text: r.text as string, style: r.render ? JSON.parse(r.render) : null }));
    return { id: s.id, number: s.number, title: s.title, bundle: s.bundle ?? '', slides };
  }

  /** Does (book, chapter[, verse]) exist in any of the given translations? */
  async function locationExists(
    ids: number[],
    bookNumber: number,
    chapter: number,
    verse?: number,
  ): Promise<boolean> {
    if (ids.length === 0) return false;
    let sql = `SELECT 1 FROM verses
               WHERE book_number = ? AND chapter = ? AND translation_id IN (${placeholders(ids.length)})`;
    const params: SqlParam[] = [bookNumber, chapter, ...ids];
    if (verse != null) {
      sql += ' AND verse = ?';
      params.push(verse);
    }
    sql += ' LIMIT 1';
    return (await db.get(sql, params)) != null;
  }

  /**
   * Resolve a (normalized) book token to canonical MyBible book numbers, matching
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
  async function resolveBookCandidates(token: string): Promise<number[]> {
    if (token.length < 2) return []; // too short to disambiguate
    const rows = await db.all<AnyRow>(
      `SELECT DISTINCT book_number, name_norm FROM book_names
       WHERE name_norm LIKE ? OR name_norm LIKE ?
          OR (length(name_norm) >= 2 AND ? LIKE name_norm || '%')`,
      [`${token}%`, `% ${token}%`, token],
    );

    const best = new Map<number, number>(); // book_number -> best score
    for (const r of rows) {
      const nm = String(r.name_norm);
      let score: number;
      if (nm.startsWith(token))
        score = 1000 - nm.length; // exact-ish: shorter name is more specific
      else if (nm.includes(` ${token}`))
        score = 800 - nm.length; // token at a word boundary
      else if (nm.length >= 2 && token.startsWith(nm))
        score = 600 + nm.length; // longer abbr is more specific
      else continue;
      const bn = r.book_number as number;
      if (!best.has(bn) || score > (best.get(bn) as number)) best.set(bn, score);
    }

    // Fuzzy fallback for typos ("навен" → "навин") — only when nothing matched exactly,
    // so normal queries stay fast and unambiguous. Tolerance scales with token length.
    if (best.size === 0 && token.length >= 3) {
      const tol = Math.max(1, Math.floor(token.length / 4));
      const all = await db.all<AnyRow>('SELECT DISTINCT book_number, name_norm FROM book_names');
      for (const r of all) {
        const nm = String(r.name_norm);
        // Compare against the closest single word of the name (book names may be multi-word).
        let dmin = Infinity;
        for (const w of [nm, ...nm.split(' ')]) {
          if (Math.abs(w.length - token.length) > tol) continue;
          const d = editDistance(token, w);
          if (d < dmin) dmin = d;
        }
        if (dmin <= tol) {
          const score = 400 - dmin * 20 - nm.length;
          const bn = r.book_number as number;
          if (!best.has(bn) || score > (best.get(bn) as number)) best.set(bn, score);
        }
      }
    }

    return [...best.entries()].sort((a, b) => b[1] - a[1]).map(([bn]) => bn);
  }

  async function resolveReference(
    query: string,
    ids: number[],
  ): Promise<{ results: SearchResult[]; suggestions: SearchResult[] }> {
    const ref = parseReference(query);
    if (!ref) return { results: [], suggestions: [] };
    const candidates = await resolveBookCandidates(ref.bookToken);
    if (candidates.length === 0) return { results: [], suggestions: [] };
    // Prefer the candidate book whose requested chapter:verse actually exists — this
    // disambiguates by validity, e.g. "іс 4:6" → Ісая (has v6) but "іс 4:7" → Ісус
    // Навин (Ісая 4 has no v7). For a range, prefer a book that has the END verse too
    // (so "іс 4:6-24" → Joshua, not Isaiah which ends at v6). Falls back to the first
    // book with the start verse, then to the best name match.
    let chosen: number | null = null;
    let firstStartOk: number | null = null;
    for (const bn of candidates) {
      if (!(await locationExists(ids, bn, ref.chapter, ref.verseStart))) continue;
      if (firstStartOk == null) firstStartOk = bn;
      const rangeOk =
        ref.verseEnd == null ||
        ref.verseEnd === ref.verseStart ||
        (await locationExists(ids, bn, ref.chapter, ref.verseEnd));
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
      const params: SqlParam[] = [translationId, bookNumber, ref.chapter];
      if (ref.verseStart != null) {
        sql += ' AND v.verse BETWEEN ? AND ?';
        params.push(ref.verseStart, ref.verseEnd ?? ref.verseStart);
      }
      sql += ' ORDER BY v.verse';
      out.push(...(await db.all<AnyRow>(sql, params)).map(rowToResult));
    }

    // "Did you mean…": other candidate books that also have this chapter:verse, so an
    // ambiguous abbreviation offers the alternatives (e.g. "іс 5:1" → Ісая, suggest
    // Ісус Навин 5:1). One representative verse each, from the primary translation.
    const suggestions: SearchResult[] = [];
    const sugSql = `SELECT v.translation_id, v.book_number, v.chapter, v.verse, v.text,
                           b.long_name, b.short_name
                    FROM verses v
                    JOIN books b ON b.translation_id = v.translation_id AND b.book_number = v.book_number
                    WHERE v.translation_id = ? AND v.book_number = ? AND v.chapter = ? AND v.verse = ?
                    LIMIT 1`;
    for (const bn of candidates) {
      if (bn === bookNumber || suggestions.length >= 4) continue;
      if (!(await locationExists(ids, bn, ref.chapter, ref.verseStart))) continue;
      const row = await db.get<AnyRow>(sugSql, [ids[0], bn, ref.chapter, ref.verseStart ?? 1]);
      if (row) suggestions.push(rowToResult(row));
    }
    return { results: out, suggestions };
  }

  /**
   * Upper bound on verses matching all positive terms = the rarest term's document
   * count (from the fts5vocab view over the index; a prefix sums its term range).
   * null when the vocab view is absent (older library).
   */
  async function estimateDocs(terms: FtsTerm[]): Promise<number | null> {
    if (terms.length === 0 || !(await tableExists('verses_fts_vocab'))) return null;
    let min = Infinity;
    for (const t of terms) {
      const row = t.prefix
        ? await db.get<AnyRow>(
            'SELECT SUM(doc) AS d FROM verses_fts_vocab WHERE term >= ? AND term < ?',
            [t.word, prefixEnd(t.word)],
          )
        : await db.get<AnyRow>('SELECT doc AS d FROM verses_fts_vocab WHERE term = ?', [t.word]);
      min = Math.min(min, Number(row?.d ?? 0));
      if (min < FTS_RARE_DOCS) break; // already decided: rare
    }
    return min;
  }

  let translationCount: number | null = null;
  /** Choose where to filter by translation (see FTS_RARE_DOCS / FTS_SEGMENT_SHARE). */
  async function ftsStrategy(terms: FtsTerm[], selected: number): Promise<'in-match' | 'post'> {
    translationCount ??= (await getTranslations()).length;
    const docs = await estimateDocs(terms);
    if (docs != null && docs < FTS_RARE_DOCS) return 'post';
    return selected <= Math.max(1, translationCount * FTS_SEGMENT_SHARE) ? 'in-match' : 'post';
  }

  /**
   * Search either by reference ("Ів 3:16") or full text. Reference is tried first;
   * if the query does not look like a reference we fall back to FTS5 text search.
   */
  async function search(query: string, translationIds: number[]): Promise<SearchResponse> {
    const ids = translationIds.length ? translationIds : (await getTranslations()).map((t) => t.id);
    if (ids.length === 0) return { kind: 'empty', results: [] };

    const ref = parseReference(query);
    if (ref) {
      const { results, suggestions } = await resolveReference(query, ids);
      if (results.length) return { kind: 'reference', results, suggestions };
    }

    // Strong number search: "G2424" / "H0430" → verses carrying that Strong number.
    const strongQ = query.trim().match(/^([GHgh])\s*0*(\d{1,5})$/);
    if (strongQ && (await tableExists('verse_strongs'))) {
      const refs = await strongRefs(strongQ[2], {
        translationId: ids[0],
        limit: 300,
        lang: strongQ[1].toUpperCase() as 'H' | 'G',
      });
      return { kind: 'text', results: refs.results };
    }

    if (pg) {
      // Postgres: tsvector + GIN; the translation filter is a plain column predicate.
      const q = tsQuery(query);
      if (!q) return { kind: 'empty', results: [] };
      try {
        const rows = await db.all<AnyRow>(
          `SELECT v.translation_id, v.book_number, v.chapter, v.verse, v.text,
                  b.long_name, b.short_name
           FROM to_tsquery('${PG_TS_CONFIG}', ?) q
           JOIN verses_fts f ON f.tsv @@ q
           JOIN verses v ON v.id = f.id
           JOIN books b ON b.translation_id = v.translation_id AND b.book_number = v.book_number
           WHERE f.translation_id IN (${placeholders(ids.length)})
           ORDER BY ts_rank(f.tsv, q) DESC, f.id
           LIMIT 300`,
          [q, ...ids],
        );
        return { kind: 'text', results: rows.map(rowToResult) };
      } catch {
        return { kind: 'empty', results: [] };
      }
    }

    const { expr: match, terms } = parseFtsQuery(query);
    if (!match) return { kind: 'empty', results: [] };

    let rows: AnyRow[];
    try {
      const segmented = await columnExists('verses_fts', 'tr');
      if (segmented && (await ftsStrategy(terms, ids.length)) === 'in-match') {
        // Segmented index (0.3.2+): restrict to the selected translations INSIDE the
        // MATCH, so FTS intersects posting lists instead of ranking the whole library.
        // bm25 weight 0 for the `tr` column: it's a filter, not relevance.
        const tr = ids.map((id) => `t${id}`).join(' OR ');
        rows = await db.all(
          `SELECT v.translation_id, v.book_number, v.chapter, v.verse, v.text,
                  b.long_name, b.short_name
           FROM verses_fts
           JOIN verses v ON v.id = verses_fts.rowid
           JOIN books b ON b.translation_id = v.translation_id AND b.book_number = v.book_number
           WHERE verses_fts MATCH ?
           ORDER BY bm25(verses_fts, 1.0, 0.0)
           LIMIT 300`,
          [`{text_norm}: (${match}) AND {tr}: (${tr})`],
        );
      } else if (segmented) {
        // Segmented index, but post-filtering is cheaper here (rare word, or most
        // translations selected). Restrict the text to its column so `tr` tokens can't match.
        rows = await db.all(
          `SELECT v.translation_id, v.book_number, v.chapter, v.verse, v.text,
                  b.long_name, b.short_name
           FROM verses_fts
           JOIN verses v ON v.id = verses_fts.rowid
           JOIN books b ON b.translation_id = v.translation_id AND b.book_number = v.book_number
           WHERE verses_fts MATCH ? AND v.translation_id IN (${placeholders(ids.length)})
           ORDER BY bm25(verses_fts, 1.0, 0.0)
           LIMIT 300`,
          [`{text_norm}: (${match})`, ...ids],
        );
      } else {
        // Older libraries: one shared index, filter by translation after matching.
        rows = await db.all(
          `SELECT v.translation_id, v.book_number, v.chapter, v.verse, v.text,
                  b.long_name, b.short_name
           FROM verses_fts
           JOIN verses v ON v.id = verses_fts.rowid
           JOIN books b ON b.translation_id = v.translation_id AND b.book_number = v.book_number
           WHERE verses_fts MATCH ? AND v.translation_id IN (${placeholders(ids.length)})
           ORDER BY rank
           LIMIT 300`,
          [match, ...ids],
        );
      }
    } catch {
      // A malformed MATCH (rare, from odd operator combos) → no results, not a 500.
      return { kind: 'empty', results: [] };
    }

    return { kind: 'text', results: rows.map(rowToResult) };
  }

  return {
    getTranslations,
    getBooks,
    getChapters,
    getVerses,
    listDictionaries,
    lookupStrong,
    lookupWord,
    strongRefs,
    getCrossrefs,
    getCommentary,
    searchSongs,
    listSongBundles,
    getSong,
    search,
    resolveBookCandidates,
  };
}
