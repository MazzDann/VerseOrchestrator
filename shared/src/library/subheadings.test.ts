import { describe, expect, it } from 'vitest';
import { readSubheadings } from './module';

describe('section titles from a Module module (1.16.0-beta.2)', () => {
  it('reads «stories» (title) or «subheadings» (subheading), markup stripped, empty left out', () => {
    const rows = {
      stories: [
        {
          book_number: 10,
          chapter: 1,
          verse: 1,
          order_if_several: 1,
          title: 'Сотворення <i>світу</i>',
        },
        { book_number: 10, chapter: 1, verse: 9, order_if_several: 2, title: '  ' },
      ],
      subheadings: [{ book_number: 10, chapter: 1, verse: 1, subheading: 'The Creation' }],
    };
    const all = (sql: string) => (sql.includes('stories') ? rows.stories : rows.subheadings);
    expect(readSubheadings(all, ['info', 'Stories', 'verses'])).toEqual([
      { book: 10, chapter: 1, verse: 1, ord: 0, title: 'Сотворення світу' },
    ]);
    expect(readSubheadings(all, ['subheadings'])).toEqual([
      { book: 10, chapter: 1, verse: 1, ord: 0, title: 'The Creation' },
    ]);
    expect(readSubheadings(all, ['verses'])).toEqual([]);
  });
});

describe('section titles: odd rows', () => {
  it('numbers several titles at one place, skips rows without a place, survives a broken table', () => {
    const rows = [
      { book_number: 10, chapter: 1, verse: 1, title: 'B', order_if_several: 2 },
      { book_number: 10, chapter: 1, verse: 1, title: 'A', order_if_several: 1 },
      { book_number: 10, chapter: 1, verse: 1, title: 'C' },
      { book_number: 'x', chapter: 1, verse: 2, title: 'no book' },
      { chapter: 1, verse: 3, title: 'no column' },
    ];
    expect(readSubheadings(() => rows, ['stories']).map((h) => `${h.ord}:${h.title}`)).toEqual([
      '0:C',
      '1:A',
      '2:B',
    ]);
    expect(
      readSubheadings(() => {
        throw new Error('no such column');
      }, ['stories']),
    ).toEqual([]);
  });
});
