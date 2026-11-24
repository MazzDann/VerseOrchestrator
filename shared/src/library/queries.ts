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
import { slideWords } from '../songs/sections.js';
import { songScore } from '../songs/songVectors.js';
import {
  TOPIC_WORD_BOOST,
  topicQueryOf,
  topicWordsIn,
  type TopicQuery,
} from '../songs/topicQuery.js';

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

/** A chapter's cross-references (1.23.0-beta.6): `verse` of that chapter → a related place. */
export interface ChapterCrossRef extends CrossRefTarget {
  verse: number;
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
  /** its bundle is in the archive (1.26.0-beta.2) */
  archived?: boolean;
}
/** A song found by meaning (1.25.0-beta.1): how close (1–3), its nearest slide and that slide's first line. */
export interface SongMeaningHit extends SongInfo {
  closeness: number;
  stanza: number;
  line: string;
}
/** «~ …» in the songs: what was found, or the part missing (`server`: a browser engine has no song vectors). */
export interface SongMeaningResponse {
  results: SongMeaningHit[];
  missing?: 'model' | 'vectors' | 'server';
}
/**
 * A passage or a song shown before (1.25.0-beta.3, data/stats.db), once each: how many times, when
 * last (ms), under the label it was last shown with.
 */
export interface ShownThing {
  kind: 'verses' | 'song';
  label: string;
  shows: number;
  last: number;
  book?: number;
  chapter?: number;
  from?: number;
  to?: number;
  songId?: number;
}
/** A thing shown before, found by meaning: how close (1–3); a passage, the translation it was weighed in. */
export interface ShownMeaningHit extends ShownThing {
  closeness: number;
  translationId?: number;
}
/** «~ …» in «Історія»: what was shown on the theme, or the part missing. */
export interface ShownMeaningResponse {
  results: ShownMeaningHit[];
  missing?: 'model' | 'vectors' | 'server';
}
export interface SongSlideOut {
  text: string;
  /** Faithful pptx style {bg,color,font,bold,align,x,y,w,h} or null. */
  style: unknown | null;
}
export interface SongDetail extends SongInfo {
  slides: SongSlideOut[];
  /** its topics (1.25.0-beta.2), in its bundle's order; none in a library before them */
  topics: string[];
  /** the same number in the bundle paired with its own (1.25.0-beta.4): the song in another language */
  other?: SongInfo;
}
/** A topic the songs hold (1.25.0-beta.2), with how many of them. */
export interface SongTopicCount {
  name: string;
  count: number;
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

/**
 * «~ слова» — a search by meaning; the rest of the query is what to look for. «!» too (1.23.0-beta.2,
 * the users' F1114-11: «~» is hard to reach on a Ukrainian layout).
 */
export const MEANING_PREFIX = /^\s*[~!]\s*/;
const INT = 'CAST(? AS INTEGER)';

/** How many places a query by meaning returns, at most. */
export const MEANING_LIMIT = 60;
/** How many places of the query's language are weighed: the vectors' nearest, the word-richest. */
const MEANING_POOL = 200;
/** How many song passages are weighed, and how many songs a query by meaning returns (1.25.0-beta.1). */
const SONG_MEANING_POOL = 600;
const SONG_MEANING_LIMIT = 40;
/** «~ …» in «Історія» (1.25.0-beta.3): at most this many things shown before */
const SHOWN_MEANING_LIMIT = 40;
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
 *   -word / !word    → exclude (NOT); a query STARTING with «!» is by meaning (1.23.0-beta.2)
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

/**
 * «По порядку» (1.23.0-beta.4, the users' F1114-14: «щоб "1 2" не видавало пошуки в яких "2 1"»):
 * the query's words stand in the verse in the order typed — other words may stand between them.
 * A word is a prefix, as in the search; a quoted phrase, its words one after another. Read on the
 * normalized text, as the index is.
 */
export function keepsWordOrder(text: string, query: string): boolean {
  const { pos } = parseSearchClauses(query);
  const words = normalizeForSearch(text).split(' ').filter(Boolean);
  let at = 0;
  for (const c of pos) {
    let found = -1;
    for (let i = at; i + c.words.length <= words.length && found < 0; i++)
      if (c.phrase ? c.words.every((w, k) => words[i + k] === w) : words[i].startsWith(c.words[0]))
        found = i;
    if (found < 0) return false;
    at = found + c.words.length;
  }
  return true;
}

/** Whether the order of the query's words can matter: two clauses or more. */
export const orderMatters = (query: string): boolean => parseSearchClauses(query).pos.length > 1;

/** How many places a text search returns, at most — and how many «По порядку» reads first. */
const TEXT_LIMIT = 300;
const IN_ORDER_POOL = 1000;

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

  /** Every translation but the archived (1.26.0-beta.2) — all of them when all are archived. */
  async function translationsToSearch(skip: readonly string[] = []): Promise<number[]> {
    const all = await getTranslations();
    const out = new Set(skip);
    const kept = all.filter((t) => !out.has(t.abbr));
    return (kept.length ? kept : all).map((t) => t.id);
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

  /**
   * All the cross-references of a chapter in one read (1.23.0-beta.6, the users' F1114-15: the
   * references at each verse's end in the control window) — by verse, then in the order of the
   * Bible, as `getCrossrefs` gives one verse's.
   */
  async function getChapterCrossrefs(book: number, chapter: number): Promise<ChapterCrossRef[]> {
    if (!(await tableExists('cross_references'))) return [];
    const rows = await db.all<AnyRow>(
      `SELECT verse, book_to, chapter_to, verse_to_start, verse_to_end
       FROM cross_references
       WHERE book = ? AND chapter = ?
       ORDER BY verse, book_to, chapter_to, verse_to_start, verse_to_end`,
      [book, chapter],
    );
    return rows.map((r) => ({
      verse: Number(r.verse),
      bookNumber: Number(r.book_to),
      chapter: Number(r.chapter_to),
      verseStart: Number(r.verse_to_start),
      verseEnd: Number(r.verse_to_end || r.verse_to_start),
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

  /** The topics the songs hold (1.25.0-beta.2) — of one bundle, or all — in their lists' order. */
  async function listSongTopics(bundle?: string): Promise<SongTopicCount[]> {
    if (!(await tableExists('song_topics'))) return [];
    const rows = await db.all<AnyRow>(
      `SELECT t.topic AS name, COUNT(DISTINCT t.song_id) AS count, MIN(t.ord) AS ord
       FROM song_topics t JOIN songs s ON s.id = t.song_id
       ${bundle ? 'WHERE s.bundle = ?' : ''}
       GROUP BY t.topic ORDER BY MIN(t.ord), t.topic`,
      bundle ? [bundle] : [],
    );
    return rows.map((r) => ({ name: String(r.name), count: Number(r.count) }));
  }

  /**
   * Search songs by number (prefix) or title (diacritic-insensitive); an empty query lists
   * them by number. `bundle` narrows the search to one bundle, `topic` to the songs of one topic
   * (1.25.0-beta.2: all of them, not the first `limit`). `skip`: the archived bundles (1.26.0-beta.2)
   * — their songs after the others', unless one bundle is asked for.
   */
  async function searchSongs(
    q: string,
    limit = 60,
    bundle?: string,
    topic?: string,
    skip: readonly string[] = [],
  ): Promise<SongInfo[]> {
    if (!(await tableExists('songs'))) return [];
    const cols = await songColumns();
    const byTopic = !!topic && (await tableExists('song_topics'));
    if (topic && !byTopic) return [];
    if (byTopic) limit = Math.max(limit, 2000);
    const inBundle =
      (bundle && cols.endsWith(', bundle') ? ' AND bundle = ?' : '') +
      (byTopic ? ' AND id IN (SELECT song_id FROM song_topics WHERE topic = ?)' : '');
    const bundleArg = [
      ...(bundle && cols.endsWith(', bundle') ? [bundle] : []),
      ...(byTopic ? [topic!] : []),
    ];
    const archived = new Set(cols.endsWith(', bundle') && !bundle ? skip.slice(0, 200) : []);
    const order = archived.size
      ? `CASE WHEN bundle IN (${placeholders(archived.size)}) THEN 1 ELSE 0 END, number, bundle`
      : 'number, bundle';
    const query = q.trim();
    let rows: AnyRow[];
    if (/^\d+$/.test(query)) {
      rows = await db.all(
        `SELECT ${cols} FROM songs
         WHERE (number = ? OR CAST(number AS TEXT) LIKE ?)${inBundle}
         ORDER BY ${order} LIMIT ?`,
        [Number(query), `${query}%`, ...bundleArg, ...archived, limit],
      );
    } else if (query) {
      rows = await db.all(
        `SELECT ${cols} FROM songs WHERE title_norm LIKE ?${inBundle}
         ORDER BY ${order} LIMIT ?`,
        [`%${normalizeForSearch(query)}%`, ...bundleArg, ...archived, limit],
      );
    } else {
      rows = await db.all(
        `SELECT ${cols} FROM songs WHERE 1 = 1${inBundle} ORDER BY ${order} LIMIT ?`,
        [...bundleArg, ...archived, limit],
      );
    }
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      bundle: r.bundle ?? '',
      ...(archived.has(r.bundle) ? { archived: true } : {}),
    }));
  }

  // a model's song vectors, read once until they change (the job writes them a song at a time)
  let songVecCache: { key: string; rows: ChapterVectors[] } | null = null;

  /**
   * Songs by meaning (1.25.0-beta.1, the author: «пишеш тему як от спасіння і воно тобі автопідбирає
   * пісні»): the songs whose passages (songPassages: the title, each slide once) are nearest to the
   * words — a song by its best passage and a little of its next (songScore), the words in its title
   * weighed in like a verse's. Server only: the browser engines carry no song vectors (`server`).
   */
  /** The songs' texts normalized, once per library (a new one is made after a change: closeDb). */
  let songTexts: Map<number, string> | null = null;

  /** The songs whose texts hold a ready topic's own words, and how many (1 or 2). */
  async function songsWithWords(topic: TopicQuery): Promise<Map<number, number>> {
    if (!songTexts) {
      const all = new Map<number, string>();
      for (const r of await db.all<AnyRow>('SELECT song_id, text FROM song_slides')) {
        const id = Number(r.song_id);
        all.set(id, `${all.get(id) ?? ''} ${normalizeForSearch(String(r.text ?? ''))}`);
      }
      songTexts = all;
    }
    const out = new Map<number, number>();
    for (const [id, text] of songTexts) {
      const n = topicWordsIn(text, topic);
      if (n) out.set(id, n);
    }
    return out;
  }

  async function searchSongsByMeaning(
    text: string,
    bundle?: string,
    skip: readonly string[] = [],
  ): Promise<SongMeaningResponse> {
    const words = text.replace(MEANING_PREFIX, '').trim();
    if (!words) return { results: [] };
    if (pg) return { results: [], missing: 'server' };
    if (!opts.embed) return { results: [], missing: 'model' };
    if (!(await tableExists('songs'))) return { results: [] };
    let models: string[] = [];
    try {
      if (await db.get("SELECT 1 FROM pragma_table_list WHERE name = 'song_vectors'"))
        models = (await db.all<AnyRow>('SELECT DISTINCT model FROM song_vectors')).map((r) =>
          String(r.model),
        );
    } catch {
      /* no vectors file attached */
    }
    if (!models.length) return { results: [], missing: 'vectors' };
    const asked = await opts.embed(words, models);
    if (!asked) return { results: [], missing: 'model' };
    const capitalized = capitalizeWords(words);
    const also = capitalized !== words ? await opts.embed(capitalized, [asked.model]) : null;
    let q = also?.model === asked.model ? blendVectors(asked.vec, also.vec) : asked.vec;
    // a ready topic's name («Різдво»): its own words are asked too, and looked for in the texts
    const topic = topicQueryOf(words);
    const told = topic ? await opts.embed(topic.about, [asked.model]) : null;
    if (told?.model === asked.model) q = blendVectors(q, told.vec);

    const mark = await db.get<AnyRow>(
      // AUTOINCREMENT ids never come back: a row replaced or deleted always moves the mark
      'SELECT COUNT(*) AS n, MAX(id) AS m FROM song_vectors WHERE model = ?',
      [asked.model],
    );
    // the model asked has none yet (another one has): say so, not «nothing found»
    if (!Number(mark?.n)) return { results: [], missing: 'vectors' };
    const key = `${asked.model}|${mark?.n}|${mark?.m}`;
    if (songVecCache?.key !== key) {
      const rows = await db.all<AnyRow>(
        'SELECT song_id, ords, vecs FROM song_vectors WHERE model = ?',
        [asked.model],
      );
      songVecCache = {
        key,
        rows: rows.map((r) => ({
          book: Number(r.song_id),
          chapter: 0,
          verses: r.ords as Uint8Array,
          vecs: r.vecs as Uint8Array,
        })),
      };
    }
    const cols = await songColumns();
    const inBundle = bundle && cols.endsWith(', bundle');
    // the songs there are now (a deleted song's vectors stay until the next pass), of the bundle asked
    const songs = new Map(
      (
        await db.all<AnyRow>(
          `SELECT ${cols}, title_norm FROM songs${inBundle ? ' WHERE bundle = ?' : ''}`,
          inBundle ? [bundle!] : [],
        )
      ).map((r) => [Number(r.id), r]),
    );
    const mine = songVecCache.rows.filter((r) => songs.has(r.book));
    // the archived bundles' songs (1.26.0-beta.2) have a pool of their own, shown after the rest
    const skipped = new Set(inBundle ? [] : skip);
    const isArchived = (id: number) => skipped.has(String(songs.get(id)?.bundle ?? ''));
    const hits = skipped.size
      ? [
          ...nearest(
            mine.filter((r) => !isArchived(r.book)),
            q,
            SONG_MEANING_POOL,
          ),
          ...nearest(
            mine.filter((r) => isArchived(r.book)),
            q,
            SONG_MEANING_POOL,
          ),
        ]
      : nearest(mine, q, SONG_MEANING_POOL);
    const ownWords = topic ? await songsWithWords(topic) : new Map<number, number>();
    if (ownWords.size) {
      // those with the topic's words further than the pool reaches are weighed too
      const near = new Set(hits.map((h) => h.book));
      const others = mine.filter((r) => ownWords.has(r.book) && !near.has(r.book));
      hits.push(...nearest(others, q, SONG_MEANING_POOL));
    }
    const bySong = new Map<number, { cos: number[]; best: number; bestCos: number }>();
    for (const h of hits) {
      const s = bySong.get(h.book);
      if (!s) bySong.set(h.book, { cos: [h.score], best: h.verse, bestCos: h.score });
      else s.cos.push(h.score);
    }
    const { wordsWeight, cut } = isEmbedModelId(asked.model)
      ? EMBED_MODELS[asked.model].ranking
      : DEFAULT_RANKING;
    const stems = meaningStems(words);
    const scored = [...bySong].map(([id, s]) => {
      const title = ` ${normalizeForSearch(String(songs.get(id)?.title_norm ?? ''))} `;
      const inTitle = stems.length
        ? stems.filter((st) => title.includes(` ${st}`)).length / stems.length
        : 0;
      return {
        id,
        best: s.best,
        score:
          (1 - wordsWeight) * songScore(s.cos) +
          wordsWeight * inTitle +
          TOPIC_WORD_BOOST * (ownWords.get(id) ?? 0),
      };
    });
    scored.sort((x, y) => y.score - x.score || x.id - y.id);
    if (!scored.length) return { results: [] };
    // the archived ones are weighed against the nearest of the others, so they never push those out
    const own = scored.filter((h) => !isArchived(h.id));
    const late = scored.filter((h) => isArchived(h.id));
    const top = (own[0] ?? late[0]).score;
    // a topic's words in the first song must not cut those that are as close without them
    const far = cut + (ownWords.size ? TOPIC_WORD_BOOST : 0);
    const ownKept = own.filter((h, i) => i < MEANING_MIN || top - h.score <= far);
    const lateKept = late.filter(
      (h, i) => (!own.length && i < MEANING_MIN) || top - h.score <= far,
    );
    // a few archived always have room after the rest
    const room = SONG_MEANING_LIMIT - Math.min(lateKept.length, 10);
    const kept = [...ownKept.slice(0, room), ...lateKept].slice(0, SONG_MEANING_LIMIT);
    // each song's best passage, as a line to show under its title
    const lines = new Map<number, string>();
    if (kept.length) {
      const rows = await db.all<AnyRow>(
        `SELECT song_id, ord, text FROM song_slides WHERE song_id IN (${placeholders(kept.length)})`,
        kept.map((h) => h.id),
      );
      const want = new Map(kept.map((h) => [h.id, h.best]));
      for (const r of rows)
        if (want.get(Number(r.song_id)) === Number(r.ord))
          lines.set(Number(r.song_id), String(r.text ?? ''));
    }
    return {
      results: kept.map((h) => {
        const r = songs.get(h.id)!;
        const line =
          h.best === 0
            ? ''
            : slideWords(lines.get(h.id) ?? '')
                .split('\n')[0]
                .trim();
        return {
          id: h.id,
          number: r.number,
          title: r.title,
          bundle: r.bundle ?? '',
          ...(isArchived(h.id) ? { archived: true } : {}),
          closeness: closenessOf(Math.max(0, top - h.score), cut),
          stanza: h.best,
          line,
        };
      }),
    };
  }

  /**
   * What was shown on a theme (1.25.0-beta.3, the author: «~» in «Історія», по всіх показах): the
   * passages and songs shown before (`items`, from data/stats.db), each by its vectors — a passage
   * by its verses in the first of `ids` with vectors of the model (else any translation that has
   * them), a song by its passages — taken as a song is in «~ тема» (songScore). The nearest first.
   */
  async function shownByMeaning(
    text: string,
    items: ShownThing[],
    ids: number[],
  ): Promise<ShownMeaningResponse> {
    const words = text.replace(MEANING_PREFIX, '').trim();
    if (!words || !items.length) return { results: [] };
    if (pg) return { results: [], missing: 'server' };
    if (!opts.embed) return { results: [], missing: 'model' };
    const models = new Set<string>();
    for (const sql of [
      'SELECT DISTINCT model FROM vector_sets WHERE done = 1',
      'SELECT DISTINCT model FROM song_vectors',
    ])
      try {
        for (const r of await db.all<AnyRow>(sql)) models.add(String(r.model));
      } catch {
        /* no vectors file attached, or none of this kind */
      }
    if (!models.size) return { results: [], missing: 'vectors' };
    const asked = await opts.embed(words, [...models]);
    if (!asked) return { results: [], missing: 'model' };
    const capitalized = capitalizeWords(words);
    const also = capitalized !== words ? await opts.embed(capitalized, [asked.model]) : null;
    const q = also?.model === asked.model ? blendVectors(asked.vec, also.vec) : asked.vec;
    const d = q.length;
    const cosOf = (vecs: Uint8Array, i: number) => {
      const x = new Int8Array(vecs.buffer, vecs.byteOffset + i * d, d);
      let sum = 0;
      for (let j = 0; j < d; j++) sum += x[j] * q[j];
      return sum / (127 * 127);
    };

    // the passages: one translation's chapters of this model
    const passages = items.filter((t) => t.kind === 'verses' && t.book && t.chapter);
    let chapters = new Map<string, ChapterVectors>();
    let passagesIn: number | undefined;
    if (passages.length) {
      let sets = ids.length ? await vectorTranslations(asked.model, ids) : [];
      if (!sets.length) {
        const any = await db
          .get<AnyRow>(
            `SELECT t.id, s.source_hash FROM vector_sets s
             JOIN translations t ON t.source_hash = s.source_hash
             WHERE s.model = ? AND s.done = 1 ORDER BY s.verses DESC, t.id`,
            [asked.model],
          )
          .catch(() => undefined);
        if (any)
          sets = [{ id: Number(any.id), hash: String(any.source_hash), language: '', verses: 0 }];
      }
      passagesIn = sets[0]?.id;
      if (sets.length)
        chapters = new Map(
          (await chapterVectors(asked.model, sets[0].hash)).map((c) => [
            `${c.book}:${c.chapter}`,
            c,
          ]),
        );
    }
    // the songs: their rows of this model
    const songIds = items.filter((t) => t.kind === 'song' && t.songId).map((t) => t.songId!);
    const songVecs = new Map<number, Uint8Array>();
    if (songIds.length)
      try {
        for (let k = 0; k < songIds.length; k += 500) {
          const part = songIds.slice(k, k + 500);
          for (const r of await db.all<AnyRow>(
            `SELECT song_id, vecs FROM song_vectors WHERE model = ? AND song_id IN (${placeholders(part.length)})`,
            [asked.model, ...part],
          ))
            songVecs.set(Number(r.song_id), r.vecs as Uint8Array);
        }
      } catch {
        /* no song vectors */
      }

    const scored: { item: ShownThing; score: number }[] = [];
    for (const item of items) {
      const cos: number[] = [];
      if (item.kind === 'verses') {
        const c = chapters.get(`${item.book}:${item.chapter}`);
        if (!c) continue;
        const nums = new DataView(c.verses.buffer, c.verses.byteOffset, c.verses.byteLength);
        const n = Math.min(c.vecs.byteLength / d, nums.byteLength / 2);
        for (let i = 0; i < n; i++) {
          const v = nums.getInt16(i * 2, true);
          if (item.from !== undefined && (v < item.from || v > (item.to ?? item.from))) continue;
          cos.push(cosOf(c.vecs, i));
        }
      } else {
        const v = item.songId ? songVecs.get(item.songId) : undefined;
        if (!v) continue;
        for (let i = 0; i < v.byteLength / d; i++) cos.push(cosOf(v, i));
      }
      if (cos.length) scored.push({ item, score: songScore(cos) });
    }
    if (!scored.length) return { results: [], missing: 'vectors' };
    const { cut } = isEmbedModelId(asked.model)
      ? EMBED_MODELS[asked.model].ranking
      : DEFAULT_RANKING;
    // passages and songs each against their own best: a stanza is nearer a short theme than any
    // verse is, so one scale put every song above the passage that fits best (measured: «~
    // воскресіння Христа» had Мт 28 fourth, under songs about baptism and the Sabbath)
    const kept: { hit: ShownMeaningHit; gap: number; score: number }[] = [];
    for (const kind of ['verses', 'song'] as const) {
      const mine = scored
        .filter((h) => h.item.kind === kind)
        .sort((a, b) => b.score - a.score || b.item.last - a.item.last);
      const top = mine[0]?.score ?? 0;
      mine
        .filter((h, i) => i < MEANING_MIN || top - h.score <= cut)
        .forEach((h) =>
          kept.push({
            hit: {
              ...h.item,
              closeness: closenessOf(top - h.score, cut),
              ...(kind === 'verses' && passagesIn ? { translationId: passagesIn } : {}),
            },
            gap: top - h.score,
            score: h.score,
          }),
        );
    }
    kept.sort((a, b) => a.gap - b.gap || b.score - a.score);
    const results = kept.slice(0, SHOWN_MEANING_LIMIT).map((k) => k.hit);
    // a passage's label from its place, in the translation it was weighed in: what a showing kept
    // as its label is the screen's caption, at times the verse's own text
    const lead = passagesIn ?? ids[0];
    if (lead && results.some((r) => r.kind === 'verses')) {
      const names = new Map(
        (
          await db.all<AnyRow>(
            'SELECT book_number, short_name FROM books WHERE translation_id = ?',
            [lead],
          )
        ).map((r) => [Number(r.book_number), String(r.short_name)]),
      );
      for (const r of results) {
        const name = r.kind === 'verses' && r.book ? names.get(r.book) : undefined;
        if (!name) continue;
        const span =
          r.from === undefined ? '' : `:${r.from}${r.to && r.to > r.from ? `–${r.to}` : ''}`;
        r.label = `${name} ${r.chapter}${span}`;
      }
    }
    return { results };
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
    const topics = (await tableExists('song_topics'))
      ? (
          await db.all<AnyRow>(
            'SELECT topic FROM song_topics WHERE song_id = ? ORDER BY ord, topic',
            [id],
          )
        ).map((r) => String(r.topic))
      : [];
    // the bundle paired by number: its song of the same number
    let other: SongInfo | undefined;
    if (s.number != null && s.bundle && (await tableExists('song_pairs'))) {
      const o = await db.get<AnyRow>(
        `SELECT x.id, x.number, x.title, x.bundle FROM song_pairs p
         JOIN songs x ON x.bundle = p.other AND x.number = ?
         WHERE p.bundle = ? ORDER BY x.id LIMIT 1`,
        [s.number, s.bundle],
      );
      if (o)
        other = {
          id: Number(o.id),
          number: o.number,
          title: String(o.title),
          bundle: String(o.bundle ?? ''),
        };
    }
    return {
      id: s.id,
      number: s.number,
      title: s.title,
      bundle: s.bundle ?? '',
      slides,
      topics,
      ...(other ? { other } : {}),
    };
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

  /**
   * `inOrder`: «По порядку» (1.23.0-beta.4) — the words in the order typed (`keepsWordOrder`);
   * `skip`: the archived translations' names (1.26.0-beta.2) — left out when none are asked for by
   * id, unless nothing else is there.
   */
  async function search(
    query: string,
    translationIds: number[],
    opts: { inOrder?: boolean; skip?: readonly string[] } = {},
  ): Promise<SearchResponse> {
    const inOrder = !!opts.inOrder && orderMatters(query);
    // more places read when the order sifts them, so the ones in order past the first 300 aren't lost
    const limit = inOrder ? IN_ORDER_POOL : TEXT_LIMIT;
    const sift = (rows: AnyRow[]) =>
      inOrder
        ? rows.filter((r) => keepsWordOrder(String(r.text ?? ''), query)).slice(0, TEXT_LIMIT)
        : rows;
    const ids = translationIds.length ? translationIds : await translationsToSearch(opts.skip);
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
           LIMIT ${limit}`,
          [q, ...ids],
        );
        return { kind: 'text', results: sift(rows).map(rowToResult) };
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
           LIMIT ${limit}`,
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
           LIMIT ${limit}`,
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
           LIMIT ${limit}`,
          [match, ...ids],
        );
      }
    } catch {
      // A malformed MATCH (rare, from odd operator combos) → no results, not a 500.
      return { kind: 'empty', results: [] };
    }

    return { kind: 'text', results: sift(rows).map(rowToResult) };
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
    getChapterCrossrefs,
    getCommentary,
    searchSongs,
    searchSongsByMeaning,
    shownByMeaning,
    listSongTopics,
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
