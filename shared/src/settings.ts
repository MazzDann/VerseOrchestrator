/**
 * Which module files the builder imports into the library — part of the server options
 * file (`data/settings.json` → `library`). File names are exactly as they appear in the
 * modules folder (e.g. "UKRK.SQLite3", "Strong.dictionary.SQLite3").
 *
 * `null` means "every file of that kind". That is only allowed while the folder is
 * small (LIBRARY_ALL_LIMIT): a bulk-downloaded catalog holds thousands of modules and
 * importing all of them would produce a multi-GB library.
 */
export interface LibrarySelection {
  bibles: string[] | null;
  dictionaries: string[] | null;
  commentaries: string[] | null;
  crossreferences: string[] | null;
}

export type ModuleKind = keyof LibrarySelection;

export const MODULE_KINDS: ModuleKind[] = [
  'bibles',
  'dictionaries',
  'commentaries',
  'crossreferences',
];

/** Above this many candidate files of a kind, `null` ("all") is refused. */
export const LIBRARY_ALL_LIMIT = 60;

/** Coerce a hand-edited / API value; undefined when absent or unusable. */
export function sanitizeLibrarySelection(raw: unknown): LibrarySelection | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown): string[] | null =>
    v === null
      ? null
      : Array.isArray(v)
        ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.trim() !== ''))]
        : [];
  return {
    bibles: list(r.bibles),
    dictionaries: list(r.dictionaries),
    commentaries: list(r.commentaries),
    crossreferences: list(r.crossreferences),
  };
}
