import { describe, expect, it } from 'vitest';
import { groupResults } from './searchGroups';
import type { SearchResult } from '../api';
import { sanitizeSearch } from '../settingsStore';

const hit = (translationId: number, bookNumber: number, chapter: number, verse: number) =>
  ({
    translationId,
    bookNumber,
    chapter,
    verse,
    text: `${translationId}`,
    shortName: 'Ів',
    longName: 'Івана',
  }) as SearchResult;

describe('one search: one row per place (1.8.12-beta.4)', () => {
  it('a verse found in several translations is one row, in the main translation’s words', () => {
    const rows = groupResults(
      [hit(9, 500, 3, 16), hit(5, 500, 3, 16), hit(14, 500, 3, 16), hit(9, 500, 4, 1)],
      5,
      true,
    );
    expect(rows.map((r) => [r.key, r.r.translationId, r.also])).toEqual([
      ['500-3-16', 5, [9, 14]],
      ['500-4-1', 9, []],
    ]);
  });

  it('keeps every hit when repeats are wanted, and a translation counts once', () => {
    expect(groupResults([hit(9, 500, 3, 16), hit(5, 500, 3, 16)], 5, false)).toHaveLength(2);
    expect(groupResults([hit(9, 500, 3, 16), hit(9, 500, 3, 16)], null, true)[0].also).toEqual([]);
  });

  it('reads stored search settings, whatever was stored', () => {
    expect(sanitizeSearch(undefined)).toEqual({
      scope: 'current',
      dedupe: true,
      focusOnReturn: false,
    });
    expect(sanitizeSearch({ scope: 'all', dedupe: false, focusOnReturn: true })).toEqual({
      scope: 'all',
      dedupe: false,
      focusOnReturn: true,
    });
    expect(sanitizeSearch({ scope: 'x', dedupe: 'yes', focusOnReturn: 1 })).toEqual({
      scope: 'current',
      dedupe: true,
      focusOnReturn: false,
    });
  });
});
