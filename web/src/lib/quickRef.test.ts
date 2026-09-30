import { describe, expect, it } from 'vitest';
import { parseQuickRef } from './quickRef';

describe('numbers for a place in the open book (1.4.0)', () => {
  it('a verse of the open chapter, or chapter:verse', () => {
    expect(parseQuickRef('16')).toEqual({ verse: 16 });
    expect(parseQuickRef('3:16')).toEqual({ chapter: 3, verse: 16 });
    expect(parseQuickRef(' 3 : 16 ')).toEqual({ chapter: 3, verse: 16 });
  });

  it('a dot, a comma or a space for the colon', () => {
    expect(parseQuickRef('3.16')).toEqual({ chapter: 3, verse: 16 });
    expect(parseQuickRef('3,16')).toEqual({ chapter: 3, verse: 16 });
    expect(parseQuickRef('3 16')).toEqual({ chapter: 3, verse: 16 });
  });

  it('a few verses, and a chapter from its start', () => {
    expect(parseQuickRef('3:16-18')).toEqual({ chapter: 3, verse: 16, verseEnd: 18 });
    expect(parseQuickRef('16-18')).toEqual({ verse: 16, verseEnd: 18 });
    expect(parseQuickRef('16-16')).toEqual({ verse: 16 });
    expect(parseQuickRef('3:')).toEqual({ chapter: 3 });
    expect(parseQuickRef('3.')).toEqual({ chapter: 3 });
  });

  it('not a place: words, a backwards range, too many parts', () => {
    expect(parseQuickRef('Ів 3:16')).toBeNull();
    expect(parseQuickRef('3:18-16')).toBeNull();
    expect(parseQuickRef('3:16:2')).toBeNull();
    expect(parseQuickRef('')).toBeNull();
    expect(parseQuickRef('1234')).toBeNull();
  });
});
