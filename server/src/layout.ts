/**
 * The folder layout of a release (0.14.0, `npm run portable`). What a user sees is the start
 * file, `modules/`, `data/` and a note; the app itself — code, Node, packages, the built UI —
 * sits in `app/`, so a new version can replace that folder and leave the user's own ones alone.
 *
 * A marker in `app/` says where the user's folders are, relative to it. The entry points (the
 * launcher, the waiter) turn it into the environment every other part already reads:
 * VO_DATA_DIR (settings, library, songs, logs) and MODULES_DIR (the MyBible files). A project
 * checkout has no marker and keeps its `data/` and `modules/` as before.
 *
 * Like launcher.ts: only node: imports and no TS-only syntax (plain Node runs it).
 */
import fs from 'node:fs';
import path from 'node:path';

export const LAYOUT_MARKER = '.vo-portable';

export interface Layout {
  /** the user's data folder (absolute) */
  data: string;
  /** where the user puts MyBible modules (absolute) */
  modules: string;
}

/** The marker's content for a release: the user's folders next to `app/`. */
export const RELEASE_MARKER = { data: '../data', modules: '../modules' };

/** The user's folders of a release, or null in a project checkout. */
export function readLayout(root: string): Layout | null {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(root, LAYOUT_MARKER), 'utf8'));
    if (typeof m?.data !== 'string' || typeof m?.modules !== 'string') return null;
    return { data: path.resolve(root, m.data), modules: path.resolve(root, m.modules) };
  } catch {
    return null;
  }
}

/**
 * Point this process — and everything it starts, which inherits the environment — at the
 * release's folders. A folder given explicitly (VO_DATA_DIR, MODULES_DIR) wins.
 */
export function applyLayout(root: string, env: NodeJS.ProcessEnv = process.env): Layout | null {
  const layout = readLayout(root);
  if (!layout) return null;
  env.VO_DATA_DIR ??= layout.data;
  env.MODULES_DIR ??= layout.modules;
  return layout;
}
