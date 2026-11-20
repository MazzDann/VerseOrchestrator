import { parseReference } from '@vo/shared';

/**
 * Several places on one slide (1.23.0-beta.7, the users' F1114-07: «А як вивести два окремі місця з
 * Біблії?»): «Ів 3:16; Рим 5:8» — two or more references split by «;», each a reference on its own.
 * null: not that (words, one reference, a part that isn't a reference).
 */
export function splitPlaces(query: string): string[] | null {
  if (!query.includes(';')) return null;
  const parts = query
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length >= 2 && parts.every((p) => parseReference(p) !== null) ? parts : null;
}

/** A place gathered for one slide: a book's chapter and the verses picked there. */
export interface Place {
  bookNumber: number;
  chapter: number;
  verses: number[];
}

/** The same place twice is kept once; at most 6 places on a slide (it must still read). */
export const MAX_PLACES = 6;
export function addPlace(list: readonly Place[], p: Place): Place[] {
  const key = (x: Place) => `${x.bookNumber}-${x.chapter}-${x.verses.join(',')}`;
  if (list.some((x) => key(x) === key(p))) return [...list];
  return [...list, p].slice(-MAX_PLACES);
}
