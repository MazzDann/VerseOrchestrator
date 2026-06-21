import { describe, it, expect } from 'vitest';
import { stripTags, normalizeForSearch, searchTokens, strongNumbers } from './normalize.js';
import { parseReference } from './reference.js';

describe('stripTags', () => {
  it('removes Strong numbers and keeps readable words', () => {
    const input = '<pb/>In the beginning<S>7225</S> God<S>430</S> created<S>1254</S>';
    expect(stripTags(input)).toBe('In the beginning God created');
  });

  it('keeps inner text of italics but drops the tag', () => {
    expect(stripTags('upon the face of the deep. And <i>was</i> good')).toBe(
      'upon the face of the deep. And was good',
    );
  });

  it('drops footnote content', () => {
    expect(stripTags('word<f>a footnote</f> after')).toBe('word after');
  });

  it('drops Strong numbers and morphology codes from Greek modules', () => {
    expect(stripTags('εν <S>1722</S> <m>PREP</m> αρχη <S>746</S> <m>N-DSF</m>')).toBe('εν αρχη');
  });

  it('passes through plain text untouched', () => {
    expect(stripTags('На початку Бог створив небо і землю.')).toBe(
      'На початку Бог створив небо і землю.',
    );
  });
});

describe('normalizeForSearch', () => {
  it('is case-insensitive for Cyrillic', () => {
    expect(normalizeForSearch('ЛЮБОВ')).toBe(normalizeForSearch('любов'));
  });

  it('strips markup before normalizing', () => {
    expect(normalizeForSearch('Бог<S>430</S> любить')).toBe('бог любить');
  });

  it('tokenizes a query', () => {
    expect(searchTokens('Бог  любить!')).toEqual(['бог', 'любить']);
  });
});

describe('strongNumbers', () => {
  it('extracts Strong numbers from raw markup', () => {
    const input = '<e>בְּרֵאשִׁ֖ית</e> <S>7225</S> <n>x</n> created <S>1254</S> God <S>430</S>';
    expect(strongNumbers(input)).toEqual([7225, 1254, 430]);
  });

  it('deduplicates repeated numbers, keeping first-seen order', () => {
    expect(strongNumbers('a<S>1961</S> b<S>430</S> c<S>1961</S>')).toEqual([1961, 430]);
  });

  it('returns an empty array when there is no Strong markup', () => {
    expect(strongNumbers('На початку Бог створив')).toEqual([]);
    expect(strongNumbers('')).toEqual([]);
  });
});

describe('parseReference', () => {
  it('parses book chapter verse', () => {
    expect(parseReference('Ів 3:16')).toMatchObject({ chapter: 3, verseStart: 16, verseEnd: 16 });
  });

  it('parses a verse range', () => {
    expect(parseReference('Jn 3:16-18')).toMatchObject({
      chapter: 3,
      verseStart: 16,
      verseEnd: 18,
    });
  });

  it('parses an ordinal book with chapter only', () => {
    const r = parseReference('1 Кор 13');
    expect(r?.bookToken).toBe('1 кор');
    expect(r?.chapter).toBe(13);
    expect(r?.verseStart).toBeUndefined();
  });

  it('parses space-separated book chapter verse', () => {
    expect(parseReference('бут 2 3')).toMatchObject({
      bookToken: 'бут',
      chapter: 2,
      verseStart: 3,
      verseEnd: 3,
    });
  });

  it('parses a space-separated verse range', () => {
    expect(parseReference('бут 2 3-5')).toMatchObject({ chapter: 2, verseStart: 3, verseEnd: 5 });
  });

  it('parses a colon verse range with space book', () => {
    expect(parseReference('бут 2:3-5')).toMatchObject({ chapter: 2, verseStart: 3, verseEnd: 5 });
  });

  it('parses book + chapter only (whole chapter)', () => {
    const r = parseReference('бут 2');
    expect(r).toMatchObject({ bookToken: 'бут', chapter: 2 });
    expect(r?.verseStart).toBeUndefined();
  });

  it('parses an ordinal book with space-separated verse', () => {
    expect(parseReference('1 кор 13 4-7')).toMatchObject({
      bookToken: '1 кор',
      chapter: 13,
      verseStart: 4,
      verseEnd: 7,
    });
  });

  it('returns null for non-references', () => {
    expect(parseReference('любов')).toBeNull();
    expect(parseReference('16')).toBeNull();
  });
});
