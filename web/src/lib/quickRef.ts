/**
 * A place in the open book typed as numbers (1.4.0): «16» — a verse of the open chapter,
 * «3:16» — chapter 3, verse 16, «3:16-18» — a few verses, «3:» — chapter 3 from its start.
 * A dot, a comma or a space may stand for the colon («3.16», «3 16»). Typed straight into the
 * control window or into «Перейти до посилання»; the book is the one that is open.
 */
export interface QuickRef {
  /** absent: the open chapter */
  chapter?: number;
  /** absent: the chapter's first verse */
  verse?: number;
  verseEnd?: number;
}

const FULL = /^(\d{1,3})(?:\s*[:.,\s]\s*(\d{1,3}))?(?:\s*-\s*(\d{1,3}))?$/;
const CHAPTER_ONLY = /^(\d{1,3})\s*[:.,]$/;

export function parseQuickRef(input: string): QuickRef | null {
  const q = input.trim();
  const only = q.match(CHAPTER_ONLY);
  if (only) return { chapter: Number(only[1]) };
  const m = q.match(FULL);
  if (!m) return null;
  const [a, b, end] = [m[1], m[2], m[3]].map((x) => (x === undefined ? undefined : Number(x)));
  const r: QuickRef = b === undefined ? { verse: a } : { chapter: a, verse: b };
  if (end !== undefined) {
    if (end < (r.verse ?? 0)) return null;
    if (end !== r.verse) r.verseEnd = end;
  }
  return r;
}
