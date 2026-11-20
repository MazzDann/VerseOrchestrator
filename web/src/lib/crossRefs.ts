import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Book } from '../api';
import type { CrossRefsShown } from '../settingsStore';

/** A chapter's cross-reference: the verse it belongs to, the place it points at. */
export interface ChapterXref {
  verse: number;
  bookNumber: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}

/**
 * The chapter's cross-references by verse (1.23.0-beta.6, the users' F1114-15) — one read per
 * chapter, none while they are off.
 */
export function useChapterCrossRefs(
  book: number | null,
  chapter: number | null,
  shown: CrossRefsShown,
): Map<number, ChapterXref[]> {
  const { data } = useQuery({
    queryKey: ['crossrefs-chapter', book, chapter],
    queryFn: () => api.chapterCrossrefs(book!, chapter!),
    enabled: book != null && chapter != null && shown !== 'off',
    staleTime: Infinity,
  });
  return useMemo(() => {
    const m = new Map<number, ChapterXref[]>();
    for (const x of data ?? []) m.set(x.verse, [...(m.get(x.verse) ?? []), x]);
    return m;
  }, [data]);
}

/** The main translation's books, for the references' short names. */
export function useBookNames(primaryId: number | null): (n: number) => string {
  const { data } = useQuery({
    queryKey: ['books', primaryId],
    queryFn: () => api.books(primaryId!),
    enabled: primaryId != null,
  });
  return useMemo(() => {
    const by = new Map((data ?? []).map((b: Book) => [b.bookNumber, b.shortName || b.longName]));
    return (n: number) => by.get(n) ?? `#${n}`;
  }, [data]);
}
