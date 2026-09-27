import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  LIBRARY_ALL_LIMIT,
  MODULE_KINDS,
  sanitizeLibrarySelection,
  type LibrarySelection,
  type ModuleKind,
} from '@vo/shared';

/**
 * Decide which module files go into the library, from `data/settings.json` → `library`.
 *
 * First run (no `library` key yet): seed the selection so a rebuild reproduces what the
 * user has now — from the existing library's `sources` table, or (older libraries) from
 * its translations / dictionaries / commentaries, matching cross-reference files by
 * row count — and write it back so it's visible and editable. With no library at all,
 * a small modules folder means "import everything"; a large one needs a choice.
 */

export type Candidates = Record<ModuleKind, string[]>; // absolute paths per kind

export class SelectionError extends Error {}

function readSettings(file: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { version: 1 };
  }
}

function writeSettings(file: string, value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

const base = (p: string) => path.basename(p);

/** Selection that reproduces an existing library file (or null if there is none). */
function seedFromLibrary(libraryPath: string, candidates: Candidates): LibrarySelection | null {
  if (!fs.existsSync(libraryPath)) return null;
  const db = new Database(libraryPath, { readonly: true });
  try {
    const has = (t: string) =>
      !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
    if (has('sources')) {
      const rows = db.prepare('SELECT kind, file FROM sources').all() as {
        kind: ModuleKind;
        file: string;
      }[];
      const sel: LibrarySelection = {
        bibles: [],
        dictionaries: [],
        commentaries: [],
        crossreferences: [],
      };
      for (const r of rows)
        if (MODULE_KINDS.includes(r.kind)) (sel[r.kind] as string[]).push(r.file);
      return sel;
    }
    // Libraries built before the `sources` table: reconstruct from what they contain.
    const bibles = (
      db.prepare('SELECT source_file FROM translations ORDER BY id').all() as {
        source_file: string;
      }[]
    )
      .map((r) => r.source_file)
      .filter(Boolean);
    const dictionaries = has('dictionaries')
      ? (db.prepare('SELECT abbr FROM dictionaries').all() as { abbr: string }[]).map(
          (r) => `${r.abbr}.dictionary.SQLite3`,
        )
      : [];
    const commentaries = has('commentaries')
      ? (db.prepare('SELECT DISTINCT source FROM commentaries').all() as { source: string }[]).map(
          (r) => `${r.source}.commentaries.SQLite3`,
        )
      : [];
    // Cross-references were merged without a source: find the file(s) whose row count
    // matches (exactly one file, or none) — the common single-module case.
    let crossreferences: string[] = [];
    const want = has('cross_references')
      ? (db.prepare('SELECT COUNT(*) n FROM cross_references').get() as { n: number }).n
      : 0;
    if (want > 0) {
      for (const f of candidates.crossreferences) {
        try {
          const x = new Database(f, { readonly: true });
          const n = (x.prepare('SELECT COUNT(*) n FROM cross_references').get() as { n: number }).n;
          x.close();
          if (n === want) {
            crossreferences = [base(f)];
            break;
          }
        } catch {
          /* not a crossref module */
        }
      }
    }
    return { bibles, dictionaries, commentaries, crossreferences };
  } finally {
    db.close();
  }
}

/**
 * Resolve the selection and return the files to import per kind (absolute paths),
 * seeding settings.json on first use. Throws SelectionError with guidance when a kind
 * is set to "all" but the folder holds too many files.
 */
export function selectModules(opts: {
  settingsFile: string;
  libraryPath: string;
  candidates: Candidates;
}): { files: Candidates; selection: LibrarySelection; seeded: boolean; missing: string[] } {
  const settings = readSettings(opts.settingsFile);
  let selection = sanitizeLibrarySelection(settings.library);
  let seeded = false;

  if (!selection) {
    const fromLibrary = seedFromLibrary(opts.libraryPath, opts.candidates);
    const small = (k: ModuleKind) => opts.candidates[k].length <= LIBRARY_ALL_LIMIT;
    selection = fromLibrary ?? {
      bibles: small('bibles') ? null : [],
      dictionaries: small('dictionaries') ? null : [],
      commentaries: small('commentaries') ? null : [],
      crossreferences: small('crossreferences') ? null : [],
    };
    writeSettings(opts.settingsFile, { ...settings, version: 1, library: selection });
    seeded = true;
  }

  const files = {} as Candidates;
  const missing: string[] = [];
  for (const kind of MODULE_KINDS) {
    const wanted = selection[kind];
    const available = opts.candidates[kind];
    if (wanted === null) {
      if (available.length > LIBRARY_ALL_LIMIT) {
        throw new SelectionError(
          `library.${kind} is null ("all") but the modules folder has ${available.length} such files ` +
            `(limit ${LIBRARY_ALL_LIMIT}). List the files you want in ${opts.settingsFile} → library.${kind}.`,
        );
      }
      files[kind] = available;
      continue;
    }
    const byName = new Map(available.map((p) => [base(p).toLowerCase(), p]));
    files[kind] = [];
    for (const name of wanted) {
      const hit = byName.get(name.toLowerCase());
      if (hit) files[kind].push(hit);
      else missing.push(`${kind}: ${name}`);
    }
  }
  return { files, selection, seeded, missing };
}
