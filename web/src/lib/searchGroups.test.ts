import { describe, expect, it } from 'vitest';
import { alignedPlaces, groupResults } from './searchGroups';
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
      place: 'start',
    });
    expect(
      sanitizeSearch({ scope: 'all', dedupe: false, focusOnReturn: true, place: 'verses' }),
    ).toEqual({
      scope: 'all',
      dedupe: false,
      focusOnReturn: true,
      place: 'verses',
    });
    // the field's place (1.8.12-beta.9): an unknown one is the start, as before
    expect(sanitizeSearch({ scope: 'x', dedupe: 'yes', focusOnReturn: 1, place: 'top' })).toEqual({
      scope: 'current',
      dedupe: true,
      focusOnReturn: false,
      place: 'start',
    });
  });
});

describe('one row across numberings (1.8.12-beta.5)', () => {
  // two translations of the Psalms: 1 numbers as the English, 2 as the Synodal (9+10 joined, a
  // superscription verse in 3), so 2's Ps 10 is 1's Ps 11
  const profiles = [
    ...[6, 12, 8, 8, 12, 10, 17, 9, 20, 18, 7].map((verses, i) => ({
      translationId: 1,
      bookNumber: 230,
      chapter: i + 1,
      verses,
    })),
    ...[6, 12, 9, 8, 12, 10, 17, 9, 39, 7].map((verses, i) => ({
      translationId: 2,
      bookNumber: 230,
      chapter: i + 1,
      verses,
    })),
  ];
  it('the same psalm numbered differently is one row, in the main translation’s numbering', () => {
    const results = [
      hit(1, 230, 11, 3),
      hit(2, 230, 10, 3),
      hit(2, 230, 9, 22),
      hit(1, 230, 10, 1),
    ];
    const placeOf = alignedPlaces(profiles, 1, results);
    const rows = groupResults(results, 1, true, placeOf);
    expect(rows.map((r) => [r.key, r.r.translationId, r.also])).toEqual([
      ['230-11-3', 1, [2]],
      ['230-10-1', 1, [2]],
    ]);
    // as given, they were four rows
    expect(groupResults(results, 1, true)).toHaveLength(4);
  });
});

describe('the review of one row across numberings (1.8.12-beta.5)', () => {
  it('two places of one translation brought to one place stay two rows', () => {
    const results = [hit(2, 230, 3, 1), hit(2, 230, 3, 2), hit(1, 230, 3, 1)];
    const placeOf = () => '230-3-1'; // a superscription and its verse 2, both «3:1» in the other numbering
    const rows = groupResults(results, 1, true, placeOf);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.also.length + 1).reduce((x, y) => x + y)).toBe(3);
    expect(groupResults([hit(2, 230, 3, 1), hit(2, 230, 3, 1)], 1, true, placeOf)).toHaveLength(1);
  });
});
