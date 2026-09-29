import { createElement, Fragment, type ReactNode } from 'react';
import { LOCALES, translate, translatePlural, type Lang, type Vars } from '@vo/shared';
import { useSettings } from './settingsStore';

/**
 * The interface language (0.11.0, `@vo/shared` i18n): the copy stays Ukrainian in the code,
 * wrapped in `tr('…')`; English comes from `shared/src/i18n/en.ts`. `tr` reads the language
 * when it runs, so a component that shows translated text calls `useLang()` — a language
 * switch then renders it again, and every `tr` in its render reads the new language. Callbacks
 * and notifications need nothing more.
 */
export { N_, Nn_ } from '@vo/shared';

export const currentLang = (): Lang => useSettings.getState().language;

/** For toLocaleString and Intl. */
export const currentLocale = (): string => LOCALES[currentLang()];

/** Ukrainian text in the interface language, `{name}` places filled from `vars`. */
export const tr = (uk: string, vars?: Vars): string => translate(currentLang(), uk, vars);

/** A plural: `forms` = «{n} пісню|{n} пісні|{n} пісень», `{n}` is the number. */
export const trn = (n: number, forms: string, vars?: Vars): string =>
  translatePlural(currentLang(), n, forms, vars);

/**
 * `tr` with elements in the `{name}` places — «Додайте модуль {module} у папку modules/…» with
 * `{ module: <code>…</code> }`: the words around an element move with the language.
 */
export function trx(uk: string, nodes: Record<string, ReactNode>): ReactNode[] {
  return translate(currentLang(), uk)
    .split(/(\{\w+\})/)
    .map((part, i) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      return createElement(Fragment, { key: i }, name && name in nodes ? nodes[name] : part);
    });
}

/** A number the interface language's way (31 102 / 31,102). */
export const fmtNumber = (n: number, opts?: Intl.NumberFormatOptions): string =>
  n.toLocaleString(currentLocale(), opts);

/**
 * Subscribe a component to the interface language: it renders again on a switch. Call it in
 * every component that shows translated text (a `useMemo` over translated text lists the
 * language among its dependencies).
 */
export function useLang(): Lang {
  return useSettings((s) => s.language);
}
