import { tr } from '../i18n';

/**
 * «Далі» past a chapter's last verse, «Назад» before its first (0.6.23): the first press
 * only says where a second one goes; pressed again within CROSS_MS it turns the chapter.
 * A clicker never leaves the chapter by accident, and a reading can still run on. Since
 * 1.4.0 the same two presses cross a book's edge too: the next book's first chapter, the
 * previous book's last one.
 */
export const CROSS_MS = 5000;

export interface CrossArm {
  /** the edge that was reached: translation · book · chapter · direction */
  key: string;
  until: number;
}

/** The chapter next to `chapter` in `delta`'s direction, or null at the book's edge. */
export function neighbourChapter(
  chapters: readonly number[],
  chapter: number,
  delta: number,
): number | null {
  const sorted = [...new Set(chapters)].sort((a, b) => a - b);
  const at = sorted.indexOf(chapter);
  if (at < 0) return null;
  return sorted[at + (delta > 0 ? 1 : -1)] ?? null;
}

/** The book next to `book` in `delta`'s direction (by book number), or null at the edge. */
export function neighbourBook(
  books: readonly number[],
  book: number,
  delta: number,
): number | null {
  const sorted = [...new Set(books)].sort((a, b) => a - b);
  const at = sorted.indexOf(book);
  if (at < 0) return null;
  return sorted[at + (delta > 0 ? 1 : -1)] ?? null;
}

/** Where a step past a chapter's edge goes: the next chapter, or the next book (1.4.0). */
export interface CrossTarget {
  book: number;
  chapter: number;
  /** it leaves the book */
  newBook: boolean;
}

/**
 * The chapter a crossing from `at` opens — in the same book, else the neighbouring book's
 * first chapter going on, its last going back (`chaptersOf` lists a book's chapters). Null
 * at the translation's first or last verse.
 */
export async function crossTarget(
  at: { book: number; chapter: number },
  chapters: readonly number[],
  books: readonly number[],
  delta: number,
  chaptersOf: (book: number) => Promise<readonly number[]>,
): Promise<CrossTarget | null> {
  const chapter = neighbourChapter(chapters, at.chapter, delta);
  if (chapter != null) return { book: at.book, chapter, newBook: false };
  const book = neighbourBook(books, at.book, delta);
  if (book == null) return null;
  const list = [...new Set(await chaptersOf(book))].sort((a, b) => a - b);
  if (list.length === 0) return null;
  return { book, chapter: delta > 0 ? list[0] : list[list.length - 1], newBook: true };
}

/** A press at the edge: crosses when this edge was armed moments ago, else arms it. */
export function pressAtEdge(
  arm: CrossArm | null,
  key: string,
  now: number,
): { cross: boolean; arm: CrossArm | null } {
  if (arm && arm.key === key && now <= arm.until) return { cross: true, arm: null };
  return { cross: false, arm: { key, until: now + CROSS_MS } };
}

/** Where a crossing lands: the first verse going on, the last going back. */
export function landingVerse(verses: readonly number[], delta: number): number | null {
  if (verses.length === 0) return null;
  return delta > 0 ? Math.min(...verses) : Math.max(...verses);
}

/** «Івана 4» — a chapter by the book's full name (or «розділ 4» before books load). */
export function chapterName(
  book: { longName: string; shortName: string } | null,
  chapter: number,
): string {
  const name = book ? book.longName || book.shortName : '';
  return name ? `${name} ${chapter}` : tr('розділ {n}', { n: chapter });
}

/** What the first press at the edge says — a chapter's, or a book's (1.4.0). */
export function edgeNotice(delta: number, place: string, newBook = false): string {
  if (newBook) {
    return delta > 0
      ? tr('Кінець книги. Натисніть «Далі» ще раз — {place}', { place })
      : tr('Початок книги. Натисніть «Назад» ще раз — {place}', { place });
  }
  return delta > 0
    ? tr('Кінець розділу. Натисніть «Далі» ще раз — {place}', { place })
    : tr('Початок розділу. Натисніть «Назад» ще раз — {place}', { place });
}

/** At the translation's first or last verse there is nowhere to cross to. */
export function translationEdge(delta: number): string {
  return delta > 0 ? tr('Це останній вірш перекладу') : tr('Це перший вірш перекладу');
}
