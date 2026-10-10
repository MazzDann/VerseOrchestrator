import { profilesOf, versificationMap } from '@vo/shared';
import type { SearchResult } from '../api';

/**
 * Search without repeats (1.8.12-beta.4, the author's call): a word searched in several
 * translations finds the same verse in each — one row per place (book · chapter · verse), its text
 * from the main translation when that one has it, the others named beside it. Places numbered
 * differently in other translations (the Psalms, Malachi, Joel…) are brought to one numbering
 * first (1.8.12-beta.5, `alignedPlaces`).
 */
export interface SearchRow {
  key: string;
  /** what is shown and picked: the main translation's verse when it has one */
  r: SearchResult;
  /** the other translations that have it there */
  also: number[];
}

/** A result's place as given: book · chapter · verse. */
export const exactPlace = (r: SearchResult) => `${r.bookNumber}-${r.chapter}-${r.verse}`;

export function groupResults(
  results: readonly SearchResult[],
  primaryId: number | null,
  dedupe: boolean,
  placeOf: (r: SearchResult) => string = exactPlace,
): SearchRow[] {
  if (!dedupe)
    return results.map((r) => ({ key: `${r.translationId}-${exactPlace(r)}`, r, also: [] }));
  const rows = new Map<string, SearchRow>();
  /** the place each translation already has in a row: a second one of its own is not the same verse */
  const seen = new Map<string, Map<number, string>>();
  for (const r of results) {
    let key = placeOf(r);
    const own = seen.get(key)?.get(r.translationId);
    // two places of one translation brought to one (a psalm's superscription and its verse 2, an
    // end clamped): both stay, each its own row (review); the very same hit twice is one
    if (own !== undefined) {
      if (own === exactPlace(r)) continue;
      key = `${r.translationId}-${exactPlace(r)}`;
    }
    if (!seen.has(key)) seen.set(key, new Map());
    seen.get(key)!.set(r.translationId, exactPlace(r));
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

/**
 * The translations with `id` leading (1.13.0-beta.2, F1010-08: the words found open where they
 * are): it moves to the front, the others keep their order, and the last gives way past `max`.
 * The control window (Ctrl+Enter on a hit), the desk and the remote.
 */
export function leadWith(ids: readonly number[], id: number, max = 5): number[] {
  return [id, ...ids.filter((x) => x !== id)].slice(0, max);
}

/**
 * Places in one numbering per book (1.8.12-beta.5, shared versification.ts): the main
 * translation's when it has the book, else the numbering of the first hit there. `profiles` are
 * the chapter lengths of the translations and books found (`api.profiles`). A place that has no
 * counterpart (an addition) keeps its own key.
 */
export function alignedPlaces(
  profiles: readonly {
    translationId: number;
    bookNumber: number;
    chapter: number;
    verses: number;
  }[],
  primaryId: number | null,
  results: readonly SearchResult[],
): (r: SearchResult) => string {
  const prof = profilesOf(profiles);
  const refOf = new Map<number, number>();
  for (const r of results)
    if (!refOf.has(r.bookNumber))
      refOf.set(
        r.bookNumber,
        primaryId != null && prof.has(`${primaryId}-${r.bookNumber}`) ? primaryId : r.translationId,
      );
  const maps = new Map<string, ReturnType<typeof versificationMap> | null>();
  return (r) => {
    const ref = refOf.get(r.bookNumber);
    if (ref == null || ref === r.translationId) return exactPlace(r);
    const key = `${r.translationId}-${r.bookNumber}`;
    if (!maps.has(key)) {
      const a = prof.get(`${ref}-${r.bookNumber}`);
      const b = prof.get(key);
      maps.set(key, a && b ? versificationMap(a, b, r.bookNumber) : null);
    }
    const map = maps.get(key);
    if (!map) return exactPlace(r);
    const to = map(r.chapter, r.verse);
    return to ? `${r.bookNumber}-${to[0]}-${to[1]}` : `${r.translationId}:${exactPlace(r)}`;
  };
}
