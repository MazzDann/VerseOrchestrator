import { describe, expect, it } from 'vitest';
import {
  alignChapters,
  isIdentity,
  KNOWN_RENUMBERED,
  mapSelection,
  PSALMS,
  profilesOf,
  versificationMap,
  type Profile,
} from './versification';

const prof = (...counts: number[]): Profile => counts.map((n, i) => [i + 1, n] as const);

describe('versification alignment (1.8.12-beta.5)', () => {
  it('the same numbering maps every place to itself', () => {
    const a = prof(31, 25, 24);
    expect(isIdentity(a, a, alignChapters(a, a))).toBe(true);
    expect(versificationMap(a, a, 10)(2, 7)).toEqual([2, 7]);
  });

  it('Psalms, Greek/Synodal against English: 9+10 joined, superscriptions as verses, the rest one on', () => {
    // English: Ps 1–11; the Synodal joins 9+10 (with a superscription verse) and counts
    // superscriptions in 3–8, so its 10 is the English 11
    const en = prof(6, 12, 8, 8, 12, 10, 17, 9, 20, 18, 7);
    const ru = prof(6, 12, 9, 9, 13, 11, 18, 10, 39, 7);
    const map = versificationMap(en, ru, PSALMS);
    expect(map(3, 1)).toEqual([3, 1]); // the superscription goes with verse 1
    expect(map(3, 2)).toEqual([3, 1]);
    expect(map(3, 9)).toEqual([3, 8]);
    expect(map(9, 2)).toEqual([9, 1]);
    expect(map(9, 22)).toEqual([10, 1]);
    expect(map(9, 39)).toEqual([10, 18]);
    expect(map(10, 1)).toEqual([11, 1]);
  });

  it('Malachi and Joel: chapters joined and split across translations', () => {
    // English Malachi 4 chapters (…, 18, 6), Hebrew 3 (…, 24): Hebrew 3:19 = English 4:1
    const malEn = prof(14, 17, 18, 6);
    const malHe = prof(14, 17, 24);
    expect(versificationMap(malEn, malHe, 460)(3, 19)).toEqual([4, 1]);
    expect(versificationMap(malEn, malHe, 460)(3, 24)).toEqual([4, 6]);
    expect(versificationMap(malHe, malEn, 460)(4, 1)).toEqual([3, 19]);
    // English Joel 3 chapters (20, 32, 21), Hebrew 4 (20, 27, 5, 21): Hebrew 3:1 = English 2:28
    const joelEn = prof(20, 32, 21);
    const joelHe = prof(20, 27, 5, 21);
    expect(versificationMap(joelEn, joelHe, 360)(3, 1)).toEqual([2, 28]);
    expect(versificationMap(joelEn, joelHe, 360)(4, 21)).toEqual([3, 21]);
  });

  it('a verse moved across a chapter edge: the two chapters read as one text', () => {
    // English Genesis 31 has 55 verses and 32 has 32; the Hebrew 54 and 33: Hebrew 32:1 = English 31:55
    const en = prof(10, 55, 32, 20);
    const he = prof(10, 54, 33, 20);
    const map = versificationMap(en, he, 10);
    expect(map(3, 1)).toEqual([2, 55]);
    expect(map(3, 2)).toEqual([3, 1]);
    expect(map(2, 54)).toEqual([2, 54]);
    expect(map(4, 5)).toEqual([4, 5]);
  });

  it('two uneven chapters with an even one between are not one text (Romans’ doxology)', () => {
    // the doxology at 14:24–26 in one, at 16:25–27 in the other; 15 the same in both
    const a = prof(32, 29, 26, 33, 24);
    const b = prof(32, 29, 23, 33, 27);
    const map = versificationMap(a, b, 520);
    expect(map(4, 33)).toEqual([4, 33]); // chapter 15 stays where it is
    expect(map(3, 10)).toEqual([3, 10]);
    expect(map(5, 1)).toEqual([5, 1]);
  });

  it('a split chapter at the end of a book found from the lengths (Ps 147 = 147 + 148)', () => {
    const en = prof(10, 20, 14, 9, 6); // … 146, 147, 148, 149, 150
    const uk = prof(10, 11, 9, 14, 9, 6); // 147 in two, so 151 is the English 150
    const map = versificationMap(en, uk, PSALMS);
    expect(map(3, 1)).toEqual([2, 12]);
    expect(map(6, 6)).toEqual([5, 6]);
  });

  it('a chapter only one translation has maps to nothing', () => {
    const a = prof(20, 20, 20);
    const b = prof(20, 20, 20, 7);
    expect(versificationMap(a, b, 340)(4, 1)).toBeNull();
    expect(versificationMap(a, b, 340)(2, 5)).toEqual([2, 5]);
  });

  it('builds profiles from rows of any order', () => {
    const p = profilesOf([
      { translationId: 1, bookNumber: 230, chapter: 2, verses: 12 },
      { translationId: 1, bookNumber: 230, chapter: 1, verses: 6 },
      { translationId: 2, bookNumber: 230, chapter: 1, verses: 6 },
    ]);
    expect(p.get('1-230')).toEqual([
      [1, 6],
      [2, 12],
    ]);
    expect(p.get('2-230')).toEqual([[1, 6]]);
  });
});

describe('the review of the alignment (1.8.12-beta.5)', () => {
  it('a few extra verses at a chapter’s end have no counterpart; a big insertion keeps its numbers', () => {
    const a = prof(20, 17, 30);
    const tail = prof(20, 18, 30); // Rev 12:18 in one, not in the other
    expect(versificationMap(a, tail, 660)(2, 17)).toEqual([2, 17]);
    expect(versificationMap(a, tail, 660)(2, 18)).toBeNull();
    const greek = prof(20, 97, 30); // Daniel 3 with the Greek additions inside
    expect(versificationMap(prof(20, 30, 30), greek, 340)(2, 50)).toEqual([2, 50]);
  });
});

describe('a selection in another numbering (1.13.0-beta.2, F1010-07)', () => {
  // the Psalms' chapter lengths of Гижа (GYZ, the Synodal numbering) and Огієнко 1962 (UBIO'62,
  // the Hebrew one) in the PC's library
  const GYZ = prof(
    ...[6, 12, 9, 9, 13, 11, 18, 10, 39, 7, 9, 6, 7, 5, 11, 15, 51, 15, 10, 14, 32, 6, 10, 22, 12],
    ...[14, 9, 11, 13, 25, 11, 22, 23, 28, 13, 40, 23, 14, 18, 14, 12, 5, 27, 18, 12, 10, 15, 21],
    ...[23, 21, 11, 7, 9, 24, 14, 12, 12, 18, 14, 9, 13, 12, 11, 14, 20, 8, 36, 37, 6, 24, 20, 28],
    ...[
      23, 11, 13, 21, 72, 13, 20, 17, 8, 19, 13, 14, 17, 7, 19, 53, 17, 16, 16, 5, 23, 11, 13, 12,
    ],
    ...[9, 9, 5, 8, 29, 22, 35, 45, 48, 43, 14, 31, 7, 10, 10, 9, 26, 9, 10, 2, 29, 176, 7, 8, 9],
    ...[4, 8, 5, 6, 5, 6, 8, 8, 3, 18, 3, 3, 21, 26, 9, 8, 24, 14, 10, 7, 12, 15, 21, 10, 11, 9],
    ...[14, 9, 6],
  );
  const UBIO62 = prof(
    ...[6, 12, 9, 9, 13, 11, 17, 10, 21, 18, 7, 9, 7, 7, 5, 11, 15, 51, 15, 10, 14, 32, 6, 10, 22],
    ...[12, 14, 9, 11, 13, 25, 11, 22, 23, 28, 13, 40, 23, 14, 18, 14, 12, 5, 27, 18, 12, 10, 15],
    ...[21, 23, 21, 11, 7, 9, 24, 14, 12, 12, 18, 14, 9, 13, 12, 11, 14, 20, 8, 36, 37, 6, 24, 20],
    ...[
      28, 23, 11, 13, 21, 72, 13, 20, 17, 8, 19, 13, 14, 17, 7, 19, 53, 17, 16, 16, 5, 23, 11, 13,
    ],
    ...[12, 9, 9, 5, 8, 29, 22, 35, 45, 48, 43, 14, 31, 7, 10, 10, 9, 8, 18, 19, 2, 29, 176, 7, 8],
    ...[
      9, 4, 8, 5, 6, 5, 6, 8, 8, 3, 18, 3, 3, 21, 26, 9, 8, 24, 14, 10, 8, 12, 15, 21, 10, 20, 14,
    ],
    ...[9, 6],
  );

  it('Огієнко Пс 15 is Гижа 14; a pick across Гижа’s chapter edge comes in order', () => {
    // UBIO'62's places in GYZ's numbering
    const toGyz = versificationMap(GYZ, UBIO62, PSALMS);
    expect(mapSelection(toGyz, 15, [1, 2])).toEqual([
      { chapter: 14, verse: 1, of: 1 },
      { chapter: 14, verse: 2, of: 2 },
    ]);
    expect(mapSelection(toGyz, 116, [8, 9, 10, 11]).map((p) => `${p.chapter}:${p.verse}`)).toEqual([
      '114:8',
      '114:9',
      '115:1',
      '115:2',
    ]);
  });

  it('each place once, additions left out', () => {
    const twoToOne = (c: number, v: number): [number, number] | null =>
      v === 9 ? null : [c, Math.max(1, v - 1)];
    expect(mapSelection(twoToOne, 22, [2, 1, 9, 3])).toEqual([
      { chapter: 22, verse: 1, of: 1 },
      { chapter: 22, verse: 2, of: 3 },
    ]);
  });

  it('the known renumbered books: the Psalms, Malachi, Joel — not John', () => {
    expect([230, 460, 360].every((b) => KNOWN_RENUMBERED.has(b))).toBe(true);
    expect(KNOWN_RENUMBERED.has(500)).toBe(false);
  });
});
