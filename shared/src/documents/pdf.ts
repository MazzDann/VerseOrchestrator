import type { DocUnit } from './parse.js';

/**
 * PDF documents (1.17.0-beta.3): a PDF holds positioned text runs, not paragraphs. The server reads
 * the runs with pdf.js (server/src/pdfWorker.ts) and this turns them back into a document — pure,
 * so it is tested without pdf.js:
 *   - runs → lines by their baseline; a gap between runs → a space;
 *   - page numbers and the header / footer repeated on most pages left out;
 *   - the body's size = the most common one; a short line clearly bigger → a heading (two levels);
 *   - a new paragraph after a gap bigger than the body's line spacing, an indented first line, a
 *     heading, or a bullet; a paragraph runs on across a page break unless it ended a sentence;
 *   - a word broken with a hyphen at a line's end joined again («бла-\nгодать» → «благодать»).
 * A scanned PDF has no runs at all: no units (the caller says it holds no text).
 */

export interface PdfRun {
  str: string;
  /** the run's left edge and baseline, in points (y grows upwards, as in PDF) */
  x: number;
  y: number;
  /** its width and font size */
  w: number;
  h: number;
}

export interface PdfPage {
  runs: PdfRun[];
}

interface Line {
  text: string;
  x: number;
  y: number;
  /** where its last run ends */
  right: number;
  /** the line's font size (its biggest run's) */
  size: number;
  page: number;
}

const BULLET = /^([•●▪◦‣∙·–—-])\s+/u;
// a page number alone («12», «- 12 -», «стор. 12») — data, not interface words
const PAGE_NUMBER = /^[-–—\s]*(стор\.?|с\.|page|p\.)?\s*\d{1,4}\s*[-–—\s]*$/iu; // i18n-ignore: page-number words
const SENTENCE_END = /[.!?…:;»"”)]$/u;

function pageLines(page: PdfPage, index: number): Line[] {
  const runs = page.runs.filter((r) => r.str.length > 0 && r.h > 0);
  // top to bottom, then left to right
  runs.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { runs: PdfRun[]; y: number; size: number }[] = [];
  for (const r of runs) {
    const line = lines.find((l) => Math.abs(l.y - r.y) < Math.max(l.size, r.h) * 0.5);
    if (line) {
      line.runs.push(r);
      line.size = Math.max(line.size, r.h);
    } else lines.push({ runs: [r], y: r.y, size: r.h });
  }
  return lines
    .map((l) => {
      l.runs.sort((a, b) => a.x - b.x);
      let text = '';
      let end = -Infinity;
      for (const r of l.runs) {
        // runs apart by more than a quarter of the size stand apart by a space
        if (text && r.x - end > r.h * 0.25 && !/\s$/.test(text) && !/^\s/.test(r.str)) text += ' ';
        text += r.str;
        end = r.x + r.w;
      }
      return {
        text: text.replace(/\s+/g, ' ').trim(),
        x: l.runs[0].x,
        y: l.y,
        right: end,
        size: Math.round(l.size * 10) / 10,
        page: index,
      };
    })
    .filter((l) => l.text);
}

/** The most common value, weighted (the body's size and line spacing). */
function mode(values: [number, number][]): number {
  const count = new Map<number, number>();
  for (const [v, weight] of values) count.set(v, (count.get(v) ?? 0) + weight);
  let best = 0;
  let top = -1;
  for (const [v, n] of count)
    if (n > top) {
      top = n;
      best = v;
    }
  return best;
}

export function pdfUnits(pages: PdfPage[]): DocUnit[] {
  const perPage = pages.map(pageLines);
  // a line repeated at a page's top or bottom on most pages is its header / footer
  const edge = new Map<string, number>();
  for (const lines of perPage) {
    const ends = new Set(
      [lines[0], lines[lines.length - 1]].filter(Boolean).map((l) => l.text.replace(/\d+/g, '#')),
    );
    for (const t of ends) edge.set(t, (edge.get(t) ?? 0) + 1);
  }
  const repeated = (l: Line) =>
    pages.length >= 3 && (edge.get(l.text.replace(/\d+/g, '#')) ?? 0) >= pages.length * 0.6;
  const lines = perPage.flatMap((ls) =>
    ls.filter(
      (l, i) =>
        // a page number alone and the repeated edges go
        !PAGE_NUMBER.test(l.text) && !((i === 0 || i === ls.length - 1) && repeated(l)),
    ),
  );
  if (lines.length === 0) return [];
  const body = mode(lines.map((l) => [l.size, l.text.length]));
  // the usual distance between two body lines of one page
  const gaps: [number, number][] = [];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1];
    const b = lines[i];
    if (a.page === b.page && a.size === body && b.size === body)
      gaps.push([Math.round((a.y - b.y) * 2) / 2, 1]);
  }
  const spacing = mode(gaps.filter(([g]) => g > 0)) || body * 1.2;
  const bodyLines = lines.filter((l) => l.size === body);
  const left = mode(bodyLines.map((l) => [Math.round(l.x), 1]));
  // the right margin: where the longer lines end (a mode means nothing in ragged-right text)
  const rights = bodyLines.map((l) => l.right).sort((a, b) => a - b);
  const right = rights[Math.floor(rights.length * 0.9)] ?? 0;
  // a heading: clearly bigger, and short — or not much longer without ending a sentence
  const headingLevel = (l: Line): number => {
    const short = l.text.length <= 80 || (l.text.length <= 160 && !SENTENCE_END.test(l.text));
    if (!short) return 0;
    return l.size >= body * 1.5 ? 1 : l.size >= body * 1.15 ? 2 : 0;
  };
  // a line that stopped well before the margin after a sentence: its paragraph's last
  const lastLine = (l: Line) => SENTENCE_END.test(l.text) && l.right < right - body * 3;

  const units: DocUnit[] = [];
  let cur: { kind: DocUnit['kind']; level: number; text: string } | null = null;
  const flush = () => {
    if (cur && cur.text.trim()) units.push({ ...cur, text: cur.text.trim() });
    cur = null;
  };
  let prev: Line | null = null;
  for (const l of lines) {
    const level = headingLevel(l);
    if (level > 0) {
      // a heading over two lines (the same size, right below) stays one
      if (
        cur?.kind === 'heading' &&
        prev &&
        prev.page === l.page &&
        prev.size === l.size &&
        prev.y - l.y < l.size * 1.8
      )
        cur.text += ` ${l.text}`;
      else {
        flush();
        cur = { kind: 'heading', level, text: l.text };
      }
      prev = l;
      continue;
    }
    const bullet = BULLET.exec(l.text);
    const samePage = prev && prev.page === l.page;
    const gap = samePage && prev ? prev.y - l.y : 0;
    const startsNew =
      !cur ||
      cur.kind === 'heading' ||
      !!bullet ||
      (samePage && gap > spacing * 1.45) ||
      // an indent or a short last line after a sentence — over a page break too, else it runs on
      (!!prev && SENTENCE_END.test(prev.text) && (l.x > left + body * 1.2 || lastLine(prev)));
    if (startsNew) {
      flush();
      cur = bullet
        ? { kind: 'item', level: 0, text: l.text.slice(bullet[0].length) }
        : { kind: 'para', level: 0, text: l.text };
    } else if (cur) {
      // a word broken at the line's end: joined again
      if (/[\p{Ll}]-$|­$/u.test(cur.text) && /^\p{Ll}/u.test(l.text))
        cur.text = cur.text.replace(/-$|­$/u, '') + l.text;
      else cur.text += ` ${l.text}`;
    }
    prev = l;
  }
  flush();
  return units;
}
