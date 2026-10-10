import fsp from 'node:fs/promises';
import path from 'node:path';
import { LAYOUT_MARKER } from './layout.ts';

/**
 * Other copies of the app on this computer, found by their folders (1.12.0-beta.2): what
 * «Перенести з іншої копії…» (otherCopy.ts) and the start file (launcher.ts — plain Node, hence
 * the .ts imports and nothing heavier than layout.ts) both need. All of it asynchronous: the
 * server's hub — phones, remotes, the output windows — shares the thread, and a folder on a
 * sleeping share must not stop it (review of 1.12.0-beta.2).
 */

export const UI_FILE = 'ui-state.json';
/** The files of a data folder that say the operator used that copy. */
export const SIGNS = [UI_FILE, 'settings.json', 'secrets.json', 'albums.json', 'videos.json'];
/** A JSON file of another copy larger than this is not one of its own. */
const PEEK_MAX = 8 * 1024 * 1024;

/** A JSON file of another copy, read as it is: never marked or retried like this copy's own. */
export async function peek(file: string): Promise<unknown> {
  try {
    const st = await fsp.stat(file);
    if (!st.isFile() || st.size > PEEK_MAX) return null;
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

const isDir = (p: string) =>
  fsp.stat(p).then(
    (s) => s.isDirectory(),
    () => false,
  );
export const isFile = (p: string) =>
  fsp.stat(p).then(
    (s) => s.isFile(),
    () => false,
  );

/** The song bundles of a data folder. */
export async function bundlesIn(dataDir: string): Promise<string[]> {
  try {
    return (await fsp.readdir(path.join(dataDir, 'songs'))).filter(
      (n) => n.endsWith('.vosongs') && !n.startsWith('.'),
    );
  } catch {
    return [];
  }
}

/** A data folder holding something of the operator's: one of its files, or a song bundle. */
export async function holdsData(dataDir: string): Promise<boolean> {
  if (!(await isDir(dataDir))) return false;
  const files = await Promise.all(SIGNS.map((n) => isFile(path.join(dataDir, n))));
  return (
    files.some(Boolean) ||
    (await bundlesIn(dataDir)).length > 0 ||
    (await isFile(path.join(dataDir, 'images', 'index.json')))
  );
}

/**
 * The operator's own content — songs, pictures or a look —, not just a settings file every start
 * writes: what makes a copy worth naming to someone starting a fresh one (the start file's hint).
 */
export async function holdsContent(dataDir: string): Promise<boolean> {
  if ((await bundlesIn(dataDir)).length > 0) return true;
  if (await isFile(path.join(dataDir, 'images', 'index.json'))) return true;
  const ui = (await peek(path.join(dataDir, UI_FILE))) as Record<string, unknown> | null;
  return !!ui && typeof ui === 'object' && 'vo:settings' in ui;
}

/** When a data folder last changed (ms): the newest of its own files and song bundles. */
export async function dataChanged(dataDir: string): Promise<number | null> {
  const files = [...SIGNS, ...(await bundlesIn(dataDir)).map((b) => path.join('songs', b))];
  const times = await Promise.all(
    files.map((f) =>
      fsp.stat(path.join(dataDir, f)).then(
        (s) => s.mtimeMs,
        () => null,
      ),
    ),
  );
  const known = times.filter((t): t is number => t !== null);
  return known.length ? Math.round(Math.max(...known)) : null;
}

/** An app folder: package.json of this app. */
async function isAppRoot(dir: string): Promise<boolean> {
  const pkg = (await peek(path.join(dir, 'package.json'))) as { name?: unknown } | null;
  return pkg?.name === 'verse-orchestrator';
}

/** A release copy's layout (layout.ts readLayout, read without blocking): its data folder. */
async function layoutData(root: string): Promise<string | null> {
  const m = (await peek(path.join(root, LAYOUT_MARKER))) as { data?: unknown } | null;
  return typeof m?.data === 'string' ? path.resolve(root, m.data) : null;
}
const dataOf = async (root: string) => (await layoutData(root)) ?? path.join(root, 'data');

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
export async function resolveCopy(folder: string): Promise<FoundCopy | null> {
  const dir = path.resolve(folder);
  for (const root of [path.join(dir, 'app'), dir]) {
    if (await isAppRoot(root)) {
      const dataDir = await dataOf(root);
      return (await holdsData(dataDir)) ? { root, dataDir } : null;
    }
  }
  if (!(await holdsData(dir))) return null;
  // a data folder: its copy's app beside it, when there is one
  const top = path.dirname(dir);
  for (const root of [path.join(top, 'app'), top])
    if ((await isAppRoot(root)) && sameFolder(await dataOf(root), dir))
      return { root, dataDir: dir };
  return { root: null, dataDir: dir };
}

/** The copy's folder shown to the operator: the release folder around app/, or the clone. */
export const copyFolderOf = async (c: FoundCopy) =>
  c.root ? ((await layoutData(c.root)) ? path.dirname(c.root) : c.root) : c.dataDir;

/** A copy's own folders: never a copy themselves. */
const SKIP = new Set(['app', 'data', 'modules', 'node_modules', 'app.previous', 'app.next']);
/** Names that look like this app's folders come first, before the cap. */
const LIKELY = /verse|orchestr|^vo(?:\b|[-_ ])/i;

/** The folders inside `dir`, likely names first, at most `limit` (files never count). */
async function foldersIn(dir: string, limit: number): Promise<string[]> {
  try {
    const names = (await fsp.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name))
      .map((e) => e.name);
    names.sort((a, b) => Number(LIKELY.test(b)) - Number(LIKELY.test(a)));
    return names.slice(0, limit).map((n) => path.join(dir, n));
  } catch {
    return []; // a folder the system won't open
  }
}

/**
 * The copies beside this one (`root` — its app folder): the folders next to its folder and one
 * level inside them (a nested «Extract All»); when its folder is alone in its parent — this copy
 * unpacked by «Extract All» into a folder of its own — the parent's neighbours too. Only real
 * copies (an app folder with data): a folder the operator never named is never taken for one by
 * a settings.json alone (review of 1.12.0-beta.2). Never this copy's own data.
 */
export async function siblingCopies(
  root: string,
  dataDir: string,
  limit = 200,
): Promise<FoundCopy[]> {
  const top = (await layoutData(root)) ? path.dirname(root) : root;
  const parent = path.dirname(top);
  const near = await foldersIn(parent, limit);
  const lone = near.length === 1 && sameFolder(near[0], top);
  const dirs = lone ? await foldersIn(path.dirname(parent), limit) : near;
  const candidates = (
    await Promise.all(dirs.map(async (d) => [d, ...(await foldersIn(d, 10))]))
  ).flat();
  const found: FoundCopy[] = [];
  for (const c of await Promise.all(candidates.map((d) => resolveCopy(d)))) {
    if (!c?.root || sameFolder(c.dataDir, dataDir)) continue;
    if (!found.some((f) => sameFolder(f.dataDir, c.dataDir))) found.push(c);
  }
  return found;
}
