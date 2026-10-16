import { normalizeForSearch } from '../normalize.js';
import { parseReference } from '../reference.js';
import { explainMorphology, morphologyKeys, type MorphologyMeaning } from './morphology.js';
import type {
  Book,
  LibraryStats,
  SearchResult,
  StrongDefinition,
  SubheadingSet,
  Translation,
  Verse,
} from '../types.js';
import { LibraryError, type SqlDriver, type SqlParam } from './driver.js';
import { PG_TS_CONFIG } from './postgres.js';
import { pgVector } from './vectors.js';
import { nearest, type ChapterVectors } from '../embed/vectors.js';
import {
  blendVectors,
  capitalizeWords,
  closenessOf,
  DEFAULT_RANKING,
  inQueryLanguage,
  MEANING_MIN,
  meaningStems,
} from './meaning.js';
import { EMBED_MODELS, isEmbedModelId } from '../embed/models.js';

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

/** A document in the library (1.17.0-beta.1): a file of modules/documents. */
export interface DocumentInfo {
  id: number;
  title: string;
  file: string;
  kind: string;
  units: number;
}
export interface DocUnitOut {
  ord: number;
  kind: 'heading' | 'para' | 'quote' | 'item';
  level: number;
  /** the ord of the heading this unit stands under; -1 before the first heading */
  section: number;
  text: string;
}
/** A Bible reference inside a unit (1.17.0-beta.2): where it stands and the verses it names. */
export interface DocRefOut {
  ord: number;
  pos: number;
  len: number;
  book: number;
  chapter: number;
  from: number;
  to: number;
}
export interface DocumentDetail extends DocumentInfo {
  body: DocUnitOut[];
  refs: DocRefOut[];
}
/** A unit found by its words or by a verse it cites. */
export interface DocUnitHit {
  docId: number;
  title: string;
  ord: number;
  text: string;
}

export interface SearchResponse {
  /** `meaning`: «~ …», found by meaning (1.15.0-beta.2), the nearest first */
  kind: 'reference' | 'text' | 'meaning' | 'empty';
  results: SearchResult[];
  /** Alternative books for an ambiguous reference token ("did you mean…"). */
  suggestions?: SearchResult[];
  /**
   * «~ …» found nothing because a part is missing: no model chosen or downloaded (`model`), or
   * none of the asked translations has its vectors yet (`vectors`).
   */
  missing?: 'model' | 'vectors';
}

/** What a query by meaning needs of the engine's host: the query's vector, by the chosen model. */
export interface LibraryOptions {
  /**
   * `models`: those the asked translations have whole vectors of — a host with a model of its
   * own (the server) answers with it anyway; the browser picks one of them.
   */
  embed?: (text: string, models: string[]) => Promise<{ model: string; vec: Int8Array } | null>;
}

/** «~ слова» — a search by meaning; the rest of the query is what to look for. */
export const MEANING_PREFIX = /^\s*~\s*/;
const INT = 'CAST(? AS INTEGER)';

/** How many places a query by meaning returns, at most. */
export const MEANING_LIMIT = 60;
/** How many places of the query's language are weighed: the vectors' nearest, the word-richest. */
const MEANING_POOL = 200;
/** A word in more verses than this is common anyway: its count stops there. */
const STEM_CAP = 3000;

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
export function createLibrary(db: SqlDriver, opts: LibraryOptions = {}) {
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

  /**
   * Chapter lengths (1.8.12-beta.5, versification.ts): each chapter's last verse number, for the
   * translations and books asked — what aligns their numberings. Empty lists ask for nothing.
   */
  async function chapterProfiles(
    translationIds: number[],
    bookNumbers: number[],
  ): Promise<{ translationId: number; bookNumber: number; chapter: number; verses: number }[]> {
    const ids = translationIds.filter((n) => Number.isInteger(n) && n > 0).slice(0, 64);
    const books = bookNumbers.filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
    if (ids.length === 0 || books.length === 0) return [];
    const rows = await db.all<AnyRow>(
      `SELECT translation_id, book_number, chapter, MAX(verse) AS verses FROM verses
        WHERE translation_id IN (${placeholders(ids.length)}) AND book_number IN (${placeholders(books.length)})
        GROUP BY translation_id, book_number, chapter
        ORDER BY translation_id, book_number, chapter`,
      [...ids, ...books],
    );
    return rows.map((r) => ({
      translationId: Number(r.translation_id),
      bookNumber: Number(r.book_number),
      chapter: Number(r.chapter),
      verses: Number(r.verses),
    }));
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

    // OT books (canonical number < 470) prefer the Hebrew (H) entry; NT prefer Greek (G).
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

  /**
   * A grammar code explained (1.16.0-beta.2) — «V-AAI-3S» → «Verb · Aor Act Ind · 3rd Sing» — by
   * every dictionary that carries the codes. An older library has none.
   */
  async function decodeMorphology(code: string): Promise<MorphologyMeaning[]> {
    const c = code.trim();
    if (!c || c.length > 64 || !(await tableExists('morphology'))) return [];
    const keys = morphologyKeys(c);
    const rows = await db.all<AnyRow>(
      `SELECT d.name, m.indication, m.applicable_to, m.meaning
       FROM morphology m JOIN dictionaries d ON d.id = m.dictionary_id
       WHERE m.indication IN (${keys.map(() => '?').join(', ')})
       ORDER BY d.name`,
      keys,
    );
    return explainMorphology(
      c,
      rows.map((r) => ({
        dictionary: String(r.name),
        indication: String(r.indication),
        applicableTo: String(r.applicable_to ?? ''),
        meaning: String(r.meaning),
      })),
    );
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

  /** The documents (1.17.0-beta.1), by title; none in a library built before them. */
  async function listDocuments(): Promise<DocumentInfo[]> {
    if (!(await tableExists('documents'))) return [];
    const rows = await db.all<AnyRow>(
      'SELECT id, title, file, kind, units FROM documents ORDER BY title, file',
    );
    return rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      file: r.file,
      kind: r.kind,
      units: Number(r.units),
    }));
  }

  /** A document with all its units, in order. */
  async function getDocument(id: number): Promise<DocumentDetail | null> {
    if (!(await tableExists('documents'))) return null;
    const d = await db.get<AnyRow>(
      'SELECT id, title, file, kind, units FROM documents WHERE id = ?',
      [id],
    );
    if (!d) return null;
    const units = await db.all<AnyRow>(
      `SELECT ord, kind, level, section, text FROM doc_units
       WHERE document_id = ? ORDER BY ord`,
      [id],
    );
    const refs = (await tableExists('doc_refs'))
      ? await db.all<AnyRow>(
          `SELECT ord, pos, len, book_number, chapter, verse_from, verse_to FROM doc_refs
           WHERE document_id = ? ORDER BY ord, pos`,
          [id],
        )
      : [];
    return {
      id: Number(d.id),
      title: d.title,
      file: d.file,
      kind: d.kind,
      units: Number(d.units),
      refs: refs.map((r) => ({
        ord: Number(r.ord),
        pos: Number(r.pos),
        len: Number(r.len),
        book: Number(r.book_number),
        chapter: Number(r.chapter),
        from: Number(r.verse_from),
        to: Number(r.verse_to),
      })),
      body: units.map((u) => ({
        ord: Number(u.ord),
        kind: u.kind,
        level: Number(u.level),
        section: Number(u.section),
        text: u.text,
      })),
    };
  }

  const unitHits = (rows: AnyRow[]): DocUnitHit[] =>
    rows.map((r) => ({ docId: Number(r.id), title: r.title, ord: Number(r.ord), text: r.text }));

  /**
   * Units holding every word of the query (1.17.0-beta.2), any document — the words as typed,
   * normalized like the verses (й → и, no accents), each anywhere in the unit.
   */
  async function searchDocuments(q: string, limit = 60): Promise<DocUnitHit[]> {
    const words = normalizeForSearch(q).split(' ').filter(Boolean).slice(0, 8);
    if (words.length === 0 || !(await tableExists('doc_units'))) return [];
    const rows = await db.all<AnyRow>(
      `SELECT d.id, d.title, u.ord, u.text FROM doc_units u JOIN documents d ON d.id = u.document_id
       WHERE ${words.map(() => 'u.text_norm LIKE ?').join(' AND ')}
       ORDER BY d.title, u.ord LIMIT ?`,
      [...words.map((w) => `%${w}%`), limit],
    );
    return unitHits(rows);
  }

  /** The units that cite a verse (or a chapter, without one) — «Документи» beside the Bible. */
  async function documentsCiting(
    book: number,
    chapter: number,
    verse?: number,
    limit = 30,
  ): Promise<DocUnitHit[]> {
    if (!(await tableExists('doc_refs'))) return [];
    const rows = await db.all<AnyRow>(
      `SELECT DISTINCT d.id, d.title, u.ord, u.text FROM doc_refs r
       JOIN documents d ON d.id = r.document_id
       JOIN doc_units u ON u.document_id = r.document_id AND u.ord = r.ord
       WHERE r.book_number = ? AND r.chapter = ?${verse != null ? ' AND r.verse_from <= ? AND r.verse_to >= ?' : ''}
       ORDER BY d.title, u.ord LIMIT ?`,
      verse != null ? [book, chapter, verse, verse, limit] : [book, chapter, limit],
    );
    return unitHits(rows);
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
   * Resolve a (normalized) book token to canonical book numbers, matching
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

    // Book numbers are canonical across modules, so the book resolved from
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
  // --- «Пошук за змістом» (1.15.0-beta.2, vectors.ts) ---

  /** Vector tables can sit in an attached file (the server's data/vectors.db): every schema. */
  let vectorsKnown: boolean | null = null;
  async function hasVectors(): Promise<boolean> {
    if (vectorsKnown === null) {
      try {
        vectorsKnown = pg
          ? await tableExists('vector_sets')
          : !!(await db.get("SELECT 1 FROM pragma_table_list WHERE name = 'vector_sets'"));
      } catch {
        vectorsKnown = false;
      }
    }
    return vectorsKnown;
  }

  /** The asked translations that have every vector of this model, with their language. */
  async function vectorTranslations(model: string, ids: number[]) {
    const rows = await db.all<AnyRow>(
      `SELECT t.id, t.source_hash, t.language, s.verses FROM translations t
       JOIN vector_sets s ON s.source_hash = t.source_hash
       WHERE s.model = ? AND s.done = 1 AND t.id IN (${placeholders(ids.length)})`,
      [model, ...ids],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      hash: String(r.source_hash),
      language: String(r.language ?? ''),
      verses: Number(r.verses) || 0,
    }));
  }
  type VectorSet = Awaited<ReturnType<typeof vectorTranslations>>[number];

  // a translation's chapters, decoded once (≈ 12 MB each): a scan then costs ≈ 22 ms. Eight kept —
  // «Один на мову» asks six at once: with four kept a query took 375 ms, with eight 221 (1.16.0-beta.4)
  const chapterCache = new Map<string, ChapterVectors[]>();
  async function chapterVectors(model: string, hash: string): Promise<ChapterVectors[]> {
    const key = `${model}|${hash}`;
    const had = chapterCache.get(key);
    if (had) {
      chapterCache.delete(key);
      chapterCache.set(key, had);
      return had;
    }
    const rows = await db.all<AnyRow>(
      'SELECT book, chapter, verses, vecs FROM chapter_vectors WHERE model = ? AND source_hash = ?',
      [model, hash],
    );
    const out = rows.map((r) => ({
      book: Number(r.book),
      chapter: Number(r.chapter),
      verses: r.verses as Uint8Array,
      vecs: r.vecs as Uint8Array,
    }));
    chapterCache.set(key, out);
    while (chapterCache.size > 8) chapterCache.delete(chapterCache.keys().next().value!);
    return out;
  }

  /** A place of a translation, as a key: `tid|book|chapter|verse`. */
  const placeKey = (tid: number, book: number, chapter: number, verse: number) =>
    `${tid}|${book}|${chapter}|${verse}`;

  /** The `k` places of these translations nearest to `q`, with their cosine (≈). */
  async function nearestIn(model: string, sets: VectorSet[], q: Int8Array, k: number) {
    const hits: { tid: number; book: number; chapter: number; verse: number; cos: number }[] = [];
    if (!sets.length) return hits;
    if (pg) {
      const vec = pgVector(q);
      const rows = await db.all<AnyRow>(
        `SELECT t.id AS tid, x.book, x.chapter, x.verse, -(x.vec <#> ?::vector) / 16129.0 AS score
         FROM verse_vectors x JOIN translations t ON t.source_hash = x.source_hash
         WHERE x.model = ? AND t.id IN (${placeholders(sets.length)})
         ORDER BY x.vec <#> ?::vector
         LIMIT ${k}`,
        [vec, model, ...sets.map((s) => s.id), vec],
      );
      for (const r of rows)
        hits.push({
          tid: Number(r.tid),
          book: Number(r.book),
          chapter: Number(r.chapter),
          verse: Number(r.verse),
          cos: Number(r.score),
        });
      return hits;
    }
    for (const s of sets)
      for (const h of nearest(await chapterVectors(model, s.hash), q, k))
        hits.push({
          tid: s.id,
          book: h.book,
          chapter: h.chapter,
          verse: h.verse,
          cos: h.score, // nearest() gives the cosine already
        });
    return hits.sort((x, y) => y.cos - x.cos).slice(0, k);
  }

  /** The cosine of these places (book, chapter, verse) of one translation, by `book|chapter|verse`. */
  async function cosineAt(model: string, set: VectorSet, q: Int8Array, places: number[][]) {
    const out = new Map<string, number>();
    if (!places.length) return out;
    if (pg) {
      const rows = await db.all<AnyRow>(
        `WITH h (bk, c, n) AS (VALUES ${places.map(() => `(${INT}, ${INT}, ${INT})`).join(', ')})
         SELECT x.book, x.chapter, x.verse, -(x.vec <#> ?::vector) / 16129.0 AS score
         FROM h JOIN verse_vectors x ON x.book = h.bk AND x.chapter = h.c AND x.verse = h.n
         WHERE x.model = ? AND x.source_hash = ?`,
        [...places.flat(), pgVector(q), model, set.hash],
      );
      for (const r of rows) out.set(`${r.book}|${r.chapter}|${r.verse}`, Number(r.score));
      return out;
    }
    const chapters = new Map(
      (await chapterVectors(model, set.hash)).map((c) => [`${c.book}|${c.chapter}`, c]),
    );
    const d = q.length;
    for (const [book, chapter, verse] of places) {
      const c = chapters.get(`${book}|${chapter}`);
      if (!c) continue;
      const nums = new DataView(c.verses.buffer, c.verses.byteOffset, c.verses.byteLength);
      const x = new Int8Array(c.vecs.buffer, c.vecs.byteOffset, c.vecs.byteLength);
      for (let i = 0; i < nums.byteLength / 2; i++) {
        if (nums.getInt16(i * 2, true) !== verse) continue;
        let dot = 0;
        for (let j = 0; j < d; j++) dot += x[i * d + j] * q[j];
        out.set(`${book}|${chapter}|${verse}`, dot / 16129);
        break;
      }
    }
    return out;
  }

  /**
   * The verses of one translation with a word starting so, through the full-text index: their
   * places (`book|chapter|verse`) up to `cap`, or — `count` — how many there are.
   */
  async function stemVerses(tid: number, stem: string, cap: number): Promise<string[]>;
  async function stemVerses(tid: number, stem: string, cap: number, count: true): Promise<number>;
  async function stemVerses(tid: number, stem: string, cap: number, count?: true) {
    const what = count ? 'COUNT(*) AS n' : 'v.book_number, v.chapter, v.verse';
    const limit = count ? '' : `LIMIT ${cap}`;
    let rows: AnyRow[];
    try {
      if (pg)
        rows = await db.all<AnyRow>(
          `SELECT ${what}
           FROM verses_fts f JOIN verses v ON v.id = f.id
           WHERE f.tsv @@ to_tsquery('${PG_TS_CONFIG}', ?) AND f.translation_id = ? ${limit}`,
          [`'${stem}':*`, tid],
        );
      else if (await columnExists('verses_fts', 'tr'))
        rows = await db.all<AnyRow>(
          `SELECT ${what}
           FROM verses_fts JOIN verses v ON v.id = verses_fts.rowid
           WHERE verses_fts MATCH ? ${limit}`,
          [`{text_norm}: ("${stem}"*) AND {tr}: (t${tid})`],
        );
      else
        rows = await db.all<AnyRow>(
          `SELECT ${what}
           FROM verses_fts JOIN verses v ON v.id = verses_fts.rowid
           WHERE verses_fts MATCH ? AND v.translation_id = ? ${limit}`,
          [`"${stem}"*`, tid],
        );
    } catch {
      return count ? 0 : []; // no full-text index here: the vectors alone
    }
    if (count) return Number(rows[0]?.n ?? 0);
    return rows.map((r) => `${r.book_number}|${r.chapter}|${r.verse}`);
  }

  /** These places' verse texts in one translation, as the index has them, by `book|chapter|verse`. */
  async function searchTexts(
    tid: number,
    places: { book: number; chapter: number; verse: number }[],
  ) {
    const out = new Map<string, string>();
    for (let i = 0; i < places.length; i += 300) {
      const part = places.slice(i, i + 300);
      const rows = await db.all<AnyRow>(
        `WITH h (bk, c, n) AS (VALUES ${part.map(() => `(${INT}, ${INT}, ${INT})`).join(', ')})
         SELECT v.book_number, v.chapter, v.verse, v.text
         FROM h JOIN verses v ON v.translation_id = ${INT} AND v.book_number = h.bk
           AND v.chapter = h.c AND v.verse = h.n`,
        [...part.flatMap((p) => [p.book, p.chapter, p.verse]), tid],
      );
      for (const r of rows)
        out.set(
          `${r.book_number}|${r.chapter}|${r.verse}`,
          ` ${normalizeForSearch(String(r.text ?? ''))} `,
        );
    }
    return out;
  }

  async function searchByMeaning(text: string, ids: number[]): Promise<SearchResponse> {
    if (!text) return { kind: 'empty', results: [] };
    if (!opts.embed || !(await hasVectors()))
      return { kind: 'meaning', results: [], missing: 'model' };
    const models = (
      await db.all<AnyRow>(
        `SELECT DISTINCT s.model FROM vector_sets s
         JOIN translations t ON t.source_hash = s.source_hash
         WHERE s.done = 1 AND t.id IN (${placeholders(ids.length)})`,
        ids,
      )
    ).map((r) => String(r.model));
    // none of the asked translations has vectors: nothing to ask the model
    if (!models.length) return { kind: 'meaning', results: [], missing: 'vectors' };
    const asked = await opts.embed(text, models);
    if (!asked) return { kind: 'meaning', results: [], missing: 'model' };
    // the words capitalized too: the model takes «павло» for no name (meaning.ts)
    const capitalized = capitalizeWords(text);
    const also = capitalized !== text ? await opts.embed(capitalized, [asked.model]) : null;
    const q = also?.model === asked.model ? blendVectors(asked.vec, also.vec) : asked.vec;
    const sets = await vectorTranslations(asked.model, ids);
    if (!sets.length) return { kind: 'meaning', results: [], missing: 'vectors' };

    type Place = {
      tid: number;
      book: number;
      chapter: number;
      verse: number;
      cos: number;
      words: number;
    };
    const ownLanguage = inQueryLanguage(text);
    const own = sets.filter((s) => ownLanguage(s.language));
    const rest = sets.filter((s) => !ownLanguage(s.language));
    // in the query's language: the vectors' nearest and the verses with its words
    const found = new Map<string, Place>();
    for (const h of await nearestIn(asked.model, own, q, MEANING_POOL))
      found.set(placeKey(h.tid, h.book, h.chapter, h.verse), { ...h, words: 0 });
    const stems = meaningStems(text);
    for (const s of stems.length ? own : []) {
      const lists = await Promise.all(stems.map((st) => stemVerses(s.id, st, STEM_CAP + 1)));
      // a common word's verses are too many to list: only counted (the list stops at the cap)
      const counts = await Promise.all(
        lists.map((l, i) => (l.length > STEM_CAP ? stemVerses(s.id, stems[i], 0, true) : l.length)),
      );
      // a word in many verses says little, a name in a few says much
      const n = Math.max(s.verses, ...counts, 1);
      const idf = counts.map((c) => (c ? Math.log(n / c) : 0));
      const total = idf.reduce((x, y) => x + y, 0);
      if (total <= 0) continue;
      // more places to weigh: the verses richest in the rarer words
      const rare = new Map<string, number>();
      lists.forEach((l, i) => {
        if (l.length <= STEM_CAP) for (const p of l) rare.set(p, (rare.get(p) ?? 0) + idf[i]);
      });
      const richest = [...rare]
        .filter(([p]) => !found.has(`${s.id}|${p}`))
        .sort((x, y) => y[1] - x[1])
        .slice(0, MEANING_POOL)
        .map(([p]) => p.split('|').map(Number));
      const cos = await cosineAt(asked.model, s, q, richest);
      for (const [book, chapter, verse] of richest) {
        const c = cos.get(`${book}|${chapter}|${verse}`);
        if (c != null)
          found.set(placeKey(s.id, book, chapter, verse), {
            tid: s.id,
            book,
            chapter,
            verse,
            cos: c,
            words: 0,
          });
      }
      // each place's share of the query's words, read in its own text (common words too)
      const mine = [...found.values()].filter((h) => h.tid === s.id);
      const texts = await searchTexts(s.id, mine);
      for (const h of mine) {
        const t = texts.get(`${h.book}|${h.chapter}|${h.verse}`) ?? '';
        h.words = stems.reduce((w, st, i) => (t.includes(` ${st}`) ? w + idf[i] : w), 0) / total;
      }
    }
    // each model its own weights (measured: EMBED_MODELS `ranking`)
    const { wordsWeight, cut } = isEmbedModelId(asked.model)
      ? EMBED_MODELS[asked.model].ranking
      : DEFAULT_RANKING;
    const score = (h: Place) => (1 - wordsWeight) * h.cos + wordsWeight * h.words;
    // the closer first; a tie by place, the same on every engine
    const order = (x: Place, y: Place) =>
      score(y) - score(x) ||
      x.tid - y.tid ||
      x.book - y.book ||
      x.chapter - y.chapter ||
      x.verse - y.verse;
    const ranked = [
      ...[...found.values()].sort(order),
      // the other languages after (the author: the query's language first)
      ...(await nearestIn(asked.model, rest, q, MEANING_LIMIT))
        .map((h) => ({ ...h, words: 0 }))
        .sort(order),
    ];
    // one row per place (1.17, the Mac's finding: «Дії 13:13» twice from two Ukrainian sets): the
    // place keeps its best score and is shown from the translation asked first among those found
    const byPlace = new Map<string, Place>();
    const rank = (tid: number) => (ids.indexOf(tid) + ids.length + 1) % (ids.length + 1);
    for (const h of ranked) {
      const key = `${h.book}|${h.chapter}|${h.verse}`;
      const had = byPlace.get(key);
      if (!had) byPlace.set(key, h);
      else if (rank(h.tid) < rank(had.tid)) byPlace.set(key, { ...had, tid: h.tid });
    }
    ranked.splice(0, ranked.length, ...byPlace.values());
    if (!ranked.length) return { kind: 'meaning', results: [] };
    const best = Math.max(...ranked.map(score));
    // far below the best: left out — a few always stay
    const hits = ranked
      .filter((h, i) => i < MEANING_MIN || best - score(h) <= cut)
      .slice(0, MEANING_LIMIT);
    // the places as a table joined on the verses' index — 60 ORed conditions scanned every verse
    const rows = await db.all<AnyRow>(
      // typed: Postgres reads an untyped parameter as text (and CAST is the one spelling both know)
      `WITH h (t, bk, c, n) AS (VALUES ${hits.map(() => `(${INT}, ${INT}, ${INT}, ${INT})`).join(', ')})
       SELECT v.translation_id, v.book_number, v.chapter, v.verse, v.text,
              b.long_name, b.short_name
       FROM h
       JOIN verses v ON v.translation_id = h.t AND v.book_number = h.bk AND v.chapter = h.c AND v.verse = h.n
       JOIN books b ON b.translation_id = v.translation_id AND b.book_number = v.book_number`,
      hits.flatMap((h) => [h.tid, h.book, h.chapter, h.verse]),
    );
    // in the order found, each with how close it is
    const at = new Map(hits.map((h, i) => [placeKey(h.tid, h.book, h.chapter, h.verse), i]));
    const results = rows
      .map((r): SearchResult => {
        const res = rowToResult(r);
        const i = at.get(placeKey(res.translationId, res.bookNumber, res.chapter, res.verse)) ?? 0;
        return { ...res, closeness: closenessOf(best - score(hits[i]), cut) };
      })
      .sort(
        (x, y) =>
          (at.get(placeKey(x.translationId, x.bookNumber, x.chapter, x.verse)) ?? 0) -
          (at.get(placeKey(y.translationId, y.bookNumber, y.chapter, y.verse)) ?? 0),
      );
    return { kind: 'meaning', results };
  }

  /**
   * A chapter's section titles in a translation (1.16.0-beta.2): before which verse, in order. An
   * older library has none.
   */
  async function getSubheadings(
    translationId: number,
    book: number,
    chapter: number,
  ): Promise<{ verse: number; title: string }[]> {
    if (!(await tableExists('subheadings'))) return [];
    const rows = await db.all<AnyRow>(
      `SELECT verse, title FROM subheadings
       WHERE translation_id = ? AND book_number = ? AND chapter = ?
       ORDER BY verse, ord`,
      [translationId, book, chapter],
    );
    return rows.map((r) => ({ verse: Number(r.verse), title: String(r.title) }));
  }

  /**
   * «Статистика бібліотеки» (1.18.0-beta.5): every part of the library counted, in code-point order —
   * the same numbers from SQLite on the server, SQLite-WASM and PGlite in the browser. A part an older
   * library lacks counts as none.
   */
  async function libraryStats(): Promise<LibraryStats> {
    // a stable sort over rows read by id: the same abbreviation twice keeps one order in every engine
    const byKey =
      <T>(key: (x: T) => string) =>
      (a: T, b: T) =>
        key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
    const counts = async (sql: string) =>
      new Map(
        (await db.all<AnyRow>(sql)).map((r) => [Number(r.id), Number(r.n)] as [number, number]),
      );
    const one = async (table: string) =>
      (await tableExists(table))
        ? Number((await db.get<AnyRow>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0)
        : 0;

    const verses = await db.all<AnyRow>(
      `SELECT translation_id AS id, COUNT(*) AS n,
         SUM(LENGTH(TRIM(text)) - LENGTH(REPLACE(TRIM(text), ' ', '')) + 1) AS words
       FROM verses WHERE text IS NOT NULL AND TRIM(text) <> '' GROUP BY translation_id`,
    );
    const versesBy = new Map(verses.map((r) => [Number(r.id), r]));
    const books = await counts(
      'SELECT translation_id AS id, COUNT(*) AS n FROM books GROUP BY translation_id',
    );
    const strongs = (await tableExists('verse_strongs'))
      ? await counts(
          'SELECT translation_id AS id, COUNT(*) AS n FROM verse_strongs GROUP BY translation_id',
        )
      : new Map<number, number>();
    const titles = (await tableExists('subheadings'))
      ? await counts(
          'SELECT translation_id AS id, COUNT(*) AS n FROM subheadings GROUP BY translation_id',
        )
      : new Map<number, number>();
    const translations = (
      await db.all<AnyRow>(
        'SELECT id, abbr, title, language, has_strong FROM translations ORDER BY id',
      )
    )
      .map((t) => {
        const id = Number(t.id);
        const v = versesBy.get(id);
        return {
          id,
          abbr: String(t.abbr),
          title: String(t.title ?? ''),
          language: String(t.language ?? ''),
          hasStrong: Number(t.has_strong) === 1,
          books: books.get(id) ?? 0,
          verses: Number(v?.n ?? 0),
          words: Number(v?.words ?? 0),
          strongTags: strongs.get(id) ?? 0,
          subheadings: titles.get(id) ?? 0,
        };
      })
      .sort(byKey((t) => t.abbr));

    const dictionaries = (await tableExists('dictionaries'))
      ? (
          await db.all<AnyRow>(
            `SELECT d.abbr, d.name, d.language, d.is_strong, COUNT(e.dictionary_id) AS entries
             FROM dictionaries d LEFT JOIN dictionary_entries e ON e.dictionary_id = d.id
             GROUP BY d.id, d.abbr, d.name, d.language, d.is_strong ORDER BY d.id`,
          )
        )
          .map((r) => ({
            abbr: String(r.abbr ?? ''),
            name: String(r.name ?? ''),
            language: String(r.language ?? ''),
            strong: Number(r.is_strong) === 1,
            entries: Number(r.entries),
          }))
          .sort(byKey((d) => d.abbr))
      : [];
    const commentaries = (await tableExists('commentaries'))
      ? (await db.all<AnyRow>('SELECT source, COUNT(*) AS n FROM commentaries GROUP BY source'))
          .map((r) => ({ source: String(r.source), notes: Number(r.n) }))
          .sort(byKey((c) => c.source))
      : [];
    const songs =
      (await tableExists('songs')) && (await columnExists('songs', 'bundle'))
        ? (
            await db.all<AnyRow>(
              `SELECT s.bundle, COUNT(DISTINCT s.id) AS songs, COUNT(sl.song_id) AS stanzas
               FROM songs s LEFT JOIN song_slides sl ON sl.song_id = s.id
               GROUP BY s.bundle`,
            )
          )
            .map((r) => ({
              bundle: String(r.bundle ?? ''),
              songs: Number(r.songs),
              stanzas: Number(r.stanzas),
            }))
            .sort(byKey((s) => s.bundle))
        : [];
    return {
      translations,
      dictionaries,
      commentaries,
      crossReferences: await one('cross_references'),
      subheadingSets: (await listSubheadingSets()).map((s) => ({
        abbr: s.abbr,
        title: s.title,
        titles: s.titles,
      })),
      songs,
      documents: {
        documents: await one('documents'),
        units: await one('doc_units'),
        refs: await one('doc_refs'),
      },
    };
  }

  /** The section-title sets in the library (1.16.0-beta.3), by name; an older library has none. */
  async function listSubheadingSets(): Promise<SubheadingSet[]> {
    if (!(await tableExists('subheading_sets'))) return [];
    const rows = await db.all<AnyRow>(
      `SELECT s.id, s.abbr, s.title, s.language, COUNT(h.set_id) AS titles
       FROM subheading_sets s LEFT JOIN set_subheadings h ON h.set_id = s.id
       GROUP BY s.id, s.abbr, s.title, s.language`,
    );
    return (
      rows
        .map((r) => ({
          id: Number(r.id),
          abbr: String(r.abbr),
          title: String(r.title),
          language: String(r.language ?? ''),
          titles: Number(r.titles),
        }))
        // by code points: the same order in every engine and locale
        .sort((a, b) => (a.abbr < b.abbr ? -1 : a.abbr > b.abbr ? 1 : 0))
    );
  }

  /** A chapter's titles from a set (1.16.0-beta.3), at the places the set gives. */
  async function getSetSubheadings(
    setId: number,
    book: number,
    chapter: number,
  ): Promise<{ verse: number; title: string }[]> {
    if (!(await tableExists('set_subheadings'))) return [];
    const rows = await db.all<AnyRow>(
      `SELECT verse, title FROM set_subheadings
       WHERE set_id = ? AND book_number = ? AND chapter = ?
       ORDER BY verse, ord`,
      [setId, book, chapter],
    );
    return rows.map((r) => ({ verse: Number(r.verse), title: String(r.title) }));
  }

  async function search(query: string, translationIds: number[]): Promise<SearchResponse> {
    const ids = translationIds.length ? translationIds : (await getTranslations()).map((t) => t.id);
    if (ids.length === 0) return { kind: 'empty', results: [] };

    const meaning = MEANING_PREFIX.exec(query);
    if (meaning) return searchByMeaning(query.slice(meaning[0].length).trim(), ids);

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
    chapterProfiles,
    getVerses,
    getSubheadings,
    listSubheadingSets,
    libraryStats,
    getSetSubheadings,
    listDictionaries,
    lookupStrong,
    decodeMorphology,
    lookupWord,
    strongRefs,
    getCrossrefs,
    getCommentary,
    searchSongs,
    listSongBundles,
    getSong,
    listDocuments,
    getDocument,
    searchDocuments,
    documentsCiting,
    search,
    resolveBookCandidates,
  };
}
