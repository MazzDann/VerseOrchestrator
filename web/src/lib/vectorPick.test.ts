import { describe, expect, it } from 'vitest';
import { onePerLanguage, type VectorRow } from './vectorPick';

const row = (
  id: number,
  abbr: string,
  language: string,
  verses = 31000,
  state: VectorRow['state'] = 'none',
): VectorRow => ({ id, abbr, language, verses, state });

describe('vectors: one translation per language', () => {
  const ROWS = [
    row(1, 'UKRK', 'uk'),
    row(2, "UBIO'62", 'uk'),
    row(3, 'KJV+', 'en'),
    row(4, 'CJB', 'en'),
    row(5, 'JNTr', 'ru', 7954),
    row(6, 'RST+', 'ru'),
    row(7, 'LXX', 'grc', 30000, 'done'),
    row(8, 'STR+', 'grc', 7957),
  ];

  it('takes the main translation for its language, the fullest elsewhere, none where vectors are', () => {
    expect(onePerLanguage(ROWS, 2).sort()).toEqual([2, 4, 6]); // CJB before KJV+ by name; RST+ whole
  });

  it('one already begun before a fuller one', () => {
    const rows = [row(1, 'HOM', 'uk', 35472), row(2, "UBIO'62", 'uk', 31170, 'partial')];
    expect(onePerLanguage(rows, null)).toEqual([2]);
    expect(onePerLanguage(rows, 1)).toEqual([1]); // the main one still wins
  });

  it('with no main translation: the fullest, then by name', () => {
    expect(onePerLanguage(ROWS, 1).sort()).toEqual([1, 4, 6]); // the main one wins its language
    expect(onePerLanguage(ROWS, null).sort()).toEqual([2, 4, 6]); // UBIO'62 before UKRK by name
  });
});
