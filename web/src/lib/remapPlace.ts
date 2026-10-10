import { profilesOf, versificationMap } from '@vo/shared';

/** Where the control window stands: a book, a chapter and the picked verses. */
export interface Place {
  bookNumber: number;
  chapter: number;
  verses: number[];
}

type ProfileRow = { translationId: number; bookNumber: number; chapter: number; verses: number };

/**
 * The same place in another translation's numbering (1.12.6, users' report F1010-10: «Коли міняю
 * переклади — вибране і знайдене зникає»; F1010-07: Гижа Пс 14 is Огієнко Пс 15). From the books'
 * chapter lengths (shared versification.ts, as the search's rows since 1.8.12-beta.5): UKRK Пс 22:2
 * → UBIO'62 22:3 (a superscription counted as a verse there); UBIO 22:1 and 22:2 → UKRK 22:1, once.
 * `no-book`: the new translation hasn't the book — the place goes (the author's call, Q7); null:
 * nothing to go by (no lengths for the old one) — the place stays as it is.
 */
export function remapPlace(
  rows: readonly ProfileRow[],
  from: number,
  to: number,
  place: Place,
): Place | 'no-book' | null {
  const prof = profilesOf(rows);
  const target = prof.get(`${to}-${place.bookNumber}`);
  if (!target) return 'no-book';
  const source = prof.get(`${from}-${place.bookNumber}`);
  if (!source) return null;
  // the old translation's places in the new one's numbering
  const map = versificationMap(target, source, place.bookNumber);
  if (place.verses.length === 0) {
    const at = map(place.chapter, 1);
    return at ? { ...place, chapter: at[0], verses: [] } : null;
  }
  const mapped = place.verses.flatMap((v) => {
    const at = map(place.chapter, v);
    return at ? [at] : [];
  });
  if (mapped.length === 0) return null;
  // a selection that falls across a chapter edge keeps the part in its first verse's chapter
  const chapter = mapped[0][0];
  const verses = [...new Set(mapped.filter(([c]) => c === chapter).map(([, v]) => v))].sort(
    (x, y) => x - y,
  );
  return { ...place, chapter, verses };
}
