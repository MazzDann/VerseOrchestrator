import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

/** Faithful render style of one slide (a positioned text box on a background). */
export interface SlideStyleSpec {
  bg: string; // background colour (hex)
  color: string; // text colour (hex)
  font: string; // resolved font family
  bold: boolean;
  align: 'left' | 'center' | 'right';
  x: number; // text box, % of slide
  y: number;
  w: number;
  h: number;
  size: number; // original font size, % of slide height (cqh); 0 = unknown → auto-fit
}

export interface SongSlide {
  text: string;
  /** Faithful pptx style; null if it couldn't be derived. */
  style: SlideStyleSpec | null;
}

export interface Song {
  number: number | null;
  title: string;
  slides: SongSlide[];
}

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

/** Readable text of a slide-shape's text body: `<a:t>` runs concatenated, `<a:br>`/`</a:p>` → newlines. */
function bodyText(xml: string): string {
  const parts: string[] = [];
  const re = /<a:t>([\s\S]*?)<\/a:t>|<a:br\b[^>]*?>|<\/a:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) parts.push(m[1] !== undefined ? decodeXml(m[1]) : '\n');
  return parts
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const slideNum = (name: string): number =>
  Number.parseInt(name.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10);

const first = (xml: string, re: RegExp): string | undefined => xml.match(re)?.[1];

interface Theme {
  colors: Record<string, string>; // dk1, lt1, dk2, lt2, accent1..6 → hex
  clrMap: Record<string, string>; // bg1, tx1, … → dkN/ltN/accentN
  majorLatin: string;
  minorLatin: string;
}

function parseTheme(themeXml: string, masterXml: string): Theme {
  const colors: Record<string, string> = {};
  const scheme = first(themeXml, /<a:clrScheme[^>]*>([\s\S]*?)<\/a:clrScheme>/) ?? '';
  for (const key of [
    'dk1',
    'lt1',
    'dk2',
    'lt2',
    'accent1',
    'accent2',
    'accent3',
    'accent4',
    'accent5',
    'accent6',
  ]) {
    const block = first(scheme, new RegExp(`<a:${key}>([\\s\\S]*?)</a:${key}>`)) ?? '';
    const last = first(block, /lastClr="([0-9A-Fa-f]{6})"/);
    const srgb = first(block, /<a:srgbClr val="([0-9A-Fa-f]{6})"/);
    if (last || srgb) colors[key] = `#${(srgb ?? last)!.toLowerCase()}`;
  }
  const clrMap: Record<string, string> = {};
  const mapTag = first(masterXml, /<p:clrMap\b([^>]*)\/?>/) ?? '';
  for (const m of mapTag.matchAll(/(\w+)="(\w+)"/g)) clrMap[m[1]] = m[2];
  return {
    colors,
    clrMap,
    majorLatin: first(themeXml, /<a:majorFont><a:latin typeface="([^"]*)"/) ?? 'Calibri',
    minorLatin: first(themeXml, /<a:minorFont><a:latin typeface="([^"]*)"/) ?? 'Calibri',
  };
}

/** Resolve a `<a:solidFill>` block (srgbClr or schemeClr) to a hex colour, via the theme. */
function resolveFill(fillXml: string | undefined, theme: Theme): string | null {
  if (!fillXml) return null;
  const srgb = first(fillXml, /<a:srgbClr val="([0-9A-Fa-f]{6})"/);
  if (srgb) return `#${srgb.toLowerCase()}`;
  let scheme = first(fillXml, /<a:schemeClr val="(\w+)"/);
  if (!scheme) return null;
  scheme = theme.clrMap[scheme] ?? scheme; // bg1→lt1, tx1→dk1, …
  if (scheme === 'phClr') return null;
  return theme.colors[scheme] ?? null;
}

function resolveFont(typeface: string | undefined, theme: Theme): string {
  const t = typeface ?? '+mn-lt';
  const name =
    t === '+mj-lt'
      ? theme.majorLatin
      : t === '+mn-lt' || t.startsWith('+mn')
        ? theme.minorLatin
        : t;
  return `"${name}", Calibri, "Segoe UI", system-ui, sans-serif`;
}

const ALIGN: Record<string, SlideStyleSpec['align']> = {
  l: 'left',
  ctr: 'center',
  r: 'right',
  just: 'left',
};

/** Build the faithful render style for one slide (its first text shape on the master background). */
function slideStyle(
  slideXml: string,
  sw: number,
  sh: number,
  bg: string,
  theme: Theme,
): SlideStyleSpec | null {
  // first shape that actually has text
  let shape: string | null = null;
  for (const m of slideXml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
    if (/<a:t>[^<]/.test(m[1])) {
      shape = m[1];
      break;
    }
  }
  if (!shape) return null;
  const off = shape.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/);
  const ext = shape.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
  const x = off ? (Number(off[1]) / sw) * 100 : 5;
  const y = off ? (Number(off[2]) / sh) * 100 : 5;
  const w = ext ? (Number(ext[1]) / sw) * 100 : 90;
  const h = ext ? (Number(ext[2]) / sh) * 100 : 88;
  const rPr = first(shape, /<a:rPr\b([\s\S]*?)(?:\/>|<\/a:rPr>)/) ?? '';
  const runFill = first(shape, /<a:rPr\b[\s\S]*?<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
  const color =
    resolveFill(runFill ? `<a:solidFill>${runFill}</a:solidFill>` : undefined, theme) ?? '#ffffff';
  const font = resolveFont(first(shape, /<a:latin typeface="([^"]*)"/), theme);
  const bold = /\bb="1"/.test(rPr) || /<a:rPr\b[^>]*\bb="1"/.test(shape);
  const align = ALIGN[first(shape, /<a:pPr[^>]*\balgn="(\w+)"/) ?? 'ctr'] ?? 'center';
  // Original font size: <a:rPr sz="N"> is in hundredths of a point; express it as a
  // percentage of the slide height (cqh) so the projected slide matches the pptx
  // exactly, regardless of screen size, instead of auto-fitting to the text box.
  const szRaw = Number(first(shape, /<a:rPr\b[^>]*\bsz="(\d+)"/) ?? 0);
  const size = szRaw && sh ? (szRaw * 12700) / sh : 0;
  return { bg, color, font, bold, align, x, y, w, h, size };
}

/** Read a .pptx hymn — number+title from the filename, plus each slide's text and faithful style. */
export function readSong(file: string): Song | null {
  let zip: Record<string, Uint8Array>;
  try {
    const data = new Uint8Array(fs.readFileSync(file));
    zip = unzipSync(data, {
      filter: (f) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(f.name) ||
        f.name === 'ppt/slideMasters/slideMaster1.xml' ||
        f.name === 'ppt/theme/theme1.xml' ||
        f.name === 'ppt/presentation.xml',
    });
  } catch {
    return null;
  }
  const get = (n: string) => (zip[n] ? strFromU8(zip[n]) : '');
  const masterXml = get('ppt/slideMasters/slideMaster1.xml');
  const theme = parseTheme(get('ppt/theme/theme1.xml'), masterXml);
  const presXml = get('ppt/presentation.xml');
  const sw = Number(first(presXml, /<p:sldSz cx="(\d+)"/) ?? 9144000);
  const sh = Number(first(presXml, /cy="(\d+)" type/) ?? 5143500);
  const bgFill = first(masterXml, /<p:bg>[\s\S]*?<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
  const bg =
    resolveFill(bgFill ? `<a:solidFill>${bgFill}</a:solidFill>` : undefined, theme) ?? '#000000';

  const slides: SongSlide[] = Object.keys(zip)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNum(a) - slideNum(b))
    .map((n) => {
      const xml = get(n);
      return { text: bodyText(xml), style: slideStyle(xml, sw, sh, bg, theme) };
    })
    .filter((s) => s.text.trim());
  if (slides.length === 0) return null;

  const base = path.basename(file).replace(/\.pptx$/i, '');
  const m = base.match(/^\s*(\d+)\s*[.\-)]\s*(.*)$/);
  return {
    number: m ? Number.parseInt(m[1], 10) : null,
    title: (m ? m[2] : base).trim(),
    slides,
  };
}

/** Recursively find .pptx files under a directory (skipping temp `~$` files). */
export function listPptx(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listPptx(full));
    else if (/\.pptx$/i.test(entry.name) && !entry.name.startsWith('~$')) out.push(full);
  }
  return out;
}
