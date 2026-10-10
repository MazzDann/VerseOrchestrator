import { describe, expect, it } from 'vitest';
import { type Verse } from '../api';
import { alignedLine, alignmentsOf, chaptersFor, ownPlace } from './passageLines';
import { leadWith } from './searchGroups';

// Psalms 1–16 of two numberings: «he» counts superscriptions and keeps 9 and 10 apart, «gr» joins
// 9 + 10 (so its 14 is he's 15)
const HE = [6, 12, 9, 9, 13, 11, 18, 10, 21, 18, 7, 9, 6, 7, 5, 11];
const GR = [6, 12, 9, 9, 13, 11, 18, 10, 39, 7, 9, 6, 7, 5, 11];
const rows = [
  ...HE.map((verses, i) => ({ translationId: 1, bookNumber: 230, chapter: i + 1, verses })),
  ...GR.map((verses, i) => ({ translationId: 2, bookNumber: 230, chapter: i + 1, verses })),
];
const verse = (translationId: number, chapter: number, v: number): Verse => ({
  translationId,
  bookNumber: 230,
  chapter,
  verse: v,
  text: `${translationId === 1 ? 'he' : 'gr'}${chapter}:${v}`,
});

describe('parallel translations in their own numbering (1.13.0-beta.2, F1010-07)', () => {
  const aligns = alignmentsOf(rows, 1, [1, 2], 230);

  it('the main one and a same-numbered book need nothing; another numbering maps', () => {
    expect(aligns.get(1)).toBeNull();
    expect(aligns.get(2)?.map(15, 1)).toEqual([14, 1]);
    // the Psalms are a known difference: not marked
    expect(aligns.get(2)?.approx).toBe(false);
    const john = alignmentsOf(
      [
        { translationId: 1, bookNumber: 500, chapter: 1, verses: 51 },
        { translationId: 2, bookNumber: 500, chapter: 1, verses: 51 },
      ],
      1,
      [1, 2],
      500,
    );
    expect(john.get(2)).toBeNull();
  });

  it('the chapters to load for the main chapter', () => {
    expect(chaptersFor(aligns.get(2) ?? null, 15, 5)).toEqual([14]);
    expect(chaptersFor(null, 15, 5)).toEqual([15]);
  });

  it('a line in its own numbering, its place beside the abbreviation', () => {
    const gr = [1, 2, 3].map((v) => verse(2, 14, v));
    const line = alignedLine({ abbr: 'GR', rtl: false }, gr, 15, [1, 2], aligns.get(2)!, true)!;
    expect(line.text).toBe('1 gr14:1 2 gr14:2');
    expect(line.ownRef).toBe('14:1–2');
    expect(line.approx).toBeUndefined();
    // the pieces stand for the main verses (a grown pick finds them)
    expect(line.segments?.filter((s) => !s.num).map((s) => s.v)).toEqual([1, 2]);
    const same = alignedLine({ abbr: 'HE', rtl: false }, [verse(1, 15, 1)], 15, [1], null, false)!;
    expect(same.text).toBe('he15:1');
    expect(same.ownRef).toBeUndefined();
  });

  it('a module’s own quirk is marked; a place across a chapter edge reads in order', () => {
    expect(
      ownPlace([
        { chapter: 114, verse: 8 },
        { chapter: 114, verse: 9 },
        { chapter: 115, verse: 1 },
      ]),
    ).toBe('114:8–9; 115:1');
    const quirk = alignmentsOf(
      [
        { translationId: 1, bookNumber: 500, chapter: 1, verses: 51 },
        { translationId: 1, bookNumber: 500, chapter: 2, verses: 25 },
        { translationId: 2, bookNumber: 500, chapter: 1, verses: 52 },
        { translationId: 2, bookNumber: 500, chapter: 2, verses: 24 },
      ],
      1,
      [1, 2],
      500,
    );
    expect(quirk.get(2)?.approx).toBe(true);
  });

  it('a lead translation moves to the front; the last gives way past five', () => {
    expect(leadWith([1, 2, 3], 3)).toEqual([3, 1, 2]);
    expect(leadWith([1, 2, 3, 4, 5], 9)).toEqual([9, 1, 2, 3, 4]);
    expect(leadWith([1, 2], 1)).toEqual([1, 2]);
  });
});
