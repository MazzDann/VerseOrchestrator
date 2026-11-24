/**
 * The archive (1.26.0-beta.2): translations and presentation bundles the operator put out of the way —
 * kept in the operator's settings (`archivedTranslations` by short name, `archivedBundles` by name), so
 * the server reads them from its copy of those settings (uiState.ts).
 */
export interface Archive {
  translations: string[];
  bundles: string[];
}
export const NO_ARCHIVE: Archive = { translations: [], bundles: [] };

const names = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x !== '').slice(0, 1000)
    : [];

/** The archive in the settings store's saved JSON; anything else has none. */
export function archiveIn(value: string | undefined): Archive {
  if (!value) return NO_ARCHIVE;
  try {
    const state = (JSON.parse(value) as { state?: Record<string, unknown> } | null)?.state;
    return {
      translations: names(state?.archivedTranslations),
      bundles: names(state?.archivedBundles),
    };
  } catch {
    return NO_ARCHIVE;
  }
}

/** `&skip=` of a query: the names asked to be left out (a JSON list); null — not said. */
export function skipAsked(raw: unknown): string[] | null {
  if (typeof raw !== 'string') return null;
  try {
    return names(JSON.parse(raw));
  } catch {
    return [];
  }
}
