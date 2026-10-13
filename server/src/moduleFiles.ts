import fs from 'node:fs';
import {
  LIBRARY_ALL_LIMIT,
  MODULE_KINDS,
  type LibrarySelection,
  type ModuleKind,
} from '@vo/shared';

/**
 * «Модулі»: the module files the operator keeps in modules/ and which of them the library takes
 * («У бібліотеці»). The files are put there by the operator; nothing is downloaded by the app.
 */

/** The module kinds the library takes (the builder's kinds); devotions, plans, bundles are left out. */
const SUFFIX_KIND: Record<string, ModuleKind> = {
  dictionary: 'dictionaries',
  commentaries: 'commentaries',
  crossreferences: 'crossreferences',
  subheadings: 'subheadings',
};

/** The module files in modules/, by kind — the same names the builder takes (build.ts). */
export function listModuleFiles(dir: string): Record<ModuleKind, string[]> {
  const out: Record<ModuleKind, string[]> = {
    bibles: [],
    dictionaries: [],
    commentaries: [],
    crossreferences: [],
    subheadings: [],
  };
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const f of names) {
    if (!/\.sqlite3$/i.test(f)) continue;
    const m =
      /\.(dictionary|commentaries|crossreferences|subheadings|devotions|plan|bundle|referencedata)\.sqlite3$/i.exec(
        f,
      );
    if (!m) out.bibles.push(f);
    else if (SUFFIX_KIND[m[1].toLowerCase()]) out[SUFFIX_KIND[m[1].toLowerCase()]].push(f);
  }
  for (const k of MODULE_KINDS) out[k].sort((a, b) => a.localeCompare(b));
  return out;
}

export interface ModuleFilesDeps {
  /** where the builder reads modules from (MODULES_DIR, else the project's modules/) */
  modulesDir: () => string;
  /** the selection now / write it (serverSettings.ts — the builder's key, re-read first) */
  selection: () => LibrarySelection | undefined;
  setSelection: (sel: LibrarySelection) => void;
}

export function createModuleFiles(d: ModuleFilesDeps) {
  /**
   * The selection as it stands — or, with none written yet, the one the builder would seed for
   * this folder («all» for a kind of ≤ 60 files).
   */
  function selectionNow(): LibrarySelection {
    const had = d.selection();
    if (had) return had;
    const files = listModuleFiles(d.modulesDir());
    const seed = {} as LibrarySelection;
    for (const k of MODULE_KINDS) seed[k] = files[k].length <= LIBRARY_ALL_LIMIT ? null : [];
    return seed;
  }

  return {
    /** modules/ by kind, with the selection: what «У бібліотеці» shows */
    modules: () => ({
      dir: d.modulesDir(),
      files: listModuleFiles(d.modulesDir()),
      selection: d.selection() ?? null,
    }),
    /**
     * A file just put into modules/ (dropped, 1.17.1) joins the library: a kind taken «all» stays
     * so, a list of chosen files gains it.
     */
    add(kind: ModuleKind, file: string): LibrarySelection {
      const sel = selectionNow();
      const now = sel[kind];
      if (now == null || now.some((f) => f.toLowerCase() === file.toLowerCase())) return sel;
      const next = { ...sel, [kind]: [...now, file] };
      d.setSelection(next);
      return next;
    },
    /** «У бібліотеці»: which files of a kind the library takes (names that are in modules/) */
    select(kind: ModuleKind, files: string[]): LibrarySelection {
      const have = new Map(listModuleFiles(d.modulesDir())[kind].map((f) => [f.toLowerCase(), f]));
      const names = [
        ...new Set(
          files.map((f) => have.get(String(f).toLowerCase())).filter((f): f is string => !!f),
        ),
      ];
      const sel = { ...selectionNow(), [kind]: names };
      d.setSelection(sel);
      return sel;
    },
  };
}
