/**
 * A book picked opens a chapter at once (the user's idea, 2026-10-01): a book with one chapter
 * — 2 and 3 John, Jude, Obadiah, Philemon — has nothing to choose in the chapter grid, and
 * the others start at their first chapter. Opening a chapter selects no verse: nothing goes
 * on screen, live-follow included.
 */

/** Where the control window stands. */
export interface OpenPlace {
  bookNumber: number | null;
  chapter: number | null;
}

/**
 * The chapter a picked book opens at: the open book keeps its chapter (picked again, it
 * doesn't jump back), any other book its first one — from its chapter list when that is
 * known, else 1 (every book of the library starts there).
 */
export function chapterOnBookPick(
  open: OpenPlace,
  book: number,
  chapters?: readonly number[],
): number {
  if (open.bookNumber === book && open.chapter != null) return open.chapter;
  return chapters && chapters.length > 0 ? Math.min(...chapters) : 1;
}

/**
 * The control window's verse list: another chapter opened with no verse to bring into view (a
 * book picked, a chapter clicked) starts at its top, not where the last one was scrolled to; a
 * jump scrolls to its own target. The same place keeps its scroll — «Зробити головним» on
 * another translation changes the text, not the chapter (review: it threw a selected verse in
 * the middle of Пс 119 out of view).
 */
export function opensAtTop(
  shown: OpenPlace,
  open: OpenPlace,
  scrollTarget: number | null,
): boolean {
  return (
    scrollTarget == null && (shown.bookNumber !== open.bookNumber || shown.chapter !== open.chapter)
  );
}

/**
 * The phone's picker: a book with one chapter goes straight to its verses — this is that
 * chapter; null while the list is unknown or holds more (there the grid is the navigation).
 */
export function onlyChapter(chapters: readonly number[] | undefined): number | null {
  return chapters?.length === 1 ? chapters[0] : null;
}

/**
 * The phone's picker at a book's chapter grid, `single` = onlyChapter of its list: a book with
 * one chapter has nothing to pick there — going forward the picker goes on to that chapter's
 * verses, come back from them («←») on to the books. null keeps the grid: a book with more
 * chapters, or its list still loading — the step decides once it arrives (review: a «←» tapped
 * before then bounced back to the verses).
 */
export function stepOverChapters(
  single: number | null,
  cameBack: boolean,
): 'verses' | 'books' | null {
  if (single == null) return null;
  return cameBack ? 'books' : 'verses';
}

/** «←» from a chapter's verses: the books for a one-chapter book, else its chapter grid. */
export function stepBackFromVerses(single: number | null): 'books' | 'chapters' {
  return single != null ? 'books' : 'chapters';
}
