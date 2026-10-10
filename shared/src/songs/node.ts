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

/** A bundle's file, not a Mac's `._NAME.vosongs` companion on exFAT (1.4.1). */
const isBundleFile = (f: string): boolean =>
  !f.startsWith('._') && f.toLowerCase().endsWith(BUNDLE_EXT);

/** The bundle files in `dir`, their names as the file system hands them back. */
const bundleFiles = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter(isBundleFile)
        .sort((a, b) => a.localeCompare(b, 'uk'))
    : [];

const statOf = (file: string): fs.Stats | undefined => fs.statSync(file, { throwIfNoEntry: false });

/**
 * A file name for a new file of a bundle called `name` that takes no other bundle's file: not
 * one of the bundle files in any case or Unicode form (`bundleFileName`), and nothing in `dir`
 * answers to it by the file system's own rules either — a Mac's exFAT hands names back
 * decomposed and opens them by either spelling (1.4.1). `own`: the bundle's file when it is
 * renamed — the same file under a new case or spelling is still its own.
 */
function freeBundleFile(dir: string, name: string, own?: string): string {
  const taken = bundleFiles(dir).filter((f) => f !== own);
  const self = own === undefined ? undefined : statOf(path.join(dir, own));
  for (;;) {
    const file = bundleFileName(name, taken);
    const there = statOf(path.join(dir, file));
    if (!there || (self && there.ino === self.ino && there.dev === self.dev)) return file;
    taken.push(file);
  }
}

function withBundle<T>(file: string, readonly: boolean, fn: (db: Database.Database) => T): T {
  let db = new Database(file, { readonly, fileMustExist: readonly });
  try {
    if (readonly) {
      try {
        db.prepare(FIRST_READ).get();
      } catch (e) {
        // A write cut off midway — a stopped rebuild (1.12.4), a crash — leaves a hot journal a
        // read-only open can't roll back: the bundle read as «not a bundle», dropped out, and the
        // next folder sync made a second one (review). Opened for writing once, SQLite rolls it
        // back. (Here, before `fn`: the readers take any failure for «not a bundle».)
        if ((e as { code?: string }).code !== 'SQLITE_READONLY_ROLLBACK') throw e;
        db.close();
        const rw = new Database(file, { fileMustExist: true });
        try {
          rw.prepare(FIRST_READ).get();
        } finally {
          rw.close();
        }
        db = new Database(file, { readonly: true, fileMustExist: true });
      }
    }
    return fn(db);
  } finally {
    db.close();
  }
}

const FIRST_READ = 'SELECT count(*) FROM sqlite_master';

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
  const file = freeBundleFile(dir, name);
  const meta: BundleMeta = {
    id: randomUUID(),
    name: name.trim(),
    format: BUNDLE_FORMAT,
    created: new Date().toISOString(),
    ...(source ? { source } : {}),
    reader: PPTX_READER,
  };
  // a new file, never an existing one: another bundle's file would take this one's meta (1.4.1)
  fs.closeSync(fs.openSync(path.join(dir, file), 'wx')); // SQLite takes an empty file as new
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

/**
 * .pptx files under a folder, recursively, without Office lock files (`~$…`), a Mac's `._…`
 * companions (`isSongFile`) and hidden folders — `.Trashes` when the folder is a flash drive's
 * root holds the songs deleted in the Finder (1.4.1).
 */
export function listPptx(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.')) out.push(...listPptx(full));
    } else if (isSongFile(entry.name)) out.push(full);
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

// ── Managing bundles (1.4.0): rename, delete with «Скасувати», undo an import ──────────────

/** Deleted bundles wait here for «Скасувати»; an import's «before» copy waits in UNDO_DIR. */
export const TRASH_DIR = '.trash';
export const UNDO_DIR = '.undo';
/** how many deleted bundles the trash keeps */
const TRASH_KEEP = 10;

const findBundle = (dir: string, id: string): BundleFile | undefined =>
  listBundles(dir).find((b) => b.meta.id === id);

/**
 * Rename a bundle: its name and its file (song ids stay — they come from the bundle's id).
 * The caller checks that no other bundle has the name. Null: no such bundle.
 */
export function renameBundle(dir: string, id: string, name: string): BundleFile | null {
  const b = findBundle(dir, id);
  if (!b) return null;
  const meta = { ...b.meta, name: name.trim() };
  withBundle(path.join(dir, b.file), false, (db) => writeBundleMeta(db, meta));
  const next = freeBundleFile(dir, meta.name, b.file);
  // the same name in another Unicode form is the same file (exFAT on a Mac spells it decomposed)
  const file = next.normalize('NFC') === b.file.normalize('NFC') ? b.file : next;
  if (file !== b.file) fs.renameSync(path.join(dir, b.file), path.join(dir, file));
  return { ...b, file, meta };
}

/**
 * Move a bundle aside, into `.trash/`, so «Скасувати» can bring it back; the oldest there go
 * once there are more than ten. Returns the name it has there, or null: no such bundle.
 */
export function trashBundle(
  dir: string,
  id: string,
): { trashed: string; bundle: BundleFile } | null {
  const b = findBundle(dir, id);
  if (!b) return null;
  const trash = path.join(dir, TRASH_DIR);
  fs.mkdirSync(trash, { recursive: true });
  const trashed = `${Date.now()}-${b.file}`;
  fs.renameSync(path.join(dir, b.file), path.join(trash, trashed));
  const kept = fs.readdirSync(trash).filter(isBundleFile).sort();
  for (const old of kept.slice(0, Math.max(0, kept.length - TRASH_KEEP))) {
    fs.rmSync(path.join(trash, old), { force: true });
  }
  return { trashed, bundle: b };
}

/**
 * «Скасувати» for a deleted bundle: back from `.trash/` under a free file name. Null: it is no
 * longer there, or meanwhile a bundle came that it would double — one of that name (the
 * library tells them by name), a copy with its id, or one its .pptx folder made anew after it
 * was renamed and deleted (1.4.1: every song of that folder would be in the library twice).
 */
export function restoreBundle(dir: string, trashed: string): BundleFile | null {
  const from = path.join(dir, TRASH_DIR, path.basename(trashed));
  if (!fs.existsSync(from)) return null;
  const meta = withBundle(from, true, (db) => readBundleMeta(db));
  if (!meta) return null;
  const source = meta.source?.normalize('NFC');
  const doubled = listBundles(dir).some(
    (b) =>
      b.meta.id === meta.id ||
      sameBundleName(b.meta.name, meta.name) ||
      (source !== undefined && b.meta.source?.normalize('NFC') === source),
  );
  if (doubled) return null;
  fs.renameSync(from, path.join(dir, freeBundleFile(dir, meta.name)));
  // by id: the file system may hand the name back in another Unicode form (exFAT on a Mac)
  return findBundle(dir, meta.id) ?? null;
}

/** What an import changed, for its «Скасувати»: the bundle file, and a copy of it from before. */
export interface ImportUndo {
  file: string;
  /** the import made the bundle: undoing deletes it */
  created: boolean;
  /** the copy from before, in UNDO_DIR (an existing bundle) */
  before?: string;
}

/** Keep a copy of an existing bundle before an import changes it. */
export function snapshotBundle(dir: string, file: string): ImportUndo {
  const undo = path.join(dir, UNDO_DIR);
  fs.mkdirSync(undo, { recursive: true });
  for (const f of fs.readdirSync(undo)) fs.rmSync(path.join(undo, f), { force: true });
  const before = `${Date.now()}-${file}`;
  fs.copyFileSync(path.join(dir, file), path.join(undo, before));
  return { file, created: false, before };
}

/** «Скасувати» an import: the bundle as it was, or gone if the import made it. */
export function undoImport(dir: string, u: ImportUndo): boolean {
  const target = path.join(dir, u.file);
  if (u.created) {
    if (!fs.existsSync(target)) return false;
    fs.rmSync(target, { force: true });
    return true;
  }
  const before = u.before && path.join(dir, UNDO_DIR, u.before);
  if (!before || !fs.existsSync(before)) return false;
  fs.copyFileSync(before, target);
  fs.rmSync(before, { force: true });
  return true;
}
