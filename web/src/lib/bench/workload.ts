import type { Library } from '@vo/shared';

/**
 * The engine benchmark's workload: the same reads the app makes, run against every engine
 * through the shared Library API (the server's over HTTP). Queries were checked against
 * the full library so each returns something with the default segments (UKRK, KJV+,
 * Strong's dictionary, cross-references).
 */

/** The part of the library the benchmark drives (a local Library, or the server). */
export type BenchLibrary = Pick<
  Library,
  'getTranslations' | 'getVerses' | 'search' | 'strongRefs' | 'lookupStrong' | 'getCrossrefs'
>;

export interface BenchContext {
  /** a Ukrainian translation among the chosen segments */
  uk?: number;
  /** an English one (Strong-tagged in the default set: KJV+) */
  en?: number;
  translations: number[];
  hasDictionary: boolean;
  hasStudy: boolean;
}

export interface BenchCase {
  id: string;
  group: string;
  label: string;
  /** The query to time, or null when the chosen segments can't answer it. */
  make(lib: BenchLibrary, ctx: BenchContext): (() => Promise<unknown>) | null;
}

const READ = 'Читання';
const REF = 'Посилання';
const FTS = 'Повнотекстовий пошук';
const STRONG = 'Стронг і довідка';

const search = (q: string, pick: (c: BenchContext) => number[] | undefined) => {
  return (lib: BenchLibrary, ctx: BenchContext) => {
    const ids = pick(ctx);
    return ids?.length ? () => lib.search(q, ids) : null;
  };
};
const uk = (c: BenchContext) => (c.uk != null ? [c.uk] : undefined);
const en = (c: BenchContext) => (c.en != null ? [c.en] : undefined);

export const BENCH_CASES: BenchCase[] = [
  {
    id: 'translations',
    group: READ,
    label: 'Список перекладів',
    make: (lib) => () => lib.getTranslations(),
  },
  {
    id: 'chapter',
    group: READ,
    label: 'Розділ: Від Івана 3',
    make: (lib, c) => {
      const t = c.uk ?? c.translations[0];
      return t != null ? () => lib.getVerses(t, 500, 3) : null;
    },
  },
  { id: 'ref', group: REF, label: '«Ів 3:16»', make: search('Ів 3:16', uk) },
  { id: 'range', group: REF, label: '«1 кор 13:4-7»', make: search('1 кор 13:4-7', uk) },
  { id: 'rare', group: FTS, label: 'Рідкісне слово «никодим»', make: search('никодим', uk) },
  { id: 'word', group: FTS, label: 'Слово «любов»', make: search('любов', uk) },
  { id: 'frequent', group: FTS, label: 'Часте слово «бог»', make: search('бог', uk) },
  {
    id: 'frequent-all',
    group: FTS,
    label: '«бог» у всіх вибраних перекладах',
    make: search('бог', (c) => (c.translations.length > 1 ? c.translations : undefined)),
  },
  {
    id: 'phrase',
    group: FTS,
    label: 'Фраза «"син чоловічий"»',
    make: search('"син чоловічий"', uk),
  },
  {
    id: 'exclude',
    group: FTS,
    label: 'З виключенням «любов -бог»',
    make: search('любов -бог', uk),
  },
  { id: 'en-words', group: FTS, label: '«god loved» (англ.)', make: search('god loved', en) },
  {
    id: 'en-phrase',
    group: FTS,
    label: '«"son of man"» (англ.)',
    make: search('"son of man"', en),
  },
  {
    id: 'concordance',
    group: STRONG,
    label: 'Конкорданс G26',
    make: (lib, c) => (c.en != null ? () => lib.strongRefs('G26', { translationId: c.en }) : null),
  },
  { id: 'strong-search', group: STRONG, label: 'Пошук «H430»', make: search('H430', en) },
  {
    id: 'lexicon',
    group: STRONG,
    label: 'Словник Стронга: 26',
    make: (lib, c) => (c.hasDictionary ? () => lib.lookupStrong('26', 500) : null),
  },
  {
    id: 'crossrefs',
    group: STRONG,
    label: 'Перехресні посилання Ів 3:16',
    make: (lib, c) => (c.hasStudy ? () => lib.getCrossrefs(500, 3, 16) : null),
  },
];

/** Text search returns at most this many hits (queries.ts). */
export const RESULT_CAP = 300;

type Hit = { translationId: number; bookNumber: number; chapter: number; verse: number };
const hitKey = (r: Hit) => `${r.translationId}:${r.bookNumber}:${r.chapter}:${r.verse}`;

/**
 * What a query returned, reduced to something comparable across engines: how many
 * results, and their identities (sorted — engines may order text hits differently).
 */
export function summarize(result: unknown): { count: number; keys: string; capped: boolean } {
  const pack = (keys: string[], count = keys.length) => ({
    count,
    keys: [...keys].sort().join('|'),
    capped: keys.length >= RESULT_CAP,
  });
  if (Array.isArray(result)) {
    return pack(
      result.map((r) =>
        'verse' in r && 'bookNumber' in r
          ? hitKey(r as Hit)
          : 'verseStart' in r
            ? `${r.bookNumber}:${r.chapter}:${r.verseStart}-${r.verseEnd}`
            : String(r.abbr ?? r.topic ?? JSON.stringify(r)),
      ),
    );
  }
  const o = result as { results?: Hit[]; total?: number };
  if (o?.results) return pack(o.results.map(hitKey), o.total ?? o.results.length);
  return pack([]);
}
