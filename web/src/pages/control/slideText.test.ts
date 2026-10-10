import { describe, expect, it } from 'vitest';
import { type Verse } from '../../api';
import {
  GAP,
  joinVerses,
  numbersOn,
  redLetterSegments,
  strongHighlightSegments,
} from './slideText';

const verse = (n: number, text: string, textRaw?: string): Verse => ({
  translationId: 1,
  bookNumber: 500,
  chapter: 3,
  verse: n,
  text,
  ...(textRaw !== undefined ? { textRaw } : {}),
});

const chapter = [
  verse(1, 'Перший.'),
  verse(2, '  Другий.  '),
  verse(3, 'Третій.'),
  verse(4, ''),
  verse(5, "П'ятий."),
];

describe('joinVerses', () => {
  it('joins the selected verses in chapter order, with numbers when asked', () => {
    expect(joinVerses(chapter, [2, 1], true)).toBe('1 Перший. 2 Другий.');
    expect(joinVerses(chapter, [1, 2], false)).toBe('Перший. Другий.');
  });

  it('marks a skip between non-contiguous verses with the gap', () => {
    expect(joinVerses(chapter, [1, 3], false)).toBe(`Перший. ${GAP} Третій.`);
  });

  it('leaves out an empty verse, so the verses around it read as a skip', () => {
    expect(joinVerses(chapter, [3, 4, 5], false)).toBe(`Третій. ${GAP} П'ятий.`);
    expect(joinVerses(chapter, [4], true)).toBe('');
  });
});

describe('redLetterSegments', () => {
  it('marks the words of Jesus from the raw markup, with numbers and gaps', () => {
    const verses = [
      verse(1, 'Сказав: Я є шлях.', 'Сказав: <J>Я є шлях.</J>'),
      verse(2, 'Пішли.'),
      verse(3, 'Слова.', '<J>Слова.</J>'),
    ];
    expect(redLetterSegments(verses, [1, 3], true)).toEqual([
      { text: '1', v: 1, num: true },
      { text: 'Сказав:', v: 1 },
      { text: 'Я є шлях.', jesus: true, v: 1 },
      { text: GAP },
      { text: '3', v: 3, num: true },
      { text: 'Слова.', jesus: true, v: 3 },
    ]);
  });

  it('falls back to the plain text without markup', () => {
    expect(redLetterSegments([verse(7, 'Просто текст.')], [7], false)).toEqual([
      { text: 'Просто текст.', v: 7 },
    ]);
  });
});

describe('strongHighlightSegments', () => {
  it('emphasises the words that carry the Strong number', () => {
    const verses = [verse(1, 'На початку Бог', 'На початку<S>7225</S> Бог<S>430</S>')];
    expect(strongHighlightSegments(verses, [1], true, '430')).toEqual([
      { text: '1', v: 1, num: true },
      { text: 'На початку', v: 1 },
      { text: 'Бог', hot: true, v: 1 },
    ]);
  });

  it('shows the plain text of a verse with no Strong markup, and a gap for a skip', () => {
    const verses = [verse(1, ' Перший. '), verse(2, 'Другий.'), verse(3, '')];
    expect(strongHighlightSegments(verses, [1, 3], false, '430')).toEqual([
      { text: 'Перший.', v: 1 },
      { text: GAP },
    ]);
  });
});

describe('numbersOn (1.13.0-beta.1)', () => {
  it('«Коли віршів кілька» numbers two verses and more; «Завжди» one too; «Ні» none', () => {
    expect(numbersOn('multi', 1)).toBe(false);
    expect(numbersOn('multi', 2)).toBe(true);
    expect(numbersOn('always', 1)).toBe(true);
    expect(numbersOn('off', 5)).toBe(false);
  });
});
