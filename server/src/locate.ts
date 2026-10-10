import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Where a dropped folder or video is on this computer (1.14.0-beta.1, the author's Q14: «знайти на
 * диску»). A browser gives a dropped folder's name and its files (name, size), never its path, and
 * an album or a video is read where it lies — so the places people keep photos and videos are
 * searched, a few levels deep, within a time limit (the hub shares the thread: async fs only).
 * A match must have every file asked about at its size; none or several → the folder picker.
 */

/** A file the browser saw in the dropped folder (or the dropped file itself). */
export interface SeenFile {
  name: string;
  size: number;
}

const SKIP = /^(\$|\.|node_modules$|AppData$|Library$|System Volume Information$|lost\+found$)/i;
const DEPTH = 4;
export const LOCATE_MS = 2000;

/** The usual places, the ones that are there: home's Pictures, Desktop, Downloads, Documents, … */
export function usualRoots(home = os.homedir(), extra: string[] = []): string[] {
  const names = ['Pictures', 'Desktop', 'Downloads', 'Documents', 'Videos', 'Movies'];
  const one = path.join(home, 'OneDrive');
  return [
    ...new Set([
      ...extra,
      ...names.map((n) => path.join(home, n)),
      ...names.map((n) => path.join(one, n)),
      one,
      home,
    ]),
  ];
}

const same = (a: string, b: string) => {
  const n = (s: string) => s.normalize('NFC');
  return process.platform === 'linux' ? n(a) === n(b) : n(a).toLowerCase() === n(b).toLowerCase();
};

async function sizesMatch(dir: string, files: readonly SeenFile[]): Promise<boolean> {
  for (const f of files) {
    try {
      const st = await fsp.stat(path.join(dir, f.name));
      if (!st.isFile() || st.size !== f.size) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** What a search found, and whether it looked everywhere it meant to (the time ran out first). */
export interface Located {
  found: string[];
  complete: boolean;
}

/** One key per folder on disk: its real path (a redirected Documents is OneDrive's), cased by the system. */
async function keyOf(dir: string): Promise<string> {
  let real = path.resolve(dir);
  try {
    real = await fsp.realpath(dir);
  } catch {
    /* gone: its own path */
  }
  return process.platform === 'linux' ? real : real.toLowerCase();
}

/**
 * Walk `roots` breadth first, at most `DEPTH` levels, until `deadline`: `pick(dir, entries)` names
 * what in a folder answers. Each folder once (roots overlap: home holds Pictures; a known folder
 * may be redirected — review), each match once.
 */
async function walk(
  roots: readonly string[],
  deadline: number,
  pick: (dir: string, names: string[], folders: string[]) => Promise<string[]>,
): Promise<Located> {
  const found = new Map<string, string>();
  const seen = new Set<string>();
  const result = (complete: boolean) => ({ found: [...found.values()], complete });
  let level = [...roots];
  for (let depth = 0; depth <= DEPTH && level.length > 0; depth++) {
    const next: string[] = [];
    for (const dir of level) {
      if (Date.now() > deadline) return result(false);
      const key = await keyOf(dir);
      if (seen.has(key)) continue;
      seen.add(key);
      let entries;
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      const folders = entries
        .filter((e) => e.isDirectory() && !SKIP.test(e.name))
        .map((e) => e.name);
      const files = entries.filter((e) => e.isFile()).map((e) => e.name);
      for (const p of await pick(dir, files, folders)) {
        const k = await keyOf(p);
        if (!found.has(k)) found.set(k, p);
      }
      next.push(...folders.map((f) => path.join(dir, f)));
    }
    level = next;
  }
  return result(true);
}

/** Folders named `name` holding `files` at their sizes (at most 20 checked). */
export async function locateFolder(
  name: string,
  files: readonly SeenFile[],
  roots: readonly string[],
  ms = LOCATE_MS,
): Promise<Located> {
  const sample = files.slice(0, 20);
  return walk(roots, Date.now() + ms, async (dir, _files, folders) => {
    const out: string[] = [];
    for (const f of folders) {
      if (!same(f, name)) continue;
      const p = path.join(dir, f);
      if (await sizesMatch(p, sample)) out.push(p);
    }
    return out;
  });
}

/** Files named `file.name` of `file.size` bytes. */
export async function locateFile(
  file: SeenFile,
  roots: readonly string[],
  ms = LOCATE_MS,
): Promise<Located> {
  return walk(roots, Date.now() + ms, async (dir, files) => {
    const out: string[] = [];
    for (const f of files) {
      if (!same(f, file.name)) continue;
      const p = path.join(dir, f);
      try {
        if ((await fsp.stat(p)).size === file.size) out.push(p);
      } catch {
        /* gone meanwhile */
      }
    }
    return out;
  });
}

/** What a request asked about, checked: a name and up to 500 files with sizes. */
export function seenFiles(raw: unknown): SeenFile[] | null {
  if (!Array.isArray(raw)) return null;
  const out: SeenFile[] = [];
  for (const f of raw.slice(0, 500)) {
    const name = (f as SeenFile | null)?.name;
    const size = (f as SeenFile | null)?.size;
    if (typeof name !== 'string' || !name || /[\\/]/.test(name) || name.length > 255) return null;
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) return null;
    out.push({ name, size });
  }
  return out;
}
