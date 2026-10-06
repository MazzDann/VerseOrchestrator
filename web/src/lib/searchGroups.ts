import type { SearchResult } from '../api';

/**
 * Search without repeats (1.8.12-beta.4, the author's call): a word searched in several
 * translations finds the same verse in each — one row per place (book · chapter · verse), its text
 * from the main translation when that one has it, the others named beside it. Places that are
 * numbered differently in other translations (Psalms, Malachi…) are beta.5's.
 */
export interface SearchRow {
  key: string;
  /** what is shown and picked: the main translation's verse when it has one */
  r: SearchResult;
  /** the other translations that have it there */
  also: number[];
}

const placeOf = (r: SearchResult) => `${r.bookNumber}-${r.chapter}-${r.verse}`;

export function groupResults(
  results: readonly SearchResult[],
  primaryId: number | null,
  dedupe: boolean,
): SearchRow[] {
  if (!dedupe)
    return results.map((r) => ({ key: `${r.translationId}-${placeOf(r)}`, r, also: [] }));
  const rows = new Map<string, SearchRow>();
  for (const r of results) {
    const key = placeOf(r);
    const row = rows.get(key);
    if (!row) rows.set(key, { key, r, also: [] });
    else if (r.translationId === primaryId && row.r.translationId !== primaryId) {
      row.also.unshift(row.r.translationId);
      row.r = r;
    } else if (r.translationId !== row.r.translationId && !row.also.includes(r.translationId))
      row.also.push(r.translationId);
  }
  return [...rows.values()];
}
