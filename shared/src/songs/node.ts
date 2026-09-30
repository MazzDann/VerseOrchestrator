import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  BUNDLE_EXT,
  BUNDLE_FORMAT,
  bundleFileName,
  prepareBundle,
  readBundleMeta,
  countBundleSongs,
  readBundleSongs,
  sameBundleName,
  upsertBundleSongs,
  writeBundleMeta,
  writeLibrarySongs,
  type Bundle,
  type BundleMeta,
  type BundleSong,
} from './bundle.js';
import { isSongFile, parsePptx, PPTX_READER } from './pptx.js';
import { N_ } from '../i18n/index.js';

/**
 * Song bundles on disk (0.10.0) — for the builder and the server, never the browser
 * (`@vo/shared/songs-node`; the package's main entry stays free of Node imports).
 */

/** Bundles live in `songs/` inside the data folder. */
export const bundlesDir = (dataDir: string): string => path.join(dataDir, 'songs');

export interface BundleFile {
  /** file name in the bundles folder */
  file: string;
  meta: BundleMeta;
  count: number;
}

const bundleFiles = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.toLowerCase().endsWith(BUNDLE_EXT))
        .sort((a, b) => a.localeCompare(b, 'uk'))
    : [];

function withBundle<T>(file: string, readonly: boolean, fn: (db: Database.Database) => T): T {
  const db = new Database(file, { readonly, fileMustExist: readonly });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** The bundles in `dir` (unreadable files skipped), by name. */
export function listBundles(dir: string): BundleFile[] {
  const out: BundleFile[] = [];
  for (const file of bundleFiles(dir)) {
    try {
      const b = withBundle(path.join(dir, file), true, (db) => {
        const meta = readBundleMeta(db);
        if (!meta) return null;
        return { file, meta, count: countBundleSongs(db) };
      });
      if (b) out.push(b);
    } catch {
      /* not a bundle */
    }
  }
  return out.sort((a, b) => a.meta.name.localeCompare(b.meta.name, 'uk'));
}

/** Every bundle with its songs, by name — what the library is built from. */
export function readBundles(dir: string): Bundle[] {
  return listBundles(dir).map(({ file, meta }) => ({
    meta,
    songs: withBundle(path.join(dir, file), true, (db) => readBundleSongs(db)),
  }));
}

/** A new, empty bundle called `name` in `dir` (`source`: the .pptx folder that feeds it). */
export function createBundle(dir: string, name: string, source?: string): BundleFile {
  fs.mkdirSync(dir, { recursive: true });
  const file = bundleFileName(name, bundleFiles(dir));
  const meta: BundleMeta = {
    id: randomUUID(),
    name: name.trim(),
    format: BUNDLE_FORMAT,
    created: new Date().toISOString(),
    ...(source ? { source } : {}),
    reader: PPTX_READER,
  };
  withBundle(path.join(dir, file), false, (db) => {
    prepareBundle(db);
    writeBundleMeta(db, meta);
  });
  return { file, meta, count: 0 };
}

/** Put songs into a bundle — an existing one (by id) or a new one (by name). */
export function importSongs(
  dir: string,
  target: { id: string } | { name: string; source?: string },
  songs: BundleSong[],
): { bundle: BundleFile; added: number; updated: number } {
  const bundle =
    'id' in target
      ? listBundles(dir).find((b) => b.meta.id === target.id)
      : createBundle(dir, target.name, target.source);
  if (!bundle) throw new Error(N_('Бандл не знайдено'));
  const result = withBundle(path.join(dir, bundle.file), false, (db) => {
    prepareBundle(db);
    return upsertBundleSongs(db, songs);
  });
  return { bundle: { ...bundle, count: bundle.count + result.added }, ...result };
}

/** .pptx files under a folder, recursively, without Office lock files (`~$…`). */
export function listPptx(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listPptx(full));
    else if (isSongFile(entry.name)) out.push(full);
  }
  return out;
}

/** Read .pptx files into songs; the files that aren't readable songs are listed apart. */
export function readPptxFiles(files: string[]): { songs: BundleSong[]; failed: string[] } {
  const songs: BundleSong[] = [];
  const failed: string[] = [];
  for (const file of files) {
    let song = null;
    try {
      song = parsePptx(new Uint8Array(fs.readFileSync(file)), path.basename(file));
    } catch {
      song = null;
    }
    if (song) songs.push(song);
    else failed.push(path.basename(file));
  }
  return { songs, failed };
}

/**
 * A folder of .pptx songs, the way songs came in before bundles (0.10.0): $SONGS_DIR, the
 * project's `songs/`, or the reference collection `old/ПС укр 1-477`. Null when there is none.
 */
export function legacySongsDir(repoRoot: string): string | null {
  const candidates = [
    process.env.SONGS_DIR ? path.resolve(process.env.SONGS_DIR) : null,
    path.join(repoRoot, 'songs'),
    path.join(repoRoot, 'old', 'ПС укр 1-477'), // i18n-ignore: a folder
  ];
  return candidates.find((d) => d && fs.existsSync(d) && listPptx(d).length > 0) ?? null;
}

/** «ПС укр 1-477» → «ПС» (the user's name for it); `songs` → «Пісні»; else the folder's name. */
export function legacyBundleName(dir: string): string {
  const base = path.basename(dir).trim().normalize('NFC');
  // bundle names are data: the same in every interface language
  if (/^ПС(\s|$)/.test(base)) return 'ПС'; // i18n-ignore
  if (base.toLowerCase() === 'songs') return 'Пісні'; // i18n-ignore
  return base || 'Пісні'; // i18n-ignore
}

const mtime = (file: string): number => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

/**
 * A folder of .pptx songs feeds a bundle of its own (0.10.0), so dropping files into it and
 * rescanning still works: the first time the folder becomes a bundle, afterwards its songs
 * go into that bundle again whenever a file in it is newer than the bundle — or an older
 * .pptx reader wrote it (1.2.1), so a better reading reaches the songs by itself. The bundle
 * knows its folder by name (not path), so a copy of the app on another drive finds it too.
 * Returns the bundle it wrote, or null when there was nothing to do.
 */
export function syncFolderBundle(
  dir: string,
  folder: string | null,
  log: (msg: string) => void = () => {},
): (BundleFile & { failed: string[] }) | null {
  if (!folder) return null;
  const files = listPptx(folder);
  if (files.length === 0) return null;
  // the folder's name in one Unicode form, as keys are (a Mac spells «й» in two characters)
  const source = path.basename(folder).normalize('NFC');
  const bundles = listBundles(dir);
  let bundle = bundles.find((b) => b.meta.source?.normalize('NFC') === source);
  const adopt = bundles.find(
    (b) => !b.meta.source && sameBundleName(b.meta.name, legacyBundleName(folder)),
  );
  if (!bundle && adopt) {
    // a bundle of that name that doesn't remember a folder yet: this folder's
    bundle = { ...adopt, meta: { ...adopt.meta, source } };
    withBundle(path.join(dir, adopt.file), false, (db) => writeBundleMeta(db, bundle!.meta));
  }
  const fresh =
    bundle &&
    (bundle.meta.reader ?? 1) >= PPTX_READER &&
    Math.max(...files.map(mtime)) <= mtime(path.join(dir, bundle.file));
  if (fresh) return null;
  const { songs, failed } = readPptxFiles(files);
  if (songs.length === 0) return null;
  const done = importSongs(
    dir,
    bundle ? { id: bundle.meta.id } : { name: legacyBundleName(folder), source },
    songs,
  );
  // every song of the folder was read just now: the bundle is this reader's
  const meta = { ...done.bundle.meta, reader: PPTX_READER };
  withBundle(path.join(dir, done.bundle.file), false, (db) => writeBundleMeta(db, meta));
  log(
    bundle
      ? `songs: ${folder} → bundle «${done.bundle.meta.name}»: ${done.added} new, ${done.updated} updated`
      : `songs: ${folder} → new bundle «${done.bundle.meta.name}» (${done.bundle.count} songs)`,
  );
  for (const f of failed) log(`songs: skipped ${f} (not a readable song)`);
  return { ...done.bundle, meta, failed };
}

/** Replace the library's songs with the bundles' songs; the library file must exist. */
export function refreshLibrarySongs(libraryPath: string, dir: string): number {
  const db = new Database(libraryPath, { fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000'); // the server may be reading
    return writeLibrarySongs(db, readBundles(dir));
  } finally {
    db.close();
  }
}
