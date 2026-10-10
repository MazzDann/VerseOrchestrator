import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { api, type Translation, type Verse } from '../../api';
import { type RefItem } from '../../settingsStore';

/** What «Історія» shows under a place: a line of its text, and the whole pick for the tooltip. */
export interface PlaceText {
  line: string;
  full: string;
  abbr: string;
}

/** The key a history row's text goes by: the place and its whole pick. */
export const placeTextKey = (i: RefItem) =>
  `${i.translationId}-${i.bookNumber}-${i.chapter}-${(i.verses ?? [i.verse]).join(',')}`;

/**
 * The text of each place in «Історія» (1.13.0-beta.3, users' report F1010-09: «що там було?» — the
 * numbers alone say little). From the record's own translation (its numbers are that one's — the
 * author's Q8b), through the chapter queries every other view shares (`['verses', …]`): a chapter
 * already open costs nothing. The Map keeps its identity until a chapter's data changes — the
 * list is memo'd, and a new Map on every verse step would draw its 30 rows again (vo-design).
 */
export function useHistoryTexts(
  items: readonly RefItem[],
  translations: readonly Translation[],
): Map<string, PlaceText> {
  const chapters = useMemo(() => {
    const seen = new Map<string, [number, number, number]>();
    for (const i of items) {
      const k = `${i.translationId}-${i.bookNumber}-${i.chapter}`;
      if (!seen.has(k)) seen.set(k, [i.translationId, i.bookNumber, i.chapter]);
    }
    return [...seen.values()];
  }, [items]);
  const queries = useQueries({
    queries: chapters.map(([t, b, c]) => ({
      queryKey: ['verses', t, b, c],
      queryFn: () => api.verses(t, b, c),
      staleTime: Infinity,
    })),
  });
  const stamp = queries.map((q) => q.dataUpdatedAt).join(',');
  return useMemo(() => {
    const byChapter = new Map<string, Verse[]>();
    chapters.forEach(([t, b, c], i) => {
      const data = queries[i]?.data;
      if (data) byChapter.set(`${t}-${b}-${c}`, data);
    });
    const abbr = new Map(translations.map((t) => [t.id, t.abbr]));
    const out = new Map<string, PlaceText>();
    for (const i of items) {
      const verses = byChapter.get(`${i.translationId}-${i.bookNumber}-${i.chapter}`);
      if (!verses) continue;
      const picked = i.verses ?? [i.verse];
      const texts = verses
        .filter((v) => picked.includes(v.verse))
        .map((v) => (v.text ?? '').trim())
        .filter(Boolean);
      if (texts.length === 0) continue;
      out.set(placeTextKey(i), {
        line: texts[0],
        full: texts.join(' '),
        abbr: abbr.get(i.translationId) ?? '',
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, chapters, stamp, translations]);
}
