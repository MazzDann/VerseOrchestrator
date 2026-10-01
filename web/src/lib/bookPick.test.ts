import { describe, expect, it } from 'vitest';
import {
  chapterOnBookPick,
  onlyChapter,
  opensAtTop,
  stepBackFromVerses,
  stepOverChapters,
} from './bookPick';

const nowhere = { bookNumber: null, chapter: null };

describe('chapterOnBookPick', () => {
  it('opens a picked book at its first chapter', () => {
    expect(chapterOnBookPick(nowhere, 10)).toBe(1); // Genesis, its list not loaded yet
    expect(chapterOnBookPick({ bookNumber: 500, chapter: 5 }, 10)).toBe(1); // from John 5
    expect(chapterOnBookPick(nowhere, 10, [1, 2, 3])).toBe(1);
  });
  it('opens a one-chapter book at that chapter', () => {
    expect(chapterOnBookPick(nowhere, 710, [1])).toBe(1); // 3 John
  });
  it('takes the first chapter from a known list that starts elsewhere', () => {
    expect(chapterOnBookPick(nowhere, 10, [3, 4, 5])).toBe(3);
    expect(chapterOnBookPick(nowhere, 10, [7, 2, 9])).toBe(2);
  });
  it('keeps the chapter of the open book picked again', () => {
    expect(chapterOnBookPick({ bookNumber: 500, chapter: 5 }, 500)).toBe(5);
    expect(chapterOnBookPick({ bookNumber: 500, chapter: 5 }, 500, [1, 2, 5, 21])).toBe(5);
  });
  it('opens the first chapter of the open book that has none open yet', () => {
    // a selection saved by 1.4.2 and older: a book picked, no chapter
    expect(chapterOnBookPick({ bookNumber: 500, chapter: null }, 500)).toBe(1);
  });
});

describe('onlyChapter', () => {
  it('is the chapter of a one-chapter book: the phone skips its grid', () => {
    expect(onlyChapter([1])).toBe(1);
  });
  it('is null for a book with more chapters, or while the list is unknown', () => {
    expect(onlyChapter([1, 2])).toBeNull();
    expect(onlyChapter([])).toBeNull();
    expect(onlyChapter(undefined)).toBeNull();
  });
});

describe('opensAtTop', () => {
  const john5 = { bookNumber: 500, chapter: 5 };
  it('starts another chapter opened with nothing to scroll to at its top', () => {
    expect(opensAtTop(john5, { bookNumber: 500, chapter: 6 }, null)).toBe(true); // a chapter click
    expect(opensAtTop(john5, { bookNumber: 710, chapter: 1 }, null)).toBe(true); // a book pick
    expect(opensAtTop(nowhere, john5, null)).toBe(true);
  });
  it('leaves a jump to its own scroll target', () => {
    expect(opensAtTop(john5, { bookNumber: 230, chapter: 119 }, 150)).toBe(false);
  });
  it('keeps the scroll of the same place: a verse clicked, «Зробити головним»', () => {
    // review: making another translation primary threw Пс 119:150 out of view
    expect(opensAtTop(john5, { ...john5 }, null)).toBe(false);
    expect(opensAtTop(john5, { ...john5 }, 30)).toBe(false);
  });
});

describe('the phone picker at a chapter grid', () => {
  it('goes on to the verses of a one-chapter book', () => {
    expect(stepOverChapters(1, false)).toBe('verses');
  });
  it('goes back to the books from the verses of a one-chapter book', () => {
    expect(stepBackFromVerses(1)).toBe('books');
    // «←» before its chapter list arrived: the grid, which then leads on to the books —
    // review: it bounced back to the verses
    expect(stepBackFromVerses(null)).toBe('chapters');
    expect(stepOverChapters(1, true)).toBe('books');
  });
  it('keeps the grid of a book with more chapters, or while its list loads', () => {
    expect(stepOverChapters(null, false)).toBeNull();
    expect(stepOverChapters(null, true)).toBeNull();
  });
});
