import { describe, expect, it } from 'vitest';
import {
  CROSS_MS,
  chapterName,
  crossTarget,
  edgeNotice,
  landingVerse,
  neighbourBook,
  neighbourChapter,
  pressAtEdge,
  translationEdge,
} from './chapterCross';

describe('neighbourChapter', () => {
  it('steps within the book, in any order of the list', () => {
    expect(neighbourChapter([1, 2, 3], 2, 1)).toBe(3);
    expect(neighbourChapter([3, 1, 2], 2, -1)).toBe(1);
  });
  it('skips gaps (a module without some chapters)', () => {
    expect(neighbourChapter([1, 2, 5], 2, 1)).toBe(5);
  });
  it('stops at the book edges and on an unknown chapter', () => {
    expect(neighbourChapter([1, 2, 3], 3, 1)).toBeNull();
    expect(neighbourChapter([1, 2, 3], 1, -1)).toBeNull();
    expect(neighbourChapter([1, 2, 3], 9, 1)).toBeNull();
    expect(neighbourChapter([], 1, 1)).toBeNull();
  });
});

describe('pressAtEdge', () => {
  const key = '1:43:3:1';
  it('the first press arms, a second one in time crosses', () => {
    const first = pressAtEdge(null, key, 1000);
    expect(first).toEqual({ cross: false, arm: { key, until: 1000 + CROSS_MS } });
    expect(pressAtEdge(first.arm, key, 1000 + CROSS_MS)).toEqual({ cross: true, arm: null });
  });
  it('too late, or at another edge, arms again instead', () => {
    const arm = { key, until: 6000 };
    expect(pressAtEdge(arm, key, 6001)).toEqual({
      cross: false,
      arm: { key, until: 6001 + CROSS_MS },
    });
    expect(pressAtEdge(arm, '1:43:3:-1', 2000).cross).toBe(false);
  });
});

describe('landingVerse', () => {
  it('lands on the first verse going on and the last going back', () => {
    expect(landingVerse([1, 2, 3, 36], 1)).toBe(1);
    expect(landingVerse([1, 2, 3, 36], -1)).toBe(36);
    expect(landingVerse([0, 1, 2], 1)).toBe(0); // a psalm's title as verse 0
    expect(landingVerse([], 1)).toBeNull();
  });
});

describe('notices', () => {
  it('names where the second press goes', () => {
    const john = { longName: 'Івана', shortName: 'Ів' };
    expect(chapterName(john, 4)).toBe('Івана 4');
    expect(chapterName({ longName: '', shortName: 'Ів' }, 4)).toBe('Ів 4');
    expect(chapterName(null, 4)).toBe('розділ 4');
    expect(edgeNotice(1, 'Івана 4')).toBe('Кінець розділу. Натисніть «Далі» ще раз — Івана 4');
    expect(edgeNotice(-1, 'Івана 2')).toBe('Початок розділу. Натисніть «Назад» ще раз — Івана 2');
    expect(edgeNotice(1, 'Діяння 1', true)).toBe(
      'Кінець книги. Натисніть «Далі» ще раз — Діяння 1',
    );
    expect(edgeNotice(-1, 'Луки 24', true)).toBe(
      'Початок книги. Натисніть «Назад» ще раз — Луки 24',
    );
    expect(translationEdge(1)).toBe('Це останній вірш перекладу');
    expect(translationEdge(-1)).toBe('Це перший вірш перекладу');
  });
});

describe('across a book’s edge (1.4.0)', () => {
  // MyBible numbers: Luke 490, John 500, Acts 510
  const books = [500, 490, 510];
  const chaptersOf = async (book: number) =>
    ({ 490: [1, 2, 24], 500: [1, 21], 510: [2, 1, 28] })[book] ?? [];

  it('the neighbouring book by number, null past the ends or for an unknown one', () => {
    expect(neighbourBook(books, 500, 1)).toBe(510);
    expect(neighbourBook(books, 500, -1)).toBe(490);
    expect(neighbourBook(books, 510, 1)).toBeNull();
    expect(neighbourBook(books, 490, -1)).toBeNull();
    expect(neighbourBook(books, 999, 1)).toBeNull();
  });

  it('inside a book the next chapter; at its edge the next book’s first or last chapter', async () => {
    expect(await crossTarget({ book: 500, chapter: 1 }, [1, 21], books, 1, chaptersOf)).toEqual({
      book: 500,
      chapter: 21,
      newBook: false,
    });
    expect(await crossTarget({ book: 500, chapter: 21 }, [1, 21], books, 1, chaptersOf)).toEqual({
      book: 510,
      chapter: 1,
      newBook: true,
    });
    expect(await crossTarget({ book: 500, chapter: 1 }, [1, 21], books, -1, chaptersOf)).toEqual({
      book: 490,
      chapter: 24,
      newBook: true,
    });
  });

  it('nothing past the translation’s first or last chapter', async () => {
    expect(
      await crossTarget({ book: 510, chapter: 28 }, [1, 2, 28], books, 1, chaptersOf),
    ).toBeNull();
    expect(
      await crossTarget({ book: 490, chapter: 1 }, [1, 2, 24], books, -1, chaptersOf),
    ).toBeNull();
  });
});
