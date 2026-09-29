import {
  cleanDefinition,
  normalizeForSearch,
  stripTags,
  strongLangFor,
  strongNumbers,
} from '../normalize.js';
import type { Row, SqlParam } from './driver.js';
import { fill, N_, type Vars } from '../i18n/index.js';

/**
 * MyBible modules → our schema. The builder imports a whole modules folder into
 * library.db; a browser engine converts ONE dropped module into a segment (segments.ts
 * layout, incl. verses_norm) and merges it like any other. Row-level rules live here so
 * both produce the same text, search normalization and Strong index.
 */

export type MyBibleKind = 'bible' | 'dictionary' | 'commentaries' | 'crossreferences';

/** What a MyBible file is, from its table names; null when it's none we import. */
export function myBibleKind(tables: string[]): MyBibleKind | null {
  const has = new Set(tables.map((t) => t.toLowerCase()));
  if (has.has('books') && has.has('verses')) return 'bible';
  if (has.has('dictionary')) return 'dictionary';
  if (has.has('commentaries')) return 'commentaries';
  if (has.has('cross_references')) return 'crossreferences';
  return null;
}

/** File name without the MyBible extensions: "UKRK.SQLite3" → "UKRK". */
export function moduleLabel(fileName: string): string {
  return fileName
    .replace(/\.SQLite3$/i, '')
    .replace(/\.(dictionary|commentaries|crossreferences)$/i, '');
}

/**
 * Some module files on disk have corrupted (mojibake) Cyrillic names — box-drawing
 * characters from a UTF-8/CP866 mix-up at extraction time. When the filename-derived
 * abbreviation is garbage, fall back to a short label taken from the (clean) title.
 */
export function cleanAbbr(rawAbbr: string, title: string): string {
  if (!/[─-╿�]/.test(rawAbbr)) return rawAbbr;
  let label = (title || '').split(',')[0].trim();
  const words = label.split(/\s+/);
  if (label.length > 14 && words.length > 1) label = words.slice(0, 2).join(' ');
  return label || rawAbbr;
}

export interface BibleMeta {
  description: string;
  language: string;
  rtl: boolean;
  hasStrong: boolean;
}

/** A Bible module's `info` table (name/value rows). */
export function bibleMeta(info: Record<string, string>): BibleMeta {
  return {
    description: info.description ?? '',
    language: info.language ?? '',
    rtl: info.right_to_left === 'true',
    hasStrong: info.strong_numbers === 'true',
  };
}

/** One verse as stored: display text, markup only when it differs, search text, Strongs. */
export function verseRecord(raw: string | null, bookNumber: number, meta: BibleMeta) {
  const src = raw ?? '';
  const text = stripTags(src);
  return {
    text,
    // No markup → don't store the same text twice (readers fall back to `text`).
    textRaw: src === text ? null : src,
    norm: normalizeForSearch(src),
    strongs: meta.hasStrong ? strongNumbers(src) : [],
    strongLang: strongLangFor(bookNumber, meta.language),
  };
}

/** A Strong's dictionary is keyed by Strong numbers (G2424 / H7225 / 2424). */
export function isStrongDictionary(topics: string[]): boolean {
  const sample = topics.slice(0, 60).map((t) => String(t).trim());
  const strongLike = sample.filter((t) => /^[ghGH]?0*\d{1,5}$/.test(t)).length;
  return strongLike >= Math.max(1, Math.floor(sample.length * 0.6));
}

/**
 * Testament tag of a Strong topic: 'H' (Hebrew/OT) or 'G' (Greek/NT) from a
 * prefixed topic like "H7225" / "G2424"; '' when there's no prefix. Lets the
 * server disambiguate H#### from G#### that share the same digits.
 */
export function strongLang(topic: string): string {
  const m = String(topic)
    .trim()
    .match(/^([ghGH])/);
  return m ? m[1].toUpperCase() : '';
}

/** Lookup key: Strong topics -> bare digits (no prefix/zeros); words -> lowercased. */
export function dictTopicNorm(topic: string, isStrong: boolean): string {
  const t = String(topic).trim();
  if (isStrong) {
    const m = t.match(/(\d+)/);
    if (m) return String(Number.parseInt(m[1], 10));
  }
  return t.toLowerCase();
}

export interface DictMeta {
  name: string;
  language: string;
  type: string;
  isStrong: boolean;
}

export function dictMeta(info: Record<string, string>, topics: string[]): DictMeta {
  const isStrong = isStrongDictionary(topics);
  return {
    name: info.description || info.title || '',
    language: info.language || '',
    type: info.dictionary_type || info.type || (isStrong ? 'strong' : 'explanatory'),
    isStrong,
  };
}

export interface CommentaryEntry {
  book: number;
  chapterFrom: number;
  verseFrom: number;
  chapterTo: number;
  verseTo: number;
  marker: string;
  /** raw HTML as in the module (cleanDefinition() at import) */
  text: string;
}

export const MYBIBLE_COMMENTARIES_SQL = `SELECT book_number, chapter_number_from, verse_number_from,
       chapter_number_to, verse_number_to, marker, text
FROM commentaries`;

export function commentaryEntry(r: Row): CommentaryEntry {
  return {
    book: Number(r.book_number),
    chapterFrom: Number(r.chapter_number_from),
    verseFrom: Number(r.verse_number_from),
    chapterTo: Number(r.chapter_number_to ?? r.chapter_number_from),
    verseTo: Number(r.verse_number_to ?? r.verse_number_from),
    marker: String(r.marker ?? ''),
    text: String(r.text ?? ''),
  };
}

export const MYBIBLE_CROSSREFS_SQL =
  'SELECT book, chapter, verse, book_to, chapter_to, verse_to_start, verse_to_end FROM cross_references';

// ---------------------------------------------------------------------------------------
// One module → one segment (browser drop). Synchronous: both SQLite engines that run it
// (SQLite-WASM oo1 in the worker, better-sqlite3 in tests) are.

/** The little a converter needs from a synchronous SQLite connection. */
export interface SyncConn {
  all(sql: string, params?: SqlParam[]): Row[];
  /** A prepared statement; `done()` releases it. */
  prepare(sql: string): { run(params: SqlParam[]): void; done(): void };
}

/**
 * Ids of converted modules live far above anything a built library uses (translations
 * and dictionaries count from 1, verse ids reach a few million), so a dropped module
 * merges next to server segments without colliding — the merge is INSERT OR IGNORE and
 * would otherwise silently drop the clashing rows. The id comes from the file's hash:
 * the same module converts to the same ids on every device.
 */
export const DROPPED_ID_BASE = 1_000_000;
const DROPPED_ID_SPAN = 1_000_000;
/** verse id = translation id × stride + ordinal (still far below 2^53) */
export const DROPPED_VERSE_STRIDE = 100_000;

export function droppedId(hash32: number): number {
  return DROPPED_ID_BASE + ((hash32 >>> 0) % DROPPED_ID_SPAN);
}

const FNV_OFFSET = 0x811c9dc5;
const fnvStep = (h: number, byte: number) => Math.imul(h ^ byte, 0x01000193);

/**
 * A module file's identity for droppedId(): FNV-1a over its length, the first 64 KB
 * (SQLite header with its change counter, schema, info table) and every 61st byte after.
 * A sample — a 100 MB dictionary hashes in milliseconds, not most of a second.
 */
export function moduleHash(bytes: Uint8Array): number {
  let h = FNV_OFFSET;
  for (const b of String(bytes.length)) h = fnvStep(h, b.charCodeAt(0));
  const head = Math.min(bytes.length, 65536);
  for (let i = 0; i < head; i++) h = fnvStep(h, bytes[i]);
  for (let i = head; i < bytes.length; i += 61) h = fnvStep(h, bytes[i]);
  return h >>> 0;
}

export interface Converted {
  kind: MyBibleKind;
  /** label shown in the UI (translation abbr / dictionary / commentary name) */
  abbr: string;
  title: string;
  /** verses / entries / notes / references written */
  items: number;
}

/** A module that can't be imported; the message is a dictionary key, with `vars` apart (0.11.6). */
export class ModuleError extends Error {
  constructor(
    readonly key: string,
    readonly vars?: Vars,
  ) {
    super(fill(key, vars));
  }
}

function readInfo(src: SyncConn): Record<string, string> {
  const info: Record<string, string> = {};
  const has = src.all("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'info'");
  if (has.length === 0) return info;
  for (const r of src.all('SELECT name, value FROM info')) info[String(r.name)] = String(r.value);
  return info;
}

/**
 * Insert many rows with ONE statement: they go in as a JSON array that SQLite unpacks
 * itself (json_each). In WASM every statement run is a JS↔SQLite crossing, and a Strong's
 * Bible has ~300k index rows — per-row inserts cost seconds there (KJV+: 6.5 s).
 */
function bulk(
  conn: SyncConn,
  table: string,
  cols: string[],
  rows: SqlParam[][],
  orIgnore = false,
): void {
  if (rows.length === 0) return;
  const st = conn.prepare(
    `INSERT ${orIgnore ? 'OR IGNORE ' : ''}INTO ${table} (${cols.join(', ')})
     SELECT ${cols.map((_, i) => `value ->> ${i}`).join(', ')} FROM json_each(?)`,
  );
  try {
    st.run([JSON.stringify(rows)]);
  } finally {
    st.done();
  }
}

/**
 * Convert the MyBible module open as `src` into `out` — an empty database with
 * SCHEMA_SQL and SEGMENT_NORM_TABLE_SQL (i.e. a segment). Run it inside a transaction.
 */
export function convertMyBible(
  src: SyncConn,
  out: SyncConn,
  opts: { fileName: string; id: number },
): Converted {
  const tables = src
    .all("SELECT name FROM sqlite_master WHERE type = 'table'")
    .map((r) => String(r.name));
  const kind = myBibleKind(tables);
  if (!kind) {
    throw new ModuleError(
      N_(
        'Це не модуль MyBible, який можна імпортувати (Біблія, словник, коментарі чи перехресні посилання)',
      ),
    );
  }
  const info = readInfo(src);
  const label = moduleLabel(opts.fileName);
  const { id } = opts;

  if (kind === 'bible') {
    const meta = bibleMeta(info);
    const books = src.all(
      'SELECT book_color, book_number, short_name, long_name FROM books ORDER BY book_number',
    );
    const verses = src.all(
      'SELECT book_number, chapter, verse, text FROM verses ORDER BY book_number, chapter, verse',
    );
    if (books.length === 0 || verses.length === 0) {
      throw new ModuleError(N_('У модулі немає книг або віршів'));
    }
    if (verses.length >= DROPPED_VERSE_STRIDE) {
      throw new ModuleError(N_('Забагато віршів у модулі ({n})'), { n: verses.length });
    }
    const abbr = cleanAbbr(label, meta.description);
    bulk(
      out,
      'translations',
      ['id', 'abbr', 'title', 'language', 'rtl', 'has_strong', 'source_file', 'source_hash'],
      [
        [
          id,
          abbr,
          meta.description || abbr,
          meta.language,
          meta.rtl ? 1 : 0,
          meta.hasStrong ? 1 : 0,
          opts.fileName,
          `drop:${id}`,
        ],
      ],
    );
    const bookRows: SqlParam[][] = [];
    const nameRows: SqlParam[][] = [];
    for (const b of books) {
      const shortName = String(b.short_name ?? '');
      const longName = String(b.long_name ?? '');
      bookRows.push([id, Number(b.book_number), shortName, longName, String(b.book_color ?? '')]);
      const names = new Set(
        [longName, shortName].map((n) => normalizeForSearch(n)).filter(Boolean),
      );
      for (const n of names) nameRows.push([id, Number(b.book_number), n]);
    }
    bulk(
      out,
      'books',
      ['translation_id', 'book_number', 'short_name', 'long_name', 'color'],
      bookRows,
      true,
    );
    bulk(out, 'book_names', ['translation_id', 'book_number', 'name_norm'], nameRows);

    const verseRows: SqlParam[][] = [];
    const normRows: SqlParam[][] = [];
    const strongRows: SqlParam[][] = [];
    verses.forEach((v, i) => {
      const verseId = id * DROPPED_VERSE_STRIDE + i + 1;
      const book = Number(v.book_number);
      const r = verseRecord(v.text as string | null, book, meta);
      verseRows.push([verseId, id, book, Number(v.chapter), Number(v.verse), r.text, r.textRaw]);
      normRows.push([verseId, r.norm]);
      for (const n of r.strongs) strongRows.push([n, r.strongLang, id, verseId]);
    });
    bulk(
      out,
      'verses',
      ['id', 'translation_id', 'book_number', 'chapter', 'verse', 'text', 'text_raw'],
      verseRows,
    );
    bulk(out, 'verses_norm', ['id', 'text_norm'], normRows);
    // In primary-key order: the WITHOUT ROWID b-tree is then appended to, not split at
    // random (KJV+: ~300k rows).
    strongRows.sort(
      (a, b) =>
        (a[0] as number) - (b[0] as number) ||
        (a[1] === b[1] ? 0 : (a[1] as string) < (b[1] as string) ? -1 : 1) ||
        (a[3] as number) - (b[3] as number),
    );
    bulk(out, 'verse_strongs', ['strong', 'lang', 'translation_id', 'verse_id'], strongRows, true);
    return { kind, abbr, title: meta.description || abbr, items: verses.length };
  }

  if (kind === 'dictionary') {
    const entries = src.all('SELECT topic, definition FROM dictionary');
    if (entries.length === 0) throw new ModuleError(N_('Словник порожній'));
    const meta = dictMeta(
      info,
      entries.map((e) => String(e.topic)),
    );
    bulk(
      out,
      'dictionaries',
      ['id', 'abbr', 'name', 'language', 'type', 'is_strong'],
      [[id, label, meta.name || label, meta.language, meta.type, meta.isStrong ? 1 : 0]],
    );
    bulk(
      out,
      'dictionary_entries',
      ['dictionary_id', 'topic', 'topic_norm', 'strong_lang', 'definition'],
      entries.map((e) => {
        const topic = String(e.topic);
        return [
          id,
          topic,
          dictTopicNorm(topic, meta.isStrong),
          meta.isStrong ? strongLang(topic) : '',
          cleanDefinition(String(e.definition ?? '')),
        ];
      }),
    );
    return { kind, abbr: label, title: meta.name || label, items: entries.length };
  }

  if (kind === 'commentaries') {
    const notes = src
      .all(MYBIBLE_COMMENTARIES_SQL)
      .map(commentaryEntry)
      .filter((c) => c.text.trim());
    bulk(
      out,
      'commentaries',
      ['source', 'book', 'chapter_from', 'verse_from', 'chapter_to', 'verse_to', 'marker', 'text'],
      notes.map((c) => [
        label,
        c.book,
        c.chapterFrom,
        c.verseFrom,
        c.chapterTo,
        c.verseTo,
        c.marker,
        cleanDefinition(c.text),
      ]),
    );
    return { kind, abbr: label, title: info.description || label, items: notes.length };
  }

  const refs = src.all(MYBIBLE_CROSSREFS_SQL);
  bulk(
    out,
    'cross_references',
    ['book', 'chapter', 'verse', 'book_to', 'chapter_to', 'verse_to_start', 'verse_to_end'],
    refs.map((r) => [
      Number(r.book),
      Number(r.chapter),
      Number(r.verse),
      Number(r.book_to),
      Number(r.chapter_to),
      Number(r.verse_to_start),
      Number(r.verse_to_end),
    ]),
  );
  return { kind, abbr: label, title: info.description || label, items: refs.length };
}
