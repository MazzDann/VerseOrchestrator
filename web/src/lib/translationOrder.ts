/**
 * The interface language first (1.25.0-beta.5 «Зручність», the vo-ux walk-through): the translations' groups put
 * its language at the top, and a control window with no translation ticked takes one in it — before, a search
 * with none ticked landed in the first translation of the list (a Russian one, «Иохан 3:16»).
 */

interface Lingual {
  language?: string | null;
}

/** Does a translation's language code (`uk`, `uk-UA`, `ukr`) name the interface language? */
export const inLanguage = (code: string | null | undefined, lang: string): boolean => {
  const c = (code ?? '').toLowerCase();
  return (
    c === lang ||
    c.startsWith(`${lang}-`) ||
    (lang === 'uk' && c === 'ukr') ||
    (lang === 'en' && c === 'eng')
  );
};

/** The language groups with the interface language's first, the rest as they came. */
export function languageFirst<T>(groups: [string, T][], lang: string): [string, T][] {
  return [
    ...groups.filter(([code]) => inLanguage(code, lang)),
    ...groups.filter(([code]) => !inLanguage(code, lang)),
  ];
}

/** The translation to tick when none is: the first in the interface language, else the first of all. */
export function defaultTranslation<T extends Lingual>(list: T[], lang: string): T | undefined {
  return list.find((t) => inLanguage(t.language, lang)) ?? list[0];
}
