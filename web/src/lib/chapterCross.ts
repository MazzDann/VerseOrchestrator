/**
 * «Далі» past a chapter's last verse, «Назад» before its first (0.6.23): the first press
 * only says where a second one goes; pressed again within CROSS_MS it turns the chapter.
 * A clicker never leaves the chapter by accident, and a reading can still run on.
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
  return name ? `${name} ${chapter}` : `розділ ${chapter}`;
}

/** What the first press at the edge says. */
export function edgeNotice(delta: number, place: string): string {
  return delta > 0
    ? `Кінець розділу. Натисніть «Далі» ще раз — ${place}`
    : `Початок розділу. Натисніть «Назад» ще раз — ${place}`;
}

/** At the book's own edge there is nowhere to cross to. */
export function bookEdge(delta: number): string {
  return delta > 0 ? 'Це останній вірш книги' : 'Це перший вірш книги';
}
