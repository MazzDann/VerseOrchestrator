import { unzipSync, strFromU8 } from 'fflate';

/**
 * A song from a PowerPoint file (.pptx): each slide with text is one slide of the song,
 * with the look it had in the file. Pure — bytes in, song out — so the builder (a folder
 * on disk) and the browser (files the operator picks for an import, 0.10.1) read songs
 * the same way.
 */

/**
 * The version of this reader. A bundle a folder of .pptx files feeds is read again when an
 * older reader wrote it (2 — 1.2.1: title slides kept their authors in the title's box; 3 —
 * 1.3.0: a second part in another colour; 4: keys in one Unicode form, so a Mac's reading
 * replaces a Windows one instead of doubling it; 5 — 1.8.10: a box moved by the empty lines
 * around its text, so a title lifted with empty lines no longer drops onto the authors).
 */
export const PPTX_READER = 5;

/**
 * A second part (1.3.0): words the file colours apart from the rest of the box — an echo or
 * a second voice, «слово (слово)» in yellow. In `SlideSecond.text` they sit between these
 * two private-use characters, which no song text holds.
 */
export const SECOND_OPEN = '';
export const SECOND_CLOSE = '';

/** The main box's text with its second part marked, and that part's colour in the file. */
export interface SlideSecond {
  text: string;
  color: string;
}

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
  /** The main box's words in another colour (1.3.0); absent: one colour. */
  second?: SlideSecond;
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

/** The height PowerPoint gives a line: about 1.2 × its biggest font (single spacing). */
const LINE_HEIGHT = 1.2;
/** One line of a box's text, % of the slide; a size not in the file counts as 4 % (a caption's). */
const oneLine = (size: number) => (size || 4) * LINE_HEIGHT;

/**
 * The empty lines before and after a box's text, in % of the slide's height (1.8.10): a song's
 * author lifts a bottom-anchored title above the authors' box with empty lines after it
 * (`<a:br>`s, empty paragraphs). The text drops them (`bodyText`), so the box moves instead
 * (`withoutBlankLines`). A line is as high as its biggest run, a line break included; an empty
 * paragraph's last line takes its end mark's size; without one, the box's own size (`size`, cqh).
 */
function blankLines(shape: string, sh: number, size: number): { lead: number; trail: number } {
  const lines: { blank: boolean; sz: number }[] = [];
  let text = '';
  let sz = 0;
  let end = 0;
  const close = (own = 0) => {
    lines.push({ blank: !text.trim(), sz: Math.max(sz, own) || end });
    text = '';
    sz = 0;
    end = 0;
  };
  const re =
    /<a:(?:r|fld)\b[^>]*>([\s\S]*?)<\/a:(?:r|fld)>|<a:br\b[^>]*?(?:\/>|>([\s\S]*?)<\/a:br>)|<a:endParaRPr\b([^>]*)|<\/a:p>/g;
  const sizeIn = (xml: string | undefined) =>
    Number(first(xml ?? '', /<a:rPr\b[^>]*\bsz="(\d+)"/) ?? 0);
  for (const m of shape.matchAll(re)) {
    if (m[1] !== undefined) {
      text += first(m[1], /<a:t>([\s\S]*?)<\/a:t>/) ?? '';
      sz = Math.max(sz, sizeIn(m[1]));
    } else if (m[0].startsWith('<a:br')) close(sizeIn(m[2]));
    else if (m[3] !== undefined) end = Number(first(m[3], /\bsz="(\d+)"/) ?? 0);
    else close();
  }
  const from = lines.findIndex((l) => !l.blank);
  if (from < 0 || !sh) return { lead: 0, trail: 0 };
  const to = lines.length - 1 - [...lines].reverse().findIndex((l) => !l.blank);
  // hundredths of a point → % of the slide, as `boxOf` does; a size of 0 = the box's own (cqh)
  const height = (ls: typeof lines) =>
    ls.reduce((h, l) => h + (l.sz ? (l.sz * 12700) / sh : size) * LINE_HEIGHT, 0);
  return { lead: height(lines.slice(0, from)), trail: height(lines.slice(to + 1)) };
}

/**
 * Where the text sits once the empty lines around it are gone, as in PowerPoint: a bottom
 * anchor lifts the box by the lines after the text, a top one lowers it by the lines before, a
 * middle one moves it by half their difference. The box keeps its height (in PowerPoint, text
 * taller than what the empty lines leave grows past the box's edge), cut where it leaves the slide
 * — as `SlideCanvas` cuts any box: cutting a middle box on both sides to keep its centre would
 * shrink the text of boxes taller than the slide (№183: 92.9 → 77.3 % of room; review of 1.8.10).
 * A box the edge would leave lower than `line` (one line of its text) stays where it was: the
 * empty lines are measured, not laid out, and a wrong guess must not hide the text.
 */
function withoutBlankLines(
  box: { y: number; h: number },
  anchor: TextAnchor,
  { lead, trail }: { lead: number; trail: number },
  line: number,
): { y: number; h: number } {
  const shift = anchor === 'bottom' ? -trail : anchor === 'top' ? lead : (lead - trail) / 2;
  if (!shift) return box;
  const top = box.y + shift;
  const y = Math.max(0, top);
  const h = Math.max(0, Math.min(top + box.h, 100) - y);
  return h < line ? box : { y, h };
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
  const mainBox = boxOf(main.xml, sw, sh, theme);
  const anchor = shapeAnchor(main, layout, master);
  const style: SlideStyleSpec = {
    bg,
    ...mainBox,
    ...withoutBlankLines(
      mainBox,
      anchor,
      blankLines(main.xml, sh, mainBox.size),
      oneLine(mainBox.size),
    ),
    anchor,
  };
  const second = secondOf(main.xml, style.color, theme);
  if (second) style.second = second;
  const other = shapes.length === 2 ? shapes.find((x) => x !== main) : undefined;
  const subText = other ? bodyText(other.xml) : '';
  const own = bodyText(main.xml);
  if (!other || !subText || !own) return { text: bodyText(slideXml), style };
  const box = boxOf(other.xml, sw, sh, theme);
  const subAnchor = shapeAnchor(other, layout, master);
  const subPlace = withoutBlankLines(
    box,
    subAnchor,
    blankLines(other.xml, sh, box.size),
    oneLine(box.size),
  );
  style.sub = {
    text: subText,
    color: box.color,
    align: box.align,
    anchor: subAnchor,
    x: box.x,
    y: subPlace.y,
    w: box.w,
    h: subPlace.h,
    size: box.size,
  };
  // plain text reads top to bottom, by the boxes' middles (a chorus box can start above its
  // label and still hold its text lower): a label over the chorus first, the authors last
  // where the files put the boxes, before the empty lines move them: the order of reader 4
  const above = box.y + box.h / 2 < mainBox.y + mainBox.h / 2;
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

const MARKS = /[]/g;

/** The text without the second part's marks. */
export function unmark(marked: string): string {
  return marked.replace(MARKS, '');
}

/**
 * The words of a box in another colour than `color` (1.3.0) — in the reference songbook an
 * echo or a second voice in yellow, 184 slides of 49 songs. Neighbouring runs make one
 * part; the first other colour stands for all of them. None when the marks would move a
 * space or a line (the plain text must stay exactly as it was).
 */
function secondOf(shape: string, color: string, theme: Theme): SlideSecond | undefined {
  let other: string | undefined;
  const marked = shape.replace(/<a:r>([\s\S]*?)<\/a:r>/g, (run, inner: string) => {
    const fill = first(inner, /<a:rPr\b[\s\S]*?<a:solidFill>([\s\S]*?)<\/a:solidFill>/);
    const c = resolveFill(fill ? `<a:solidFill>${fill}</a:solidFill>` : undefined, theme);
    if (!c || c === color) return run;
    other ??= c;
    return run.replace(
      /<a:t>([\s\S]*?)<\/a:t>/g,
      (_, t: string) => `<a:t>${SECOND_OPEN}${t}${SECOND_CLOSE}</a:t>`,
    );
  });
  if (!other) return undefined;
  const text = alignMarks(bodyText(marked), bodyText(shape))?.replace(
    new RegExp(`${SECOND_CLOSE}(\\s*)${SECOND_OPEN}`, 'g'),
    '$1',
  );
  return text && unmark(text) === bodyText(shape) ? { text, color: other } : undefined;
}

/**
 * The marks put into the plain text. Tidying a text drops spaces at line ends and doubled
 * ones, but a mark between a space and the line's end keeps that space from going — so walk
 * both texts and let the marked one skip the spaces the plain one doesn't have.
 */
function alignMarks(marked: string, plain: string): string | null {
  let out = '';
  let j = 0;
  for (const ch of marked) {
    if (ch === SECOND_OPEN || ch === SECOND_CLOSE) out += ch;
    else if (ch === plain[j]) {
      out += ch;
      j++;
    } else if (!/\s/.test(ch)) return null;
  }
  return j === plain.length ? out : null;
}

/** A marked text in parts: the second part's and the rest, in order (1.3.0). */
export function secondParts(marked: string): { text: string; second: boolean }[] {
  const parts: { text: string; second: boolean }[] = [];
  let second = false;
  let text = '';
  for (const ch of marked) {
    if (ch === SECOND_OPEN || ch === SECOND_CLOSE) {
      if (text) parts.push({ text, second });
      text = '';
      second = ch === SECOND_OPEN;
    } else text += ch;
  }
  if (text) parts.push({ text, second });
  return parts;
}

/**
 * The whole slide's text with its second part marked — the main box's marks put into the
 * text that also holds a separate box's words (plain text shows both). Null: nothing marked,
 * or the texts don't match (a bundle written by another reader).
 */
export function markedText(text: string, style: SlideStyleSpec | null | undefined): string | null {
  const second = style?.second;
  if (!second) return null;
  const main = mainText(text, style);
  if (unmark(second.text) !== main) return null;
  if (text === main) return second.text;
  if (text.startsWith(`${main}\n`)) return second.text + text.slice(main.length);
  if (text.endsWith(`\n${main}`)) return text.slice(0, text.length - main.length) + second.text;
  return null;
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

/**
 * A song's key from its file name: no folders, no `.pptx`, composed Unicode (NFC). A Mac
 * spells «й» / «ї» in file names as a letter + a combining mark, Windows and browsers as one
 * character — the same song must get the same key (and so the same id) on both.
 */
export function songKey(fileName: string): string {
  return fileName
    .replace(/^.*[\\/]/, '')
    .replace(/\.pptx$/i, '')
    .trim()
    .normalize('NFC');
}

/** «123. Назва» (a dot, dash or bracket after the number) → number + title; else the whole name. */
export function songNumberTitle(key: string): { number: number | null; title: string } {
  const m = key.match(/^\s*(\d+)\s*[.\-)]\s*(.*)$/);
  return { number: m ? Number.parseInt(m[1], 10) : null, title: (m ? m[2] : key).trim() };
}

/**
 * Is this a song file an import should read — not a folder, not an Office lock file `~$…`,
 * not a Mac's `._NAME.pptx` companion: a Mac puts one next to every file it writes to an exFAT
 * or FAT drive (1.4.1), and that is no presentation. Other names that start with a period stay
 * songs (`...Бо Ти є Бог.pptx` is a fine file name on Windows).
 */
export function isSongFile(fileName: string): boolean {
  const base = fileName.replace(/^.*[\\/]/, '');
  return /\.pptx$/i.test(base) && !base.startsWith('~$') && !base.startsWith('._');
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
