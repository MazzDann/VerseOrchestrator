import { parseRedLetter } from '@vo/shared';
import { type Verse } from '../../api';
import { type TextSpan } from '../../presenterBus';
import { parseStrongTokens } from '../../lib/strong';

/** Marker inserted between non-contiguous selected verses so a skip reads as a skip. */
export const GAP = '…';

/** Displayed text for the selected verses (chapter order), with gaps between non-contiguous ones. */
export function joinVerses(verses: Verse[], selected: number[], showNum: boolean): string {
  const parts: string[] = [];
  let prev: number | null = null;
  for (const v of verses) {
    if (!selected.includes(v.verse)) continue;
    const t = (v.text ?? '').trim();
    if (!t) continue;
    if (prev != null && v.verse > prev + 1) parts.push(GAP);
    parts.push(`${showNum ? `${v.verse} ` : ''}${t}`);
    prev = v.verse;
  }
  return parts.join(' ');
}

/** Build red-letter (words of Jesus) segments for a translation's selected verses. */
export function redLetterSegments(
  verses: Verse[],
  selected: number[],
  showNum: boolean,
): TextSpan[] {
  const out: TextSpan[] = [];
  let prev: number | null = null;
  for (const v of verses) {
    if (!selected.includes(v.verse)) continue;
    if (prev != null && v.verse > prev + 1) out.push({ text: GAP });
    if (showNum) out.push({ text: String(v.verse) });
    for (const s of parseRedLetter(v.textRaw ?? v.text ?? '')) {
      out.push(s.jesus ? { text: s.text, jesus: true } : { text: s.text });
    }
    prev = v.verse;
  }
  return out;
}

/** Build segments with the word(s) carrying `strong` emphasised (the projected Strong word). */
export function strongHighlightSegments(
  verses: Verse[],
  selected: number[],
  showNum: boolean,
  strong: string,
): TextSpan[] {
  const out: TextSpan[] = [];
  let prev: number | null = null;
  for (const v of verses) {
    if (!selected.includes(v.verse)) continue;
    if (prev != null && v.verse > prev + 1) out.push({ text: GAP });
    if (showNum) out.push({ text: String(v.verse) });
    const tokens = parseStrongTokens(v.textRaw ?? '');
    if (tokens.length === 0) {
      const t = (v.text ?? '').trim();
      if (t) out.push({ text: t });
    } else {
      for (const tk of tokens) {
        out.push(tk.strong === strong ? { text: tk.text, hot: true } : { text: tk.text });
      }
    }
    prev = v.verse;
  }
  return out;
}
