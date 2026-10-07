import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type SearchResult } from '../api';
import { alignedPlaces, groupResults, type SearchRow } from './searchGroups';

/**
 * The search's rows, one per verse (1.8.12-beta.4 / .5): grouped by place, the places brought to
 * one numbering first (Ps 22 of one translation and Ps 23 of another — the same psalm — are one
 * row; until the chapters' lengths come, places as given). The lengths are asked only for books
 * found in two translations or more — nothing else can be one row, and they read a book's index
 * whole. The control window's results and the remote's search (1.8.12-beta.9) share it.
 */
export function useSearchRows(
  results: readonly SearchResult[] | undefined,
  primaryId: number | null,
  dedupe: boolean,
): SearchRow[] {
  const wanted = useMemo(() => {
    if (!dedupe || !results) return null;
    const byBook = new Map<number, Set<number>>();
    for (const r of results) {
      if (!byBook.has(r.bookNumber)) byBook.set(r.bookNumber, new Set());
      byBook.get(r.bookNumber)!.add(r.translationId);
    }
    const books = [...byBook].filter(([, ts]) => ts.size >= 2).map(([b]) => b);
    if (books.length === 0) return null;
    const ids = new Set(books.flatMap((b) => [...byBook.get(b)!]));
    if (primaryId != null) ids.add(primaryId);
    return { ids: [...ids].sort((x, y) => x - y), books: books.sort((x, y) => x - y) };
  }, [results, dedupe, primaryId]);
  const profiles = useQuery({
    queryKey: ['profiles', wanted?.ids.join(','), wanted?.books.join(',')],
    queryFn: () => api.profiles(wanted!.ids, wanted!.books),
    enabled: !!wanted,
    staleTime: Infinity,
  });
  const placeOf = useMemo(
    () =>
      wanted && profiles.data ? alignedPlaces(profiles.data, primaryId, results ?? []) : undefined,
    [wanted, profiles.data, primaryId, results],
  );
  return useMemo(
    () => groupResults(results ?? [], primaryId, dedupe, placeOf),
    [results, primaryId, dedupe, placeOf],
  );
}
