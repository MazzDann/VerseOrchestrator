import fs from 'node:fs';
import path from 'node:path';
import { readLayout } from './layout.ts';

/**
 * Other copies of the app on this computer, found by their folders (1.12.0-beta.2): what
 * «Перенести з іншої копії…» (otherCopy.ts) and the start file (launcher.ts — plain Node, hence
 * the .ts imports and nothing heavier than layout.ts) both need.
 */

export const UI_FILE = 'ui-state.json';
/** The files of a data folder that say the operator used that copy. */
export const SIGNS = [UI_FILE, 'settings.json', 'secrets.json', 'albums.json', 'videos.json'];

/** A JSON file of another copy, read as it is: never marked or retried like this copy's own. */
export function peek(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const isDir = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
export const isFile = (p: string) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** The song bundles of a data folder. */
export function bundlesIn(dataDir: string): string[] {
  try {
    return fs
      .readdirSync(path.join(dataDir, 'songs'))
      .filter((n) => n.endsWith('.vosongs') && !n.startsWith('.'));
  } catch {
    return [];
  }
}

/** A data folder holding something of the operator's: one of its files, or a song bundle. */
export function holdsData(dataDir: string): boolean {
  return (
    isDir(dataDir) &&
    (SIGNS.some((n) => isFile(path.join(dataDir, n))) ||
      bundlesIn(dataDir).length > 0 ||
      isFile(path.join(dataDir, 'images', 'index.json')))
  );
}

/** When a data folder last changed (ms): the newest of its own files and song bundles. */
export function dataChanged(dataDir: string): number | null {
  let changed: number | null = null;
  const files = [...SIGNS, ...bundlesIn(dataDir).map((b) => path.join('songs', b))];
  for (const f of files) {
    try {
      const t = fs.statSync(path.join(dataDir, f)).mtimeMs;
      if (changed === null || t > changed) changed = t;
    } catch {
      /* not there */
    }
  }
  return changed === null ? null : Math.round(changed);
}

/** An app folder: package.json of this app. */
function isAppRoot(dir: string): boolean {
  const pkg = peek(path.join(dir, 'package.json')) as { name?: unknown } | null;
  return pkg?.name === 'verse-orchestrator';
}

const dataOf = (root: string) => readLayout(root)?.data ?? path.join(root, 'data');

/** Two paths name one folder (case-insensitive where the system is). */
export function sameFolder(a: string, b: string, platform = process.platform): boolean {
  const norm = (s: string) => {
    const r = path.resolve(s);
    return platform === 'linux' ? r : r.toLowerCase();
  };
  return norm(a) === norm(b);
}

export interface FoundCopy {
  /** the app folder (package.json), null when only a data folder was named */
  root: string | null;
  dataDir: string;
}

/**
 * A folder the operator names, as a copy: the release folder (around app/), its app/, a clone, or
 * a data folder itself. Null: no data of this app there.
 */
export function resolveCopy(folder: string): FoundCopy | null {
  const dir = path.resolve(folder);
  for (const root of [path.join(dir, 'app'), dir]) {
    if (isAppRoot(root)) {
      const dataDir = dataOf(root);
      return holdsData(dataDir) ? { root, dataDir } : null;
    }
  }
  if (!holdsData(dir)) return null;
  // a data folder: its copy's app beside it, when there is one
  const top = path.dirname(dir);
  for (const root of [path.join(top, 'app'), top])
    if (isAppRoot(root) && sameFolder(dataOf(root), dir)) return { root, dataDir: dir };
  return { root: null, dataDir: dir };
}

/** The copy's folder shown to the operator: the release folder around app/, or the clone. */
export const copyFolderOf = (c: FoundCopy) =>
  c.root ? (readLayout(c.root) ? path.dirname(c.root) : c.root) : c.dataDir;

/** A copy's own folders: never a copy themselves. */
const SKIP = new Set(['app', 'data', 'modules', 'node_modules', 'app.previous', 'app.next']);

/**
 * The copies beside this one (`root` — its app folder): the siblings of its folder, and one
 * level down for a nested «Extract All». Never this copy's own data.
 */
export function siblingCopies(root: string, dataDir: string, limit = 200): FoundCopy[] {
  const top = readLayout(root) ? path.dirname(root) : root;
  const parent = path.dirname(top);
  const dirs: string[] = [];
  let names: string[] = [];
  try {
    names = fs.readdirSync(parent);
  } catch {
    return [];
  }
  for (const name of names.slice(0, limit)) {
    const dir = path.join(parent, name);
    if (name.startsWith('.') || SKIP.has(name) || !isDir(dir)) continue;
    dirs.push(dir);
    try {
      for (const sub of fs.readdirSync(dir).slice(0, 10))
        if (!sub.startsWith('.') && !SKIP.has(sub) && isDir(path.join(dir, sub)))
          dirs.push(path.join(dir, sub));
    } catch {
      /* a folder the system won't open */
    }
  }
  const found: FoundCopy[] = [];
  for (const dir of dirs) {
    const c = resolveCopy(dir);
    if (
      c &&
      !sameFolder(c.dataDir, dataDir) &&
      !found.some((f) => sameFolder(f.dataDir, c.dataDir))
    )
      found.push(c);
  }
  return found;
}
