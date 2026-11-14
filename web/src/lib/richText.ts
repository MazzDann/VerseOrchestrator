/**
 * «Багатий текст» (1.22.0-beta.1, users' F1107-14: «вставляти мд формат … списки, центрування,
 * італік, жирне»): the own text is written — or pasted — as a small Markdown, and goes to the
 * screen as blocks the output draws (`Slide.rich`). Every source line stays a line on screen, as
 * before (Enter = a new line); an empty line is an empty line. What it knows:
 *
 * - `# Заголовок` (one to three #) — a heading;
 * - `- пункт`, `* пункт`, `• пункт` — a bullet; `1. пункт`, `1) пункт` — a numbered one;
 * - `> слова` — a quote;
 * - `---` (or `***`, `___`) alone — a divider line;
 * - `**жирне**` / `__жирне__`, `*курсив*` / `_курсив_`; `\*` keeps a star.
 *
 * Nothing here is HTML: the output builds its own elements from these blocks.
 */

export interface RichSpan {
  text: string;
  /** bold */
  b?: boolean;
  /** italic */
  i?: boolean;
}

export type RichBlock =
  | { kind: 'p' | 'h' | 'quote'; spans: RichSpan[] }
  | { kind: 'li'; spans: RichSpan[]; /** a numbered item's number; none = a bullet */ n?: number }
  | { kind: 'hr' };

export type RichAlign = 'left' | 'center' | 'right';

/** What a slide carries: the blocks, and the text's own alignment (none = the look's). */
export interface RichText {
  blocks: RichBlock[];
  align?: RichAlign;
}

const HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const HEADING = /^\s{0,3}#{1,3}\s+(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

/** One line's inline marks: bold and italic spans, `\` escaping the next mark. */
export function parseSpans(line: string): RichSpan[] {
  const out: RichSpan[] = [];
  let b = false;
  let i = false;
  let text = '';
  const flush = () => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && !!last.b === b && !!last.i === i) last.text += text;
    else out.push({ text, ...(b ? { b } : {}), ...(i ? { i } : {}) });
    text = '';
  };
  // a mark only where it can close: an opening one needs its pair later on the line
  const closes = (from: number, mark: string) => line.indexOf(mark, from) > from;
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (c === '\\' && k + 1 < line.length && '*_\\#->'.includes(line[k + 1])) {
      text += line[++k];
      continue;
    }
    const two = line.slice(k, k + 2);
    if (two === '**' || two === '__') {
      if (b || closes(k + 2, two)) {
        flush();
        b = !b;
        k++;
        continue;
      }
    } else if (c === '*' || c === '_') {
      // `_` inside a word (snake_case, a name) is a letter, not a mark
      const inWord = c === '_' && /\w/.test(line[k - 1] ?? '') && /\w/.test(line[k + 1] ?? '');
      if (!inWord && (i || closes(k + 1, c))) {
        flush();
        i = !i;
        continue;
      }
    }
    text += c;
  }
  flush();
  return out;
}

/** The blocks of a text, one per source line. */
export function parseRich(src: string): RichBlock[] {
  return src.split(/\r?\n/).map((line): RichBlock => {
    if (HR.test(line)) return { kind: 'hr' };
    const h = HEADING.exec(line);
    if (h) return { kind: 'h', spans: parseSpans(h[1]) };
    const q = QUOTE.exec(line);
    if (q) return { kind: 'quote', spans: parseSpans(q[1]) };
    const n = NUMBERED.exec(line);
    if (n) return { kind: 'li', n: Number(n[1]), spans: parseSpans(n[2]) };
    const u = BULLET.exec(line);
    if (u) return { kind: 'li', spans: parseSpans(u[1]) };
    return { kind: 'p', spans: parseSpans(line) };
  });
}

/** The text as plain lines — for windows and phones that don't draw blocks, and the search. */
export function plainOf(blocks: readonly RichBlock[]): string {
  return blocks
    .map((x) => {
      if (x.kind === 'hr') return '—';
      const t = x.spans.map((s) => s.text).join('');
      return x.kind === 'li' ? `${x.n != null ? `${x.n}.` : '•'} ${t}` : t;
    })
    .join('\n');
}

/** Does the text use any of it — else it goes as plain text, as before. */
export function hasMarkup(blocks: readonly RichBlock[]): boolean {
  return blocks.some((x) => x.kind !== 'p' || x.spans.some((s) => s.b || s.i));
}

/** A slide's `rich` as it came over the bus — anything malformed is null (drawn as plain text). */
export function richOf(x: unknown): RichText | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as { blocks?: unknown; align?: unknown };
  if (!Array.isArray(r.blocks)) return null;
  const ok = r.blocks.every(
    (b) =>
      !!b &&
      typeof b === 'object' &&
      ((b as RichBlock).kind === 'hr' ||
        (['p', 'h', 'quote', 'li'].includes((b as RichBlock).kind) &&
          Array.isArray((b as { spans?: unknown }).spans) &&
          (b as { spans: unknown[] }).spans.every(
            (s) => !!s && typeof (s as RichSpan).text === 'string',
          ))),
  );
  if (!ok) return null;
  const align = ['left', 'center', 'right'].includes(r.align as string)
    ? (r.align as RichAlign)
    : undefined;
  return { blocks: r.blocks as RichBlock[], ...(align ? { align } : {}) };
}
