import { describe, expect, it } from 'vitest';
import { remapPlace } from './remapPlace';

const PSALMS = 230;
const JOHN = 500;
/** rows of (translation, book, chapter, verses) from a list of chapter lengths */
const book = (translationId: number, bookNumber: number, lengths: number[]) =>
  lengths.map((verses, i) => ({ translationId, bookNumber, chapter: i + 1, verses }));

// Psalms 20–23 in two numberings: UBIO'62 (2) counts a psalm's superscription as verse 1, UKRK (1) doesn't
const UKRK = 1;
const UBIO = 2;
const lens = [9, 13, 31, 6];
const psalms = [
  ...book(UKRK, PSALMS, [...Array(19).fill(10), ...lens]),
  ...book(UBIO, PSALMS, [...Array(19).fill(10), ...lens.map((n) => n + 1)]),
];

describe('a new main translation takes the same place in its numbering (1.12.6)', () => {
  it('UKRK Пс 22:2 is UBIO’62 22:3 — the superscription is a verse there', () => {
    expect(
      remapPlace(psalms, UKRK, UBIO, { bookNumber: PSALMS, chapter: 22, verses: [2] }),
    ).toEqual({
      bookNumber: PSALMS,
      chapter: 22,
      verses: [3],
    });
  });

  it('back: UBIO 22:1 (the superscription) and 22:2 are UKRK 22:1, once', () => {
    expect(
      remapPlace(psalms, UBIO, UKRK, { bookNumber: PSALMS, chapter: 22, verses: [1, 2, 3] }),
    ).toEqual({
      bookNumber: PSALMS,
      chapter: 22,
      verses: [1, 2],
    });
  });

  it('the same numbering: the place as it is', () => {
    const john = [...book(1, JOHN, [51, 25, 36]), ...book(2, JOHN, [51, 25, 36])];
    expect(remapPlace(john, 1, 2, { bookNumber: JOHN, chapter: 3, verses: [16] })).toEqual({
      bookNumber: JOHN,
      chapter: 3,
      verses: [16],
    });
  });

  it('a chapter open with no verse picked moves with its first verse', () => {
    expect(remapPlace(psalms, UBIO, UKRK, { bookNumber: PSALMS, chapter: 21, verses: [] })).toEqual(
      {
        bookNumber: PSALMS,
        chapter: 21,
        verses: [],
      },
    );
  });

  it('a selection across a chapter edge keeps the part in its first verse’s chapter', () => {
    // Malachi: the Hebrew 3 chapters (3:19–24) against 4 (4:1–6)
    const MAL = 460;
    const rows = [...book(1, MAL, [14, 17, 18, 6]), ...book(2, MAL, [14, 17, 24])];
    expect(remapPlace(rows, 1, 2, { bookNumber: MAL, chapter: 4, verses: [1, 2] })).toEqual({
      bookNumber: MAL,
      chapter: 3,
      verses: [19, 20],
    });
  });

  it('the new translation hasn’t the book: the place goes; no lengths for the old one: it stays', () => {
    const nt = book(3, JOHN, [51]);
    expect(
      remapPlace([...psalms, ...nt], UKRK, 3, { bookNumber: PSALMS, chapter: 22, verses: [2] }),
    ).toBe('no-book');
    expect(
      remapPlace(book(UBIO, PSALMS, [10]), 9, UBIO, {
        bookNumber: PSALMS,
        chapter: 1,
        verses: [1],
      }),
    ).toBeNull();
  });
});
