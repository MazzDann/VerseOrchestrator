import { strFromU8, unzipSync } from 'fflate';

/**
 * Documents (1.17.0-beta.1): a sermon, a lecture, a report — a Word (.docx), Markdown (.md)
 * or plain-text (.txt) file read into the library's shape for any structured text: headings
 * open sections, paragraphs, quotes and list items are the units shown one at a time, the way
 * verses are. Pure — bytes in, document out — so the server (the documents folder) and the
 * browser read a file the same way.
 */

export type DocUnitKind = 'heading' | 'para' | 'quote' | 'item';

export interface DocUnit {
  kind: DocUnitKind;
  /** a heading's level (1 = the biggest); a list item's depth (0 = top); 0 otherwise */
  level: number;
  text: string;
}

export interface ParsedDocument {
  units: DocUnit[];
}

export type DocumentKind = 'docx' | 'md' | 'txt';

/** The version of these readers: a document read by an older one is read again. */
export const DOC_READER = 1;

/** A unit longer than this is cut at a sentence end: a slide holds a paragraph, not a page. */
export const UNIT_MAX = 900;
/** More units than this and the rest of the file is left out (a book is not a document). */
export const UNITS_MAX = 20000;
/** An unpacked .docx part over this is refused (a zip bomb, or not a document). */
const PART_MAX = 64 * 1024 * 1024;

/** The kind of a document file by its name, or null for any other file. */
export function documentKind(fileName: string): DocumentKind | null {
  const base = fileName.replace(/^.*[\\/]/, '');
  // Word's lock files («~$проповідь.docx») and a Mac's resource forks («._x.md») are not documents
  if (base.startsWith('~$') || base.startsWith('._') || base.startsWith('.')) return null;
  const m = /\.(docx|md|markdown|txt)$/i.exec(base);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ext === 'markdown' ? 'md' : (ext as DocumentKind);
}

/** A document's title: its file name without the extension, in one Unicode form. */
export function documentTitle(fileName: string): string {
  return fileName
    .replace(/^.*[\\/]/, '')
    .replace(/\.(docx|md|markdown|txt)$/i, '')
    .normalize('NFC')
    .trim();
}

/** Read a document file; null when it isn't readable or holds no text. */
export function parseDocument(bytes: Uint8Array, fileName: string): ParsedDocument | null {
  const kind = documentKind(fileName);
  if (!kind) return null;
  const units =
    kind === 'docx'
      ? readDocx(bytes)
      : kind === 'md'
        ? readMarkdown(decodeText(bytes))
        : readPlainText(decodeText(bytes));
  if (!units) return null;
  const out = finish(units);
  return out.length > 0 ? { units: out } : null;
}

// ── Text files ────────────────────────────────────────────────────────────────────────────

/**
 * The text of a .txt / .md file: UTF-8 (with or without a BOM), UTF-16 with a BOM (Notepad's
 * «Unicode»), else Windows-1251 — an older Ukrainian text file is in it more often than not.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    // (the decoder takes a BOM away itself)
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

/**
 * Plain text: an empty line ends a paragraph, its own line breaks stay (a poem, an address).
 * A file with no empty line at all is one paragraph per line.
 */
export function readPlainText(text: string): DocUnit[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[][] = [];
  const blank = lines.some((l, i) => !l.trim() && i > 0 && i < lines.length - 1);
  let cur: string[] = [];
  for (const l of lines) {
    if (!l.trim()) {
      if (cur.length) blocks.push(cur);
      cur = [];
    } else if (blank) cur.push(l.trim());
    else blocks.push([l.trim()]);
  }
  if (cur.length) blocks.push(cur);
  return blocks.map((b) => ({ kind: 'para', level: 0, text: b.join('\n') }));
}

/** Markdown's inline marks away: emphasis, code, links (their words stay), images. */
function plainInline(s: string): string {
  return (
    s
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>\n]+>/g, '')
      .replace(/`([^`]*)`/g, '$1')
      // `*` marks inside a word too; `_` only between words (any alphabet) — «file_name_x» stays
      .replace(/\*\*(?=\S)(.+?)\*\*/g, '$1')
      .replace(/(^|[^\p{L}\p{N}_])__(?=\S)(.+?)__(?![\p{L}\p{N}_])/gu, '$1$2')
      .replace(/(^|[^*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, '$1$2')
      .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([^_\n]+?)_(?![\p{L}\p{N}_])/gu, '$1$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/\\([\\`*_{}[\]()#+\-.!>|])/g, '$1')
      .trim()
  );
}

/**
 * Markdown: `#` headings (and underlined ones), `>` quotes, `-` / `*` / `1.` list items,
 * paragraphs between empty lines (their lines joined, as Markdown shows them); code blocks
 * stay as written, tables become a line per row.
 */
export function readMarkdown(text: string): DocUnit[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const units: DocUnit[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  let item: { level: number; lines: string[] } | null = null;
  const flush = () => {
    if (para.length) units.push({ kind: 'para', level: 0, text: plainInline(para.join(' ')) });
    if (quote.length) units.push({ kind: 'quote', level: 0, text: quoteText(quote) });
    if (item)
      units.push({ kind: 'item', level: item.level, text: plainInline(item.lines.join(' ')) });
    para = [];
    quote = [];
    item = null;
  };
  let i = 0;
  // front matter (--- … ---) at the very top is the file's settings, not its text
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, n) => n > 0 && /^(---|\.\.\.)\s*$/.test(l));
    if (end > 0) i = end + 1;
  }
  for (; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    const fence = /^(```|~~~)/.exec(t);
    if (fence) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) code.push(lines[i]);
      if (code.some((c) => c.trim())) units.push({ kind: 'para', level: 0, text: code.join('\n') });
      continue;
    }
    if (!t) {
      flush();
      continue;
    }
    // closing hashes go only after a space: «# C#» keeps its own
    const h = /^(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(t);
    if (h) {
      flush();
      units.push({ kind: 'heading', level: h[1].length, text: plainInline(h[2]) });
      continue;
    }
    // «Title» over «=====» / «-----»: a heading of level 1 / 2
    if (para.length === 1 && /^(=+|-+)$/.test(t) && !quote.length && !item) {
      units.push({ kind: 'heading', level: t[0] === '=' ? 1 : 2, text: plainInline(para[0]) });
      para = [];
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(t)) {
      flush(); // a rule between parts
      continue;
    }
    if (t.startsWith('>')) {
      if (!quote.length) flush();
      quote.push(t.replace(/^>\s?/, '').replace(/^>\s?/, ''));
      continue;
    }
    const li = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      item = {
        level: Math.min(Math.floor(li[1].replace(/\t/g, '    ').length / 2), 5),
        lines: [li[3]],
      };
      continue;
    }
    if (/^\|.*\|$/.test(t)) {
      flush();
      if (/^\|[\s:|-]+\|$/.test(t)) continue; // the row under a table's header
      const cells = t
        .slice(1, -1)
        .split('|')
        .map((c) => plainInline(c))
        .filter(Boolean);
      if (cells.length) units.push({ kind: 'para', level: 0, text: cells.join(' · ') });
      continue;
    }
    if (quote.length) quote.push(t);
    else if (item) item.lines.push(t);
    else para.push(t);
  }
  flush();
  return units;
}

/** A quote's lines: an empty `>` line parts its paragraphs, the rest join as in a paragraph. */
function quoteText(lines: string[]): string {
  return lines
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => plainInline(p.replace(/\n/g, ' ')))
    .filter(Boolean)
    .join('\n');
}

// ── Word (.docx) ──────────────────────────────────────────────────────────────────────────

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

const attr = (xml: string, re: RegExp): string | undefined => re.exec(xml)?.[1];

interface StyleInfo {
  name: string;
  outline?: number;
  basedOn?: string;
  numbered: boolean;
}

/** Paragraph styles by id: their names (a Ukrainian Word names its ids «1», «a3»…), outline levels. */
function readStyles(xml: string): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>();
  const re = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (!/w:type="paragraph"/.test(m[1])) continue;
    const id = attr(m[1], /w:styleId="([^"]*)"/);
    if (!id) continue;
    const outline = attr(m[2], /<w:outlineLvl w:val="(\d+)"/);
    styles.set(id, {
      name: (attr(m[2], /<w:name w:val="([^"]*)"/) ?? id).toLowerCase(),
      outline: outline !== undefined ? Number(outline) : undefined,
      basedOn: attr(m[2], /<w:basedOn w:val="([^"]*)"/),
      numbered: /<w:numPr>/.test(m[2]),
    });
  }
  return styles;
}

// a title's and a subtitle's style names, in English or a Ukrainian / Russian Word — data
const TITLE_STYLES = new Set(['title', 'назва', 'название']); // i18n-ignore: style names
const SUBTITLE_STYLES = new Set(['subtitle', 'підзаголовок', 'подзаголовок']); // i18n-ignore: style names

/** What a paragraph style makes of its paragraphs, following `basedOn` a few steps. */
function styleKind(
  styles: Map<string, StyleInfo>,
  id: string | undefined,
): { kind: DocUnitKind; level: number } | null {
  for (let n = 0; id && n < 8; n++) {
    const s = styles.get(id);
    const name = (s?.name ?? id).toLowerCase();
    // Word's own style names, in English or a Ukrainian / Russian Word — data
    const h = /^(?:heading|заголовок)\s*(\d)$/.exec(name); // i18n-ignore: style names
    if (h) return { kind: 'heading', level: Math.max(1, Number(h[1])) };
    if (TITLE_STYLES.has(name)) return { kind: 'heading', level: 1 };
    if (SUBTITLE_STYLES.has(name)) return { kind: 'heading', level: 2 };
    if (/quote|цитата/.test(name)) return { kind: 'quote', level: 0 }; // i18n-ignore: style names
    if (s?.outline !== undefined && s.outline < 9) return { kind: 'heading', level: s.outline + 1 };
    if (/^list/.test(name) || s?.numbered) return { kind: 'item', level: 0 };
    id = s?.basedOn;
  }
  return null;
}

/** A paragraph's own text: its runs, tabs as spaces, breaks as new lines; deleted and field-code text left out. */
function paragraphText(xml: string): string {
  const parts: string[] = [];
  const re =
    /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(?:tab|ptab)\b[^>]*\/>|<w:(?:br|cr)\b([^>]*)\/>|<w:noBreakHyphen\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) parts.push(decodeXml(m[1]));
    else if (m[0].startsWith('<w:tab') || m[0].startsWith('<w:ptab')) parts.push(' ');
    else if (m[0].startsWith('<w:noBreakHyphen')) parts.push('-');
    // a page break is no line inside a paragraph
    else if (!/w:type="page"/.test(m[2] ?? '')) parts.push('\n');
  }
  return parts
    .join('')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

export function readDocx(bytes: Uint8Array): DocUnit[] | null {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(bytes, {
      filter: (f) =>
        (f.name === 'word/document.xml' || f.name === 'word/styles.xml') &&
        f.originalSize <= PART_MAX,
    });
  } catch {
    return null;
  }
  if (!zip['word/document.xml']) return null;
  let xml = strFromU8(zip['word/document.xml']);
  const styles = zip['word/styles.xml'] ? readStyles(strFromU8(zip['word/styles.xml'])) : new Map();
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml);
  xml = (body ? body[1] : xml)
    // a drawing's text has a Fallback copy too; text boxes would nest paragraphs in paragraphs
    .replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '')
    .replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, '')
    .replace(/<w:delText(?:\s[^>]*)?>[\s\S]*?<\/w:delText>/g, '')
    .replace(/<w:instrText(?:\s[^>]*)?>[\s\S]*?<\/w:instrText>/g, '')
    .replace(/<w:footnoteReference\b[^>]*\/>|<w:endnoteReference\b[^>]*\/>/g, '')
    // an empty paragraph written as one tag («<w:p w14:paraId="…"/>») would swallow the next one
    .replace(/<w:p\b[^>]*\/>/g, '');
  const units: DocUnit[] = [];
  const re = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const p = m[1];
    const text = paragraphText(p);
    if (!text) continue;
    const pPr = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p)?.[1] ?? '';
    const own = attr(pPr, /<w:outlineLvl w:val="(\d+)"/);
    const ilvl = attr(pPr, /<w:ilvl w:val="(\d+)"/);
    let kind: DocUnitKind = 'para';
    let level = 0;
    const byStyle = styleKind(styles, attr(pPr, /<w:pStyle w:val="([^"]*)"/));
    if (own !== undefined && Number(own) < 9) {
      kind = 'heading';
      level = Number(own) + 1;
    } else if (byStyle) {
      ({ kind, level } = byStyle);
    }
    if (kind === 'para' && /<w:numPr>/.test(pPr)) kind = 'item';
    if (kind === 'item') level = Math.min(Number(ilvl ?? 0), 5);
    units.push({ kind, level: kind === 'heading' ? Math.min(level, 6) : level, text });
  }
  return units;
}

// ── Common ────────────────────────────────────────────────────────────────────────────────

/** Cut a long text at sentence ends into parts of at most `max` characters. */
export function splitLong(text: string, max = UNIT_MAX): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const head = rest.slice(0, max);
    // the last sentence end in the second half, else the last space, else a hard cut
    const sentence = Math.max(
      ...['. ', '! ', '? ', '… ', '.\n', '\n'].map((s) => head.lastIndexOf(s)),
    );
    const cut =
      sentence > max / 2
        ? sentence + 1
        : head.lastIndexOf(' ') > max / 2
          ? head.lastIndexOf(' ')
          : max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Empty units out, long ones cut, a heading's level kept within 1..6, the count capped. */
function finish(units: DocUnit[]): DocUnit[] {
  const out: DocUnit[] = [];
  for (const u of units) {
    // eslint-disable-next-line no-control-regex -- NUL can't go into Postgres text
    const text = u.text.replace(/\u0000/g, '').trim();
    if (!text) continue;
    for (const part of u.kind === 'heading' ? [text.slice(0, 500)] : splitLong(text)) {
      out.push({ ...u, text: part });
      if (out.length >= UNITS_MAX) return out;
    }
  }
  return out;
}
