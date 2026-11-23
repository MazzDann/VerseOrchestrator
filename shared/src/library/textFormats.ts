import { unzipSync, zipSync } from 'fflate';
import { decodeText } from '../documents/parse.js';
import { N_ } from '../i18n/index.js';
import { bulk, DROPPED_VERSE_STRIDE, ModuleError, type SyncConn } from './moduleFormat.js';
import type { ParsedModule, TextFormat } from './formats/moduleText.js';
import { readOsis } from './formats/osis.js';
import { readUsfm } from './formats/usfm.js';
import { looksLikeVpl, readVpl } from './formats/vpl.js';
import { decodeXmlFile } from './formats/xml.js';
import { readZefania } from './formats/zefania.js';

/**
 * Bible modules in text formats (1.25.0-beta.6): USFM, OSIS, Zefania and VPL, beside .SQLite3. One
 * reading for every intake — the builder (modules/), a file dropped on the server, a file dropped
 * into the browser's engine: the file's bytes → books, verses in the modules' markup, titles,
 * notes. The numbering stays the file's own: other translations are aligned to it
 * (versification.ts), never the stored verses changed.
 */
export type { ModuleNote, ParsedModule, TextFormat } from './formats/moduleText.js';

/** The extensions a text module may have; the shared ones (.xml, .txt, .zip) are told by content. */
export const TEXT_MODULE_EXT = /\.(usfm|sfm|osis|vpl|xml|txt|zip)$/i;
/** Extensions that name no other kind of file. */
export const TEXT_MODULE_SURE_EXT = /\.(usfm|sfm|osis|vpl|osis\.xml|vpl\.txt)$/i;
/** A whole Bible in text is under 40 MB in any of them, its Strong numbers included. */
export const TEXT_MODULE_MAX = 128 * 1024 * 1024;
/** How much of a file (not a .zip) is enough to tell its format. */
export const TEXT_MODULE_HEAD = 64 * 1024;
const UNZIPPED_MAX = 256 * 1024 * 1024;

const TEXT_PART = /\.(usfm|sfm|ptx|osis|vpl|xml|txt)$/i;
const baseName = (name: string) => name.replace(/^.*[\\/]/, '');
/** A Mac's own copies and hidden files in an archive. */
const isJunk = (name: string) => /(^|\/)(__MACOSX\/|\.)/.test(name);

export const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;

const NO_VERSES = N_('У файлі немає віршів, які можна прочитати (USFM, OSIS, Zefania, VPL)');

/** A file's format by its first 64 KB, whatever its name; null when it is none of them. */
function formatOfText(head: Uint8Array): TextFormat | null {
  // a piece of a file may end inside a letter: what is asked of it is ASCII anyway
  const utf16 = (head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff);
  const s = (utf16 ? decodeText(head) : new TextDecoder('utf-8').decode(head)).trimStart();
  if (s.startsWith('<')) {
    if (/<(\w+:)?osis[\s>]/i.test(s)) return 'osis';
    if (/<xmlbible[\s>]/i.test(s)) return 'zefania';
    return null;
  }
  if (/^\\(id|usfm|ide)\s/m.test(s.slice(0, 4096))) return 'usfm';
  return looksLikeVpl(s) ? 'vpl' : null;
}

/** The text files in an archive that are modules' parts, unpacked within the limit. */
function unzipTexts(bytes: Uint8Array): { name: string; bytes: Uint8Array }[] {
  let total = 0;
  const parts = unzipSync(bytes, {
    filter: (f) => {
      if (!TEXT_PART.test(f.name) || isJunk(f.name)) return false;
      total += f.originalSize;
      if (total > UNZIPPED_MAX) throw new ModuleError(N_('Файл завеликий'));
      return true;
    },
  });
  return Object.entries(parts)
    .map(([name, b]) => ({ name, bytes: b }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** An archive's module: the USFM books in it, else its first OSIS, Zefania or VPL file. */
function zipModule(
  bytes: Uint8Array,
): { format: TextFormat; files: { name: string; bytes: Uint8Array }[] } | null {
  const parts = unzipTexts(bytes).map((p) => ({ ...p, format: formatOfText(p.bytes) }));
  const usfm = parts.filter((p) => p.format === 'usfm');
  if (usfm.length > 0) return { format: 'usfm', files: usfm };
  const one = parts.find((p) => p.format !== null);
  return one ? { format: one.format!, files: [one] } : null;
}

/**
 * Which text module format a file is in, or null. `bytes` — its first 64 KB are enough, but for a
 * .zip (read whole).
 */
export function detectTextFormat(name: string, bytes: Uint8Array): TextFormat | null {
  if (!TEXT_MODULE_EXT.test(name) || isJunk(baseName(name))) return null;
  try {
    return isZip(bytes) ? (zipModule(bytes)?.format ?? null) : formatOfText(bytes);
  } catch {
    return null;
  }
}

/** USFM books given one by one, read as one module (a folder of them). */
export function parseUsfmFiles(files: Uint8Array[]): ParsedModule {
  return checked(readUsfm(files.map(decodeText)));
}

function checked(parsed: ParsedModule): ParsedModule {
  if (parsed.verses.length === 0) throw new ModuleError(NO_VERSES);
  // the browser gives a module's verses a range of ids: the same limit everywhere
  if (parsed.verses.length >= DROPPED_VERSE_STRIDE)
    throw new ModuleError(N_('Забагато віршів у модулі ({n})'), { n: parsed.verses.length });
  return parsed;
}

/** A module file in any of the text formats, read; a ModuleError when nothing can be. */
export function parseTextModule(name: string, bytes: Uint8Array): ParsedModule {
  let files = [{ name, bytes }];
  let format: TextFormat | null;
  if (isZip(bytes)) {
    let zip: ReturnType<typeof zipModule>;
    try {
      zip = zipModule(bytes);
    } catch (e) {
      if (e instanceof ModuleError) throw e;
      throw new ModuleError(N_('Архів не читається'));
    }
    format = zip?.format ?? null;
    files = zip?.files ?? [];
  } else format = formatOfText(bytes.subarray(0, TEXT_MODULE_HEAD));
  if (format === null) throw new ModuleError(NO_VERSES);
  if (format === 'usfm') return parseUsfmFiles(files.map((f) => f.bytes));
  const one = files[0].bytes;
  if (format === 'vpl') return checked(readVpl(decodeText(one)));
  const xml = decodeXmlFile(one);
  return checked(format === 'osis' ? readOsis(xml) : readZefania(xml));
}

/**
 * Several USFM books dropped together are one module: packed into one .zip. Its name: what the
 * files' names share («01-GENxyz.usfm», «02-EXOxyz.usfm» → «xyz»), else `fallback`.
 */
export function packUsfm(
  files: { name: string; bytes: Uint8Array }[],
  fallback = 'USFM',
): { name: string; bytes: Uint8Array } {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[baseName(f.name)] = f.bytes;
  return {
    name: `${sharedName(files.map((f) => f.name)) || fallback}.zip`,
    bytes: zipSync(entries, { mtime: PACKED }),
  };
}

/** One time for every packed file: the same books make the same archive (the same module again). */
const PACKED = new Date(2000, 0, 1);

/** What every book's file name has beside its number and code. */
function sharedName(names: string[]): string {
  const rests = new Set(
    names.map((n) => {
      const stem = baseName(n).replace(/\.[^.]+$/, '');
      const m = /^\d{0,3}[-_ ]?([1-4A-Z][A-Z]{2})(.*)$/i.exec(stem);
      return (m ? m[2] : stem).replace(/^[-_ .]+|[-_ .]+$/g, '');
    }),
  );
  const [only] = rests;
  return rests.size === 1 ? only : '';
}

/**
 * The module's tables as a .SQLite3 Bible has them — what the rest of the app reads. `conn` is an
 * empty database; run it inside a transaction.
 */
export function writeModuleTables(conn: SyncConn, parsed: ParsedModule): void {
  for (const ddl of [
    'CREATE TABLE info (name TEXT NOT NULL, value TEXT NOT NULL)',
    `CREATE TABLE books (book_number INTEGER NOT NULL PRIMARY KEY, short_name TEXT NOT NULL,
       long_name TEXT NOT NULL, book_color TEXT NOT NULL)`,
    `CREATE TABLE verses (book_number INTEGER NOT NULL, chapter INTEGER NOT NULL,
       verse INTEGER NOT NULL, text TEXT NOT NULL, PRIMARY KEY (book_number, chapter, verse))`,
    `CREATE TABLE stories (book_number INTEGER NOT NULL, chapter INTEGER NOT NULL,
       verse INTEGER NOT NULL, order_if_several INTEGER NOT NULL, title TEXT NOT NULL)`,
    `CREATE TABLE commentaries (book_number INTEGER NOT NULL, chapter_number_from INTEGER NOT NULL,
       verse_number_from INTEGER NOT NULL, marker TEXT NOT NULL, text TEXT NOT NULL)`,
  ]) {
    const st = conn.prepare(ddl);
    st.run([]);
    st.done();
  }
  const { info } = parsed;
  bulk(
    conn,
    'info',
    ['name', 'value'],
    [
      ['description', info.description],
      ['language', info.language],
      ['right_to_left', String(info.rtl)],
      ['strong_numbers', String(info.hasStrong)],
    ],
  );
  bulk(
    conn,
    'books',
    ['book_number', 'short_name', 'long_name', 'book_color'],
    parsed.books.map((b) => [b.number, b.short, b.long, b.color]),
  );
  bulk(
    conn,
    'verses',
    ['book_number', 'chapter', 'verse', 'text'],
    parsed.verses.map((v) => [v.book, v.chapter, v.verse, v.text]),
  );
  bulk(
    conn,
    'stories',
    ['book_number', 'chapter', 'verse', 'order_if_several', 'title'],
    parsed.subheadings.map((h) => [h.book, h.chapter, h.verse, h.ord, h.title]),
  );
  bulk(
    conn,
    'commentaries',
    ['book_number', 'chapter_number_from', 'verse_number_from', 'marker', 'text'],
    parsed.notes.map((n) => [n.book, n.chapter, n.verse, n.marker, n.text]),
  );
}
