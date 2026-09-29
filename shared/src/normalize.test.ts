import { describe, it, expect } from 'vitest';
import { stripTags, normalizeForSearch, strongNumbers, parseRedLetter } from './normalize.js';
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

describe('parseRedLetter', () => {
  it('returns a single plain segment when there are no red-letter tags', () => {
    expect(parseRedLetter('In the beginning<S>7225</S> God')).toEqual([
      { text: 'In the beginning God' },
    ]);
  });

  it('marks the words of Jesus and strips other markup', () => {
    const input = 'Но Иса ответил: <t><J>Написано<S>1125</S>: не хлебом одним</J></t> сказал';
    expect(parseRedLetter(input)).toEqual([
      { text: 'Но Иса ответил:' },
      { text: 'Написано: не хлебом одним', jesus: true },
      { text: 'сказал' },
    ]);
  });

  it('handles a verse that is entirely red-letter', () => {
    expect(parseRedLetter('<J>Let there be light</J>')).toEqual([
      { text: 'Let there be light', jesus: true },
    ]);
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

  it('parses a multi-word book name', () => {
    expect(parseReference('Ісус Навин 4:10')).toMatchObject({
      bookToken: 'ісус навин',
      chapter: 4,
      verseStart: 10,
    });
  });

  it('parses a multi-word book name with a space-separated verse', () => {
    expect(parseReference('Пісня над піснями 3 1')).toMatchObject({
      bookToken: 'пісня над піснями',
      chapter: 3,
      verseStart: 1,
    });
  });

  it('parses a multi-word book + chapter only', () => {
    expect(parseReference('ісус навин 4')).toMatchObject({ bookToken: 'ісус навин', chapter: 4 });
  });

  it('returns null for non-references', () => {
    expect(parseReference('любов')).toBeNull();
    expect(parseReference('16')).toBeNull();
  });
});
