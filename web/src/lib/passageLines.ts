import { type QueryClient } from '@tanstack/react-query';
import { KNOWN_RENUMBERED, mapSelection, profilesOf, versificationMap } from '@vo/shared';
import { api, type Translation, type Verse } from '../api';
import { type SlideLine } from '../presenterBus';
import { joinVerses, redLetterSegments } from '../pages/control/slideText';
import { formatVerseListDisplay } from './reference';

export type ProfileRow = {
  translationId: number;
  bookNumber: number;
  chapter: number;
  verses: number;
};

/**
 * The chapter lengths of `ids` in `book` — one cache for the search's rows (useSearchRows), the
 * translation switch (1.12.6) and the slides' alignment (1.13.0-beta.2).
 */
export const profilesQuery = (ids: readonly number[], book: number) => {
  const sorted = [...new Set(ids)].sort((x, y) => x - y);
  return {
    queryKey: ['profiles', sorted.join(','), String(book)],
    queryFn: () => api.profiles(sorted, [book]),
    staleTime: Infinity,
  } as const;
};

/** How a translation's places sit in the main one's numbering: `map` (main → it), `approx`. */
export interface Alignment {
  map: (chapter: number, verse: number) => [number, number] | null;
  /** moved where no classic tradition moves them — a module's own quirk: marked «≈» */
  approx: boolean;
}

/**
 * Each translation's alignment to the main one in `book` (1.13.0-beta.2, users' report F1010-07:
 * Гижа's Пс 15 beside Огієнко's Пс 15 was another psalm) — `null` where the numbering is the
 * same, or nothing to go by (the line keeps the main one's numbers, as before).
 */
export function alignmentsOf(
  rows: readonly ProfileRow[],
  mainId: number,
  ids: readonly number[],
  book: number,
): Map<number, Alignment | null> {
  const prof = profilesOf(rows);
  const main = prof.get(`${mainId}-${book}`);
  const out = new Map<number, Alignment | null>();
  for (const id of ids) {
    const own = prof.get(`${id}-${book}`);
    if (id === mainId || !main || !own) {
      out.set(id, null);
      continue;
    }
    // the main translation's places in this one's numbering
    const map = versificationMap(own, main, book);
    const moves = main.some(([c, n]) => {
      for (let v = 1; v <= n; v++) {
        const at = map(c, v);
        if (!at || at[0] !== c || at[1] !== v) return true;
      }
      return false;
    });
    out.set(id, moves ? { map, approx: !KNOWN_RENUMBERED.has(book) } : null);
  }
  return out;
}

/** The chapters of a translation that hold the main chapter's verses (Гижа 114 + 115 for Огієнко 116). */
export function chaptersFor(a: Alignment | null, chapter: number, count: number): number[] {
  if (!a || count < 1) return [chapter];
  const set = new Set<number>();
  for (let v = 1; v <= count; v++) {
    const at = a.map(chapter, v);
    if (at) set.add(at[0]);
  }
  return set.size > 0 ? [...set].sort((x, y) => x - y) : [chapter];
}

/**
 * One translation's line of a passage of the main one (`chapter`, `picked` in its numbering):
 * aligned, its own verse numbers in the text, its own place beside its abbreviation where it
 * differs (the author: «на екрані і в прев'ю, лише коли різні»). Pieces carry the main verse they
 * stand for (`TextSpan.v`), so a grown pick finds them. `verses`: the translation's verses of the
 * chapters `chaptersFor` names.
 */
export function alignedLine(
  t: Pick<Translation, 'abbr' | 'rtl'> | undefined,
  verses: readonly Verse[],
  chapter: number,
  picked: readonly number[],
  a: Alignment | null,
  num: boolean,
): SlideLine | null {
  const base = { translationAbbr: t?.abbr ?? '', rtl: !!t?.rtl };
  if (!a) {
    const own = verses.filter((v) => v.chapter === chapter);
    const text = joinVerses(own, [...picked], num);
    if (!text.trim()) return null;
    return { ...base, text, segments: redLetterSegments(own, [...picked], num) };
  }
  const places = mapSelection(a.map, chapter, picked);
  const of = new Map(places.map((p) => [`${p.chapter}:${p.verse}`, p.of]));
  const chosen = verses
    .filter((v) => of.has(`${v.chapter}:${v.verse}`))
    .sort((x, y) => x.chapter - y.chapter || x.verse - y.verse);
  const nums = chosen.map((v) => v.verse);
  const text = joinVerses(chosen, nums, num);
  if (!text.trim()) return null;
  const segments = redLetterSegments(chosen, nums, num, (v) => of.get(`${v.chapter}:${v.verse}`));
  const same = places.every((p) => p.chapter === chapter && p.verse === p.of);
  return {
    ...base,
    text,
    segments,
    ...(same ? {} : { ownRef: ownPlace(places), ...(a.approx ? { approx: true } : {}) }),
  };
}

/** «14:1–2», or «114:8–9; 115:1–2» across a chapter's edge. */
export function ownPlace(places: readonly { chapter: number; verse: number }[]): string {
  const by = new Map<number, number[]>();
  for (const p of places) by.set(p.chapter, [...(by.get(p.chapter) ?? []), p.verse]);
  return [...by].map(([c, vs]) => `${c}:${formatVerseListDisplay(vs)}`).join('; ');
}

/**
 * The lines of a passage built away from the open chapter (the running order, a remote's pick,
 * the desk): the same alignment, from the library through the query cache. `total`: the main
 * chapter's last verse («вірш 16 з 36» on «Сцена»).
 */
export async function passageLines(
  queryClient: QueryClient,
  translations: readonly Translation[],
  ids: readonly number[],
  book: number,
  chapter: number,
  picked: readonly number[],
  num: boolean,
): Promise<{ lines: SlideLine[]; total?: number }> {
  const mainId = ids[0];
  let aligns = new Map<number, Alignment | null>();
  let count = 0;
  if (ids.length > 1) {
    try {
      const rows = await queryClient.fetchQuery(profilesQuery(ids, book));
      aligns = alignmentsOf(rows, mainId, ids, book);
      count = rows.find((r) => r.translationId === mainId && r.chapter === chapter)?.verses ?? 0;
    } catch {
      /* nothing to align by: each line as numbered */
    }
  }
  const lines: SlideLine[] = [];
  let total: number | undefined;
  for (const id of ids) {
    try {
      const a = aligns.get(id) ?? null;
      const chapters = chaptersFor(a, chapter, count);
      const verses = (
        await Promise.all(
          chapters.map((c) =>
            queryClient.fetchQuery({
              queryKey: ['verses', id, book, c],
              queryFn: () => api.verses(id, book, c),
            }),
          ),
        )
      ).flat();
      if (id === mainId) {
        const own = verses.filter((v) => v.chapter === chapter);
        total = own.length > 0 ? own[own.length - 1].verse : undefined;
      }
      const line = alignedLine(
        translations.find((x) => x.id === id),
        verses,
        chapter,
        picked,
        a,
        num,
      );
      if (line) lines.push(line);
    } catch {
      /* skip a translation that fails to load */
    }
  }
  return { lines, total };
}
