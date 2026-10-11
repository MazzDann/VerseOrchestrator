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
      { book: 10, chapter: 1, verse: 1, ord: 1, title: 'Сотворення світу' },
    ]);
    expect(readSubheadings(all, ['subheadings'])).toEqual([
      { book: 10, chapter: 1, verse: 1, ord: 0, title: 'The Creation' },
    ]);
    expect(readSubheadings(all, ['verses'])).toEqual([]);
  });
});
