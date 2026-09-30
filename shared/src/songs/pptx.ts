import { unzipSync, strFromU8 } from 'fflate';

/**
 * A song from a PowerPoint file (.pptx): each slide with text is one slide of the song,
 * with the look it had in the file. Pure — bytes in, song out — so the builder (a folder
 * on disk) and the browser (files the operator picks for an import, 0.10.1) read songs
 * the same way.
 */

/**
 * The version of this reader. A bundle a folder of .pptx files feeds is read again when an
 * older reader wrote it (1.2.1: title slides kept their authors in the title's box).
 */
export const PPTX_READER = 2;

/** Where the text sits in its box, top to bottom (`<a:bodyPr anchor>`). */
export type TextAnchor = 'top' | 'middle' | 'bottom';

/**
 * A slide's second text box, in its own place and size (1.2.1): a title slide's authors
 * under the title, a «Приспів:» label over a chorus.
 */
export interface SlideBoxSpec {
  text: string;
  color: string;
  align: 'left' | 'center' | 'right';
  anchor: TextAnchor;
  x: number; // % of slide
  y: number;
  w: number;
  h: number;
  size: number; // original font size, cqh; 0 = unknown
}

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
  /** Where the text sits in its box (1.2.1); absent (bundles read before) = middle. */
  anchor?: TextAnchor;
  /**
   * The slide's other text box, shown apart (1.2.1). Its text is in the slide's `text` too —
   * before or after the main box's, by where it stands — for plain text and search;
   * `mainText` takes it out again for the faithful look.
   */
  sub?: SlideBoxSpec;
}

export interface SongSlide {
  text: string;
  /** Faithful pptx style; null if it couldn't be derived. */
  style: SlideStyleSpec | null;
}

export interface ParsedSong {
  /** The file's name without its folder and .pptx — the song's key in its bundle. */
  key: string;
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

interface Shape {
  xml: string;
  /** placeholder type (`body` for a placeholder without one), null for a plain text box */
  type: string | null;
  idx?: string;
}

/** The shapes of a slide, layout or master — only those with text, when `withText`. */
function shapesOf(xml: string, withText: boolean): Shape[] {
  const out: Shape[] = [];
  for (const m of xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
    if (withText && !/<a:t>[^<]/.test(m[1])) continue;
    const ph = first(m[1], /(<p:ph\b[^>]*>)/);
    out.push({
      xml: m[1],
      type: ph ? (first(ph, /type="(\w+)"/) ?? 'body') : null,
      idx: ph ? first(ph, /idx="(\d+)"/) : undefined,
    });
  }
  return out;
}

const ANCHOR: Record<string, TextAnchor> = { t: 'top', ctr: 'middle', b: 'bottom' };
const anchorOf = (xml: string): TextAnchor | undefined =>
  ANCHOR[first(xml, /<a:bodyPr\b[^>]*\banchor="(\w+)"/) ?? ''];
const isTitle = (type: string | null) => type === 'title' || type === 'ctrTitle';

/**
 * Where a shape's text sits: its own `anchor`, else its placeholder's on the slide's layout
 * (same type, else same idx), else the master's (its title, or its body for the rest), else
 * the top — PowerPoint's default. A title slide's layout anchors the title to the bottom
 * of its box: centred, it sat high above the authors.
 */
function shapeAnchor(shape: Shape, layout: Shape[], master: Shape[]): TextAnchor {
  const own = anchorOf(shape.xml);
  if (own || shape.type === null) return own ?? 'top';
  const onLayout =
    layout.find((l) => l.type === shape.type) ??
    (shape.idx !== undefined ? layout.find((l) => l.idx === shape.idx) : undefined);
  const fromLayout = onLayout && anchorOf(onLayout.xml);
  if (fromLayout) return fromLayout;
  const onMaster = master.find((m) =>
    isTitle(shape.type) ? m.type === 'title' : m.type === 'body',
  );
  return (onMaster && anchorOf(onMaster.xml)) ?? 'top';
}

/**
 * One slide: its text and faithful style — the title's box (else the first text box's) on
 * the master background. A slide with exactly two text boxes keeps the other one apart
 * (`sub`, 1.2.1): before, its text went into the title's box, so a title slide showed its
 * authors in the title's size, and a chorus its «Приспів:» label after the chorus.
 */
function readSlide(
  slideXml: string,
  layout: Shape[],
  master: Shape[],
  sw: number,
  sh: number,
  bg: string,
  theme: Theme,
): SongSlide {
  const shapes = shapesOf(slideXml, true);
  if (shapes.length === 0) return { text: bodyText(slideXml), style: null };
  const main = shapes.find((x) => isTitle(x.type)) ?? shapes[0];
  const style: SlideStyleSpec = {
    bg,
    ...boxOf(main.xml, sw, sh, theme),
    anchor: shapeAnchor(main, layout, master),
  };
  const other = shapes.length === 2 ? shapes.find((x) => x !== main) : undefined;
  const subText = other ? bodyText(other.xml) : '';
  const own = bodyText(main.xml);
  if (!other || !subText || !own) return { text: bodyText(slideXml), style };
  const box = boxOf(other.xml, sw, sh, theme);
  style.sub = {
    text: subText,
    color: box.color,
    align: box.align,
    anchor: shapeAnchor(other, layout, master),
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    size: box.size,
  };
  // plain text reads top to bottom, by the boxes' middles (a chorus box can start above its
  // label and still hold its text lower): a label over the chorus first, the authors last
  const above = box.y + box.h / 2 < style.y + style.h / 2;
  return { text: above ? `${subText}\n${own}` : `${own}\n${subText}`, style };
}

/** What the main box shows on a faithful slide: the text without its separate box's (1.2.1). */
export function mainText(text: string, style: SlideStyleSpec | null | undefined): string {
  const sub = style?.sub?.text;
  if (!sub) return text;
  if (text.startsWith(`${sub}\n`)) return text.slice(sub.length + 1);
  if (text.endsWith(`\n${sub}`)) return text.slice(0, text.length - sub.length - 1);
  return text;
}

/** A text box: its place (% of the slide), its first run's look, its original font size. */
function boxOf(shape: string, sw: number, sh: number, theme: Theme) {
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
  return { color, font, bold, align, x, y, w, h, size };
}

/** A song's key from its file name: no folders, no `.pptx`. */
export function songKey(fileName: string): string {
  return fileName
    .replace(/^.*[\\/]/, '')
    .replace(/\.pptx$/i, '')
    .trim();
}

/** «123. Назва» (a dot, dash or bracket after the number) → number + title; else the whole name. */
export function songNumberTitle(key: string): { number: number | null; title: string } {
  const m = key.match(/^\s*(\d+)\s*[.\-)]\s*(.*)$/);
  return { number: m ? Number.parseInt(m[1], 10) : null, title: (m ? m[2] : key).trim() };
}

/** Is this a song file an import should read (not a folder, not an Office lock file `~$…`)? */
export function isSongFile(fileName: string): boolean {
  const base = fileName.replace(/^.*[\\/]/, '');
  return /\.pptx$/i.test(base) && !base.startsWith('~$');
}

/**
 * Read a .pptx song: number and title from the file name, each slide's text and faithful
 * style. Null when the file isn't a readable presentation or has no slide with text.
 */
export function parsePptx(bytes: Uint8Array, fileName: string): ParsedSong | null {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(bytes, {
      filter: (f) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(f.name) ||
        /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(f.name) ||
        f.name === 'ppt/slideMasters/slideMaster1.xml' ||
        f.name === 'ppt/theme/theme1.xml' ||
        f.name === 'ppt/presentation.xml',
    });
  } catch {
    return null;
  }
  const get = (n: string) => (zip[n] ? strFromU8(zip[n]) : '');
  // the layouts the slides use — a deck carries a dozen, a song uses two: unpack only those
  const layoutOf = (slide: string) =>
    first(
      get(slide.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels'),
      /Target="\.\.\/slideLayouts\/(slideLayout\d+\.xml)"/,
    );
  const slideNames = Object.keys(zip)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNum(a) - slideNum(b));
  const used = new Set(slideNames.map((n) => `ppt/slideLayouts/${layoutOf(n)}`));
  let layoutFiles: Record<string, Uint8Array> = {};
  try {
    layoutFiles = unzipSync(bytes, { filter: (f) => used.has(f.name) });
  } catch {
    /* read before: can't fail now; without layouts, anchors come from the master */
  }
  const layouts = new Map<string, Shape[]>();
  const layoutShapes = (name: string | undefined): Shape[] => {
    if (!name) return [];
    let shapes = layouts.get(name);
    if (!shapes) {
      const file = layoutFiles[`ppt/slideLayouts/${name}`];
      shapes = file ? shapesOf(strFromU8(file), false) : [];
      layouts.set(name, shapes);
    }
    return shapes;
  };
  const masterXml = get('ppt/slideMasters/slideMaster1.xml');
  const master = shapesOf(masterXml, false);
  const theme = parseTheme(get('ppt/theme/theme1.xml'), masterXml);
  const presXml = get('ppt/presentation.xml');
  const sw = Number(first(presXml, /<p:sldSz cx="(\d+)"/) ?? 9144000);
  const sh = Number(first(presXml, /cy="(\d+)" type/) ?? 5143500);
  const bgFill = first(masterXml, /<p:bg>[\s\S]*?<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
  const bg =
    resolveFill(bgFill ? `<a:solidFill>${bgFill}</a:solidFill>` : undefined, theme) ?? '#000000';

  const slides: SongSlide[] = slideNames
    .map((n) => readSlide(get(n), layoutShapes(layoutOf(n)), master, sw, sh, bg, theme))
    .filter((s) => s.text.trim());
  if (slides.length === 0) return null;

  const key = songKey(fileName);
  return { key, ...songNumberTitle(key), slides };
}
