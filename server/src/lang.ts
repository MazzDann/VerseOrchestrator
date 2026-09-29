import fs from 'node:fs';
import path from 'node:path';
import { EN } from '../../shared/src/i18n/en.ts';

/**
 * The interface language for what runs under plain Node (0.11.7): the launcher's console, the
 * waiter's «Запуск…» page, the portable build. Not `@vo/shared` — plain Node can't load the
 * package (its sources import `./x.js` the tsx way) — but the same dictionary, by a relative
 * path: en.ts imports nothing. The copy stays Ukrainian in the code, as everywhere.
 */
export type Lang = 'uk' | 'en';
type Vars = Record<string, string | number>;

let current: Lang = 'uk';
/** The console's language from now on. */
export const setLang = (lang: Lang): void => {
  current = lang;
};

const fill = (text: string, vars?: Vars): string =>
  vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;

/** Ukrainian text in `lang` (the console's language unless said), `{name}` places filled. */
export function tr(uk: string, vars?: Vars, lang: Lang = current): string {
  return fill(lang === 'en' ? (EN[uk] ?? uk) : uk, vars);
}

/** Marks a key for the dictionary where it is translated later (a progress line, an error). */
export const N_ = (uk: string): string => uk;

/** An error whose message is a dictionary key with values: shown translated wherever it lands. */
export class KeyedError extends Error {
  // plain fields: type stripping takes no parameter properties
  readonly key: string;
  readonly vars?: Vars;
  constructor(key: string, vars?: Vars) {
    super(fill(key, vars));
    this.key = key;
    this.vars = vars;
  }
}

/** `err` in `lang`: a KeyedError by its key, any other by its message (a key too, maybe). */
export const trError = (err: unknown, lang: Lang = current): string =>
  err instanceof KeyedError
    ? tr(err.key, err.vars, lang)
    : tr(String((err as Error)?.message ?? err), undefined, lang);

/** The first of our languages in language tags (uk-UA, en-US, …), or null. */
function pick(tags: string[]): Lang | null {
  for (const tag of tags) {
    const base = tag.trim().toLowerCase().split(/[-_]/)[0];
    if (base === 'uk' || base === 'en') return base;
  }
  return null;
}

/**
 * The console's language: `VO_LANG`, else the one chosen in the control window (kept in
 * data/ui-state.json), else the system's, else Ukrainian.
 */
export function consoleLang(dataDir: string): Lang {
  const env = pick([process.env.VO_LANG ?? '']);
  if (env) return env;
  try {
    const ui = JSON.parse(fs.readFileSync(path.join(dataDir, 'ui-state.json'), 'utf8'));
    const saved = JSON.parse(ui?.['vo:settings']?.value ?? 'null')?.state?.language;
    if (saved === 'uk' || saved === 'en') return saved;
  } catch {
    /* nothing saved yet */
  }
  return pick([Intl.DateTimeFormat().resolvedOptions().locale]) ?? 'uk';
}

/** A page's language from its request's Accept-Language (the waiter's «Запуск…» page). */
export function requestLang(acceptLanguage: string | undefined): Lang {
  return pick((acceptLanguage ?? '').split(',').map((part) => part.split(';')[0])) ?? 'uk';
}
