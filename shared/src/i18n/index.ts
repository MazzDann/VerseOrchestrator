import { EN } from './en.js';

/**
 * Interface languages (0.11.0). Ukrainian is the source: the copy is written in Ukrainian where
 * it is used, and that text is the key of its English version in `EN` (the gettext way) — the
 * code stays readable in the language the app is made in, and one file holds every English
 * string. A test checks that every key in the code has its English entry.
 *
 * Placeholders are `{name}`; a plural key lists the Ukrainian forms `one|few|many`
 * («{n} пісню|{n} пісні|{n} пісень»), its English entry `one|other`.
 */
export type Lang = 'uk' | 'en';
export type Vars = Record<string, string | number>;

export const LANGS: readonly Lang[] = ['uk', 'en'];
/** Each language named in itself — the switch reads the same in either. */
export const LANG_NAMES: Record<Lang, string> = { uk: 'Українська', en: 'English' };
/** For numbers and dates. */
export const LOCALES: Record<Lang, string> = { uk: 'uk-UA', en: 'en-US' };

export const isLang = (v: unknown): v is Lang => v === 'uk' || v === 'en';

/** Put `vars` into the `{name}` places (a place without a value stays as it is). */
export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** `uk` in `lang`: its English entry (the Ukrainian itself when there is none), vars put in. */
export function translate(lang: Lang, uk: string, vars?: Vars): string {
  return fill(lang === 'en' ? (EN[uk] ?? uk) : uk, vars);
}

/** Ukrainian plural form: 1 пісня, 2–4 пісні, 5+ пісень (11–14 → пісень). */
export function ukPluralIndex(n: number): 0 | 1 | 2 {
  const d = Math.abs(n) % 10;
  const dd = Math.abs(n) % 100;
  if (d === 1 && dd !== 11) return 0;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 1;
  return 2;
}

/**
 * `forms` («{n} пісню|{n} пісні|{n} пісень») for the number `n` in `lang`; `{n}` is the number
 * written the language's way (31 102 / 31,102).
 */
export function translatePlural(lang: Lang, n: number, forms: string, vars?: Vars): string {
  const parts = (lang === 'en' ? (EN[forms] ?? forms) : forms).split('|');
  const i = lang === 'en' && EN[forms] ? (n === 1 ? 0 : 1) : ukPluralIndex(n);
  return fill(parts[Math.min(i, parts.length - 1)], {
    n: n.toLocaleString(LOCALES[lang]),
    ...vars,
  });
}

/**
 * Which of our languages a browser (or a system) prefers: the first of its languages that we
 * have; Ukrainian when none is — the app's own language.
 */
export function pickLang(preferred: readonly string[]): Lang {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLang(base)) return base;
  }
  return 'uk';
}

/**
 * Mark a string for the dictionary where it can't be translated yet — a table made when the
 * module loads; `tr(value)` translates it where it is shown.
 */
export const N_ = (uk: string): string => uk;

/** The same for plural forms («{n} пісня|{n} пісні|{n} пісень»), shown through `trn`. */
export const Nn_ = (forms: string): string => forms;
