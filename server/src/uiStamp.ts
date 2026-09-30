/**
 * Is the built UI (web/dist) made from this code? Every web build stamps it: web/vite.config.ts
 * writes `web/dist/.vo-version` from uiStamp() (1.4.1 — before, only the launcher's own build did,
 * and a plain `npm run build --workspace @vo/web`, the check list's and CI's step, left a build
 * without a stamp that a clone then served after every pull). The launcher, the waiter and the
 * portable build read it through needsBuild().
 *
 * Like launcher.ts: only node: imports and no TS-only syntax — plain Node runs it, and the web
 * build's config imports it too.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readLayout } from './layout.ts';

/** The stamp's file in the built UI. */
export const STAMP_FILE = '.vo-version';

/** What the UI build is made from (besides node_modules, which package-lock.json stands for). */
const UI_SOURCES = [
  'package-lock.json',
  'web/index.html',
  'web/vite.config.ts',
  'web/package.json',
  'web/public',
  'web/src',
  'shared/src',
];

/**
 * What a UI build is stamped with: the code's version and, in a clone, the content of its
 * sources — since 1.0.0 the version changes only with a release, so a `git pull` between
 * releases must be told apart by what changed (≈ 40 ms for ≈ 160 files on Windows, ≈ 3 ms for
 * ≈ 180 on an Apple Silicon Mac). A release's build is made for its version and never rebuilt (it
 * has no bundler): the version alone.
 *
 * Names that start with a dot are not sources (1.4.1): Finder's `.DS_Store`, the `._NAME` files
 * macOS writes on other drives, an editor's swap files — git ignores them, and hashing them
 * rebuilt the UI whenever Finder changed a folder's view. No UI source starts with a dot.
 */
export function uiStamp(root: string): string {
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  if (readLayout(root)) return version;
  const hash = createHash('sha1');
  const add = (rel: string): void => {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) return;
    if (fs.statSync(file).isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) {
        if (!name.startsWith('.')) add(`${rel}/${name}`);
      }
      return;
    }
    hash.update(`${rel}\0`);
    hash.update(fs.readFileSync(file));
  };
  for (const rel of UI_SOURCES) add(rel);
  return `${version}+${hash.digest('hex').slice(0, 12)}`;
}

/** The UI build to serve is missing, or was made from other code. */
export function needsBuild(root: string): boolean {
  const dist = path.join(root, 'web', 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) return true;
  const release = readLayout(root) !== null;
  let built: string;
  try {
    built = fs.readFileSync(path.join(dist, STAMP_FILE), 'utf8').trim();
  } catch {
    // no stamp: a release serves what it came with (it can't rebuild); a clone can't tell what
    // an unstamped build was made from — one left by the web build before 1.4.1 — so it rebuilds
    return !release;
  }
  // a release compares versions only: its build was stamped in the clone it came from
  if (release) return built.split('+')[0] !== uiStamp(root);
  return built !== uiStamp(root);
}
