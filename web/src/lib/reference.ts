import type { Book } from '../api';

/** Collapse a verse selection into contiguous runs: [3,9] → "3,9", [3,4,5] → "3-5", [3,4,9] → "3-4,9". */
export function formatVerseList(verses: number[]): string {
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  const runs: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const v = sorted[i];
    if (i < sorted.length && v === prev + 1) {
      prev = v;
      continue;
    }
    runs.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = v;
    prev = v;
  }
  return runs.join(',');
}

/** «Євангелія від Івана 3:16» — or the short book name with `short`. */
export function formatReference(
  book: Book | null,
  chapter: number | null,
  verses: number[],
  short = false,
): string {
  if (!book || chapter == null || verses.length === 0) return '';
  const name = short ? book.shortName || book.longName : book.longName || book.shortName;
  return `${name} ${chapter}:${formatVerseList(verses)}`;
}
