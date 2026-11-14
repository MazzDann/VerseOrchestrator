/**
 * The «Текст на екран» toolbar's edits (1.22.0-beta.1, F1107-14): they write the Markdown
 * lib/richText.ts reads, into the text and its selection — pure, so the panel only applies the
 * result (`text`, the selection to put back).
 */
export interface Edit {
  text: string;
  start: number;
  end: number;
}

/** Bold (`**`) or italic (`*`) around the selection; the same marks already there come off. */
export function surround(text: string, start: number, end: number, mark: string): Edit {
  const before = text.slice(start - mark.length, start);
  const after = text.slice(end, end + mark.length);
  if (before === mark && after === mark)
    return {
      text:
        text.slice(0, start - mark.length) + text.slice(start, end) + text.slice(end + mark.length),
      start: start - mark.length,
      end: end - mark.length,
    };
  return {
    text: text.slice(0, start) + mark + text.slice(start, end) + mark + text.slice(end),
    start: start + mark.length,
    end: end + mark.length,
  };
}

export type LineKind = 'bullet' | 'number' | 'heading';

const PREFIX = /^(\s*)(?:[-*•]\s+|\d{1,3}[.)]\s+|#{1,3}\s+)/;
const IS: Record<LineKind, RegExp> = {
  bullet: /^\s*[-*•]\s+/,
  number: /^\s*\d{1,3}[.)]\s+/,
  heading: /^\s{0,3}#{1,3}\s+/,
};

/**
 * The selected lines (the caret's, with none) become bullets, numbered or headings — or, all
 * of them that already, plain lines again. Another kind's mark is replaced.
 */
export function markLines(text: string, start: number, end: number, kind: LineKind): Edit {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', Math.max(end - (end > start ? 1 : 0), start));
  const to = nl < 0 ? text.length : nl;
  const lines = text.slice(from, to).split('\n');
  const off = lines.every((l) => IS[kind].test(l) || !l.trim());
  let n = 0;
  const next = lines.map((l) => {
    if (!l.trim()) return l;
    const bare = l.replace(PREFIX, '$1');
    if (off) return bare;
    n++;
    const mark = kind === 'bullet' ? '- ' : kind === 'number' ? `${n}. ` : '# ';
    return mark + bare.trimStart();
  });
  const block = next.join('\n');
  return {
    text: text.slice(0, from) + block + text.slice(to),
    start: from,
    end: from + block.length,
  };
}

/** A divider line on its own line, after the caret's line. */
export function insertDivider(text: string, at: number): Edit {
  const nl = text.indexOf('\n', at);
  const end = nl < 0 ? text.length : nl;
  const piece = (end > 0 && text[end - 1] !== '\n' ? '\n' : '') + '---\n';
  const out =
    text.slice(0, end) + (end === text.length ? piece : piece.replace(/\n$/, '')) + text.slice(end);
  const caret = end + piece.length;
  return { text: out, start: Math.min(caret, out.length), end: Math.min(caret, out.length) };
}
