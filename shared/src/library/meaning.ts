import { normalizeForSearch } from '../normalize.js';

/**
 * How «~ …» ranks what the vectors find (1.16.0-beta.4, the author's report «~павло повертається
 * з афін» → Hosea 11:11 first, and his ask: the query's language first, a grade of closeness).
 * Measured on his library (the «Швидка» model, six translations «Один на мову», 30 queries):
 * hit@1 9 → 14, hit@10 16 → 22, MRR@10 0.37 → 0.59; lowercase names 2 → 7 of 10.
 *
 * - The model reads letters' case: «павло» is no name to it (it found peahens and birds), «Павло»
 *   is. The query is asked as typed and with its words capitalized, the two vectors averaged.
 * - Translations in the query's language answer first; a word of the query (its stem) found in a
 *   verse adds to the verse's closeness, by how rare the word is — names are rare.
 * - A place far below the best is left out: hits sat 0.06 below the best (median), others 0.17.
 */

/** «павло повертається з афін» → «Павло Повертається З Афін». */
export function capitalizeWords(text: string): string {
  return text.replace(
    /(^|[\s«"„(-])(\p{Ll})/gu,
    (_, before: string, c: string) => before + c.toUpperCase(),
  );
}

/** Two query vectors as one: their average, normalized again (int8, ×127). */
export function blendVectors(a: Int8Array, b: Int8Array): Int8Array {
  const sum = Array.from(a, (x, i) => x + b[i]);
  const norm = Math.hypot(...sum) || 1;
  return Int8Array.from(sum, (x) => Math.round((x / norm) * 127));
}

const SCRIPTS: [RegExp, string[]][] = [
  [/\p{Script=Cyrillic}/u, ['uk', 'ru', 'be', 'bg', 'sr', 'mk', 'kk', 'ky', 'tg', 'mn']],
  [/\p{Script=Greek}/u, ['el', 'grc', 'gr']],
  [/\p{Script=Hebrew}/u, ['he', 'iw', 'hbo']],
  [/\p{Script=Arabic}/u, ['ar', 'fa', 'ur']],
];
const NOT_LATIN = new Set(SCRIPTS.flatMap(([, langs]) => langs));

/**
 * Is a translation (its language code) in the query's language? By the letters: Ukrainian ones
 * (і ї є ґ) or Russian ones (ы э ъ ё) pick that language, other Cyrillic either; Greek, Hebrew and
 * Arabic their own; Latin letters any language written in them. Other scripts: none.
 */
export function inQueryLanguage(query: string): (language: string) => boolean {
  const base = (l: string) => l.toLowerCase().split(/[-_ ]/)[0];
  if (/[іїєґ]/iu.test(query)) return (l) => base(l) === 'uk'; // i18n-ignore: letters
  if (/[ыэъё]/iu.test(query)) return (l) => base(l) === 'ru'; // i18n-ignore: letters
  for (const [re, langs] of SCRIPTS) if (re.test(query)) return (l) => langs.includes(base(l));
  if (/\p{Script=Latin}/u.test(query)) return (l) => !!base(l) && !NOT_LATIN.has(base(l));
  return () => false;
}

/** How long a stem is: «Павло», «Павла», «Павлові» share «павло»…«павл»; names keep theirs. */
const STEM = 5;

/** The query's words as the full-text index has them, cut to stems: 3 letters or more. */
export function meaningStems(query: string): string[] {
  const words = normalizeForSearch(query)
    .split(' ')
    .filter((w) => w.length >= 3 && /^[\p{L}\p{N}]+$/u.test(w));
  return [...new Set(words.map((w) => w.slice(0, STEM)))];
}

/**
 * The words' share in a verse's closeness and how far below the best a place still shows — for a
 * model with no ranking of its own (each has: EMBED_MODELS `ranking`, 1.16.0-beta.5).
 */
export const DEFAULT_RANKING = { wordsWeight: 0.25, cut: 0.2 };
/** At least this many places, however far (a vague query still answers). */
export const MEANING_MIN = 10;

/**
 * 3 — as close as the best, 2 — close, 1 — related: by the distance from the best, in parts of the
 * model's cut (a quarter, three fifths — 0.05 and 0.12 of the «Швидка» cut 0.2).
 */
export function closenessOf(gap: number, cut = DEFAULT_RANKING.cut): 1 | 2 | 3 {
  return gap <= cut * 0.25 ? 3 : gap <= cut * 0.6 ? 2 : 1;
}
