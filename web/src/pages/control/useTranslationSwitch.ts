import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { remapPlace } from '../../lib/remapPlace';
import { useStore } from '../../store';

const same = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** The chapter lengths of `ids` in `book` — the search's key (useSearchRows): one cache. */
const lengths = (queryClient: QueryClient, ids: readonly number[], book: number) => {
  const sorted = [...new Set(ids)].sort((x, y) => x - y);
  return {
    queryKey: ['profiles', sorted.join(','), String(book)],
    queryFn: () => api.profiles(sorted, [book]),
    staleTime: Infinity,
  } as const;
};

/**
 * The operator changes the translations (1.12.6, users' report F1010-10: the picked verses and
 * the place went with every change of the main one). A new main translation takes the same place
 * in its own numbering (remapPlace) — or the place goes when it hasn't the book (Q7) — in ONE
 * change with the ticks, so a window «Наживо» never shows the old numbers in the new translation
 * (UKRK 22:2 is UBIO'62 22:3). The ticked translations' lengths for the open book are asked ahead
 * (a new main one is almost always one of them: «Зробити головним», the main one unticked); else
 * the change waits for them. Jumps that set translations and a place together (search, history,
 * the running order) keep the store's `setTranslations`.
 */
export function useTranslationSwitch(): (ids: number[]) => void {
  const queryClient = useQueryClient();
  const ticked = useStore((s) => s.selectedTranslationIds);
  const book = useStore((s) => s.bookNumber);
  const turn = useRef(0);
  useEffect(() => {
    if (ticked.length >= 2 && book != null)
      void queryClient.prefetchQuery(lengths(queryClient, ticked, book));
  }, [queryClient, ticked, book]);

  return useCallback(
    (ids: number[]) => {
      const s = useStore.getState();
      const from = s.selectedTranslationIds[0] ?? null;
      const to = ids[0] ?? null;
      const mine = ++turn.current;
      const { bookNumber, chapter } = s;
      if (from === to || from == null || to == null || bookNumber == null || chapter == null) {
        useStore.setState({ selectedTranslationIds: ids });
        return;
      }
      const ask = lengths(
        queryClient,
        s.selectedTranslationIds.includes(to) ? s.selectedTranslationIds : [from, to],
        bookNumber,
      );
      const apply = (rows: Parameters<typeof remapPlace>[0] | null) => {
        const now = useStore.getState();
        // a newer change, or a jump that set translations itself, meanwhile: theirs
        if (mine !== turn.current || !same(now.selectedTranslationIds, s.selectedTranslationIds))
          return;
        const place =
          now.bookNumber === bookNumber && now.chapter != null && rows
            ? remapPlace(rows, from, to, {
                bookNumber,
                chapter: now.chapter,
                verses: now.selectedVerses,
              })
            : null;
        if (place === 'no-book')
          useStore.setState({
            selectedTranslationIds: ids,
            bookNumber: null,
            chapter: null,
            selectedVerses: [],
          });
        else if (place)
          useStore.setState({
            selectedTranslationIds: ids,
            chapter: place.chapter,
            selectedVerses: place.verses,
          });
        // no lengths to go by: the ticks change, the place stays
        else useStore.setState({ selectedTranslationIds: ids });
      };
      const cached = queryClient.getQueryData<Parameters<typeof remapPlace>[0]>(ask.queryKey);
      if (cached) return apply(cached);
      void queryClient.fetchQuery(ask).then(apply, () => apply(null));
    },
    [queryClient],
  );
}
