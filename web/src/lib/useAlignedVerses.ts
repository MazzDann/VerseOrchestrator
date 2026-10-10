import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api, type Verse } from '../api';
import { type Alignment, alignmentsOf, chaptersFor, profilesQuery } from './passageLines';

/**
 * The open chapter in every chosen translation, each in its own numbering (1.13.0-beta.2, users'
 * report F1010-07: Гижа's Пс 15 beside Огієнко's was another psalm): the chapter lengths align
 * each translation to the first (main) one, and each loads the chapter(s) that hold the main
 * chapter's verses (Гижа 114 + 115 for Огієнко 116). `ready`: the lengths are in (or failed —
 * then the lines keep the main one's numbers, as before), so «Наживо» never shows an unaligned
 * line first. The control window and the desk.
 */
export function useAlignedVerses(ids: number[], book: number | null, chapter: number | null) {
  const mainId = ids[0] ?? null;
  const profiles = useQuery({
    ...profilesQuery(ids, book ?? 0),
    enabled: ids.length > 1 && book != null,
  });
  const lengthsIn = ids.length < 2 || !profiles.isPending || profiles.isError;
  const alignments = useMemo(
    () =>
      profiles.data && mainId != null && book != null
        ? alignmentsOf(profiles.data, mainId, ids, book)
        : new Map<number, Alignment | null>(),
    [profiles.data, mainId, ids, book],
  );
  /** the main chapter's verse count — the reach of its places in the others */
  const mainCount =
    profiles.data?.find((r) => r.translationId === mainId && r.chapter === chapter)?.verses ?? 0;
  /** (translation, chapter) pairs to load: the main one first */
  const keys = useMemo(
    () =>
      chapter == null
        ? []
        : ids.flatMap((id) =>
            chaptersFor(alignments.get(id) ?? null, chapter, mainCount).map(
              (ch) => [id, ch] as const,
            ),
          ),
    [ids, alignments, chapter, mainCount],
  );
  const queries = useQueries({
    queries: keys.map(([id, ch]) => ({
      queryKey: ['verses', id, book, ch],
      queryFn: () => api.verses(id, book!, ch),
      enabled: book != null && chapter != null,
    })),
  });
  // by the data's own times: useQueries gives a new array every render (review)
  const stamp = queries.map((q) => q.dataUpdatedAt).join(',');
  const versesById = useMemo(() => {
    const map = new Map<number, Verse[]>();
    for (const id of ids) map.set(id, []);
    keys.forEach(([id], i) => map.get(id)?.push(...(queries[i]?.data ?? [])));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, keys, stamp]);
  // every translation's chapters in too: a line half-loaded (Гижа 114 without 115) or missing must
  // not reach the screen first (review); a failed one counts as done
  const ready = lengthsIn && queries.every((q) => !q.isPending);
  return { versesById, alignments, ready, queries };
}
