import { useMemo } from 'react';
import { LOCALES, translate, translatePlural, type Lang, type Vars } from '@vo/shared';
import { useSettings } from './settingsStore';

/**
 * The interface language (0.11.0, `@vo/shared` i18n): the copy stays Ukrainian in the code,
 * wrapped in `tr('…')`; English comes from `shared/src/i18n/en.ts`. Components take `tr` from
 * `useTr()`, so a language switch renders them again; code outside React (callbacks,
 * notifications) calls the module-level `tr`, which reads the language when it runs.
 */
export { N_ } from '@vo/shared';

export const currentLang = (): Lang => useSettings.getState().language;

/** Ukrainian text in the interface language, `{name}` places filled from `vars`. */
export const tr = (uk: string, vars?: Vars): string => translate(currentLang(), uk, vars);

/** A plural: `forms` = «{n} пісню|{n} пісні|{n} пісень», `{n}` is the number. */
export const trn = (n: number, forms: string, vars?: Vars): string =>
  translatePlural(currentLang(), n, forms, vars);

/** A number the interface language's way (31 102 / 31,102). */
export const fmtNumber = (n: number): string => n.toLocaleString(LOCALES[currentLang()]);

export interface Translator {
  lang: Lang;
  /** for toLocaleString and Intl */
  locale: string;
  tr: (uk: string, vars?: Vars) => string;
  trn: (n: number, forms: string, vars?: Vars) => string;
}

/** `tr` / `trn` for a component: it renders again when the language changes. */
export function useTr(): Translator {
  const lang = useSettings((s) => s.language);
  return useMemo(
    () => ({
      lang,
      locale: LOCALES[lang],
      tr: (uk: string, vars?: Vars) => translate(lang, uk, vars),
      trn: (n: number, forms: string, vars?: Vars) => translatePlural(lang, n, forms, vars),
    }),
    [lang],
  );
}
