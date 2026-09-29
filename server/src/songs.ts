import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { BUNDLE_EXT } from '@vo/shared';
import {
  bundlesDir,
  legacySongsDir,
  syncFolderBundle,
  refreshLibrarySongs,
} from '@vo/shared/songs-node';

/**
 * Song bundles at the server's start (0.10.0): a library built before bundles — or bundles
 * changed since the library was built — gets its songs from the bundles again, without a
 * full rebuild. A folder of .pptx songs (the way songs came in before bundles) feeds its
 * bundle first — made from it the first time, updated when a file in it is newer.
 */

const mtime = (file: string): number => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

/** Does the library's songs table have the `bundle` column (0.10.0)? */
function hasBundleColumn(libraryPath: string): boolean {
  const db = new Database(libraryPath, { readonly: true, fileMustExist: true });
  try {
    const cols = db.prepare('PRAGMA table_info(songs)').all() as { name: string }[];
    return cols.some((c) => c.name === 'bundle');
  } finally {
    db.close();
  }
}

export function syncSongsAtStart(opts: {
  dataDir: string;
  repoRoot: string;
  libraryPath: string;
  log: (msg: string) => void;
}): void {
  const { dataDir, repoRoot, libraryPath, log } = opts;
  if (!fs.existsSync(libraryPath)) return;
  const dir = bundlesDir(dataDir);
  const started = Date.now();
  syncFolderBundle(dir, legacySongsDir(repoRoot), log);
  const newest = fs.existsSync(dir)
    ? Math.max(
        0,
        ...fs
          .readdirSync(dir)
          .filter((f) => f.toLowerCase().endsWith(BUNDLE_EXT))
          .map((f) => mtime(path.join(dir, f))),
      )
    : 0;
  if (newest === 0) return;
  const built = Math.max(mtime(libraryPath), mtime(`${libraryPath}-wal`));
  if (newest <= built && hasBundleColumn(libraryPath)) return;
  const n = refreshLibrarySongs(libraryPath, dir);
  log(`songs: ${n} from the bundles into the library (${Date.now() - started} ms)`);
}
