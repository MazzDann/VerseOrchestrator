import { parseRedLetter } from '@vo/shared';
import { type Verse } from '../../api';
import { type TextSpan } from '../../presenterBus';
import { parseStrongTokens } from '../../lib/strong';
import { type VerseNumbers } from '../../settingsStore';

/**
 * Whether a slide of `count` verses shows their numbers (1.13.0-beta.1, users' report F1010-04:
 * «Коли віршів кілька» by default — a single verse has its number in the reference).
 */
export function numbersOn(mode: VerseNumbers, count: number): boolean {
  return mode === 'always' || (mode === 'multi' && count > 1);
}

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
  /** the main translation's verse a piece stands for (an aligned line, 1.13.0-beta.2) */
  keyOf?: (v: Verse) => number | undefined,
): TextSpan[] {
  const out: TextSpan[] = [];
  let prev: number | null = null;
  for (const v of verses) {
    if (!selected.includes(v.verse)) continue;
    if (prev != null && v.verse > prev + 1) out.push({ text: GAP });
    const k = keyOf?.(v) ?? v.verse;
    if (showNum) out.push({ text: String(v.verse), v: k, num: true });
    for (const s of parseRedLetter(v.textRaw ?? v.text ?? '')) {
      out.push(s.jesus ? { text: s.text, jesus: true, v: k } : { text: s.text, v: k });
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
    if (showNum) out.push({ text: String(v.verse), v: v.verse, num: true });
    const tokens = parseStrongTokens(v.textRaw ?? '');
    if (tokens.length === 0) {
      const t = (v.text ?? '').trim();
      if (t) out.push({ text: t, v: v.verse });
    } else {
      for (const tk of tokens) {
        out.push(
          tk.strong === strong
            ? { text: tk.text, hot: true, v: v.verse }
            : { text: tk.text, v: v.verse },
        );
      }
    }
    prev = v.verse;
  }
  return out;
}
