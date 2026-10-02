import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './jsonFile.js';
import { unzip, zip, type ZipEntry } from './zip.js';

/**
 * «Резервна копія» (1.5.0): the operator's own things in one .zip — the UI state (appearance,
 * presets, hotkeys, bookmarks and history, the running order and saved programs:
 * data/ui-state.json), the song bundles (data/songs/*.vosongs) and the pictures
 * (data/images/). Not in it: the modules and the library (large, built again from modules/),
 * the speaker remotes' pairings (secrets), and this machine's own settings — port, browser,
 * which modules to build (data/settings.json).
 *
 * Restoring keeps the state it replaces as a backup of its own first (data/backups/), so
 * «Повернути як було» can bring it back; going back keeps the state it replaces too.
 */

export const BACKUP_FORMAT = 'verse-orchestrator-backup';
const MANIFEST = 'manifest.json';
const UI_FILE = 'ui-state.json';
const SONGS = 'songs';
const IMAGES = 'images';
const BUNDLE_EXT = '.vosongs'; // @vo/shared songs/bundle.ts
export const BACKUPS = 'backups';
const PENDING = 'pending.zip';
const LAST = 'last-restore.json';
/** the states restores and their undos replaced, kept per kind (and by hand) */
const KEEP = 5;
/**
 * The largest backup there is (1 GB of files): a restore reads the whole file into memory, so
 * one larger is refused when it is made — not found out at the restore (review of #47).
 */
export const MAX_BACKUP_BYTES = 1024 ** 3;
/** «Повернути як було» is for right after a restore: a day later it is no longer offered. */
const UNDO_FOR_MS = 24 * 60 * 60 * 1000;

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: 1;
  /** the app version that made it */
  app: string;
  /** ISO time */
  created: string;
}

/** What a backup holds, for the operator to see before restoring it. */
export interface BackupSummary {
  app: string;
  created: string;
  /** the UI state is there (appearance, hotkeys, bookmarks, history) */
  settings: boolean;
  /** saved programs */
  programs: number;
  /** items of the running order */
  items: number;
  /** song bundles, by name of file */
  bundles: string[];
  pictures: number;
}

/** Why a file can't be restored, or a backup can't be made (keys of the server's messages). */
export class BackupError extends Error {}

/** Names a backup holds: never a dot file — macOS leaves `._NAME` companions on a flash drive. */
const own = (name: string) => !name.startsWith('.') && !name.endsWith('.tmp');

const filesIn = (dir: string, keep: (name: string) => boolean) => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && keep(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
};

const bundleFile = (n: string) => own(n) && n.endsWith(BUNDLE_EXT);

/** What goes into a backup of `dataDir`, the manifest first. Too big: BackupError('too big'). */
export function collect(dataDir: string, app: string, now = new Date()): ZipEntry[] {
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: 1,
    app,
    created: now.toISOString(),
  };
  const files: [string, string][] = [];
  const ui = path.join(dataDir, UI_FILE);
  if (fs.existsSync(ui)) files.push([UI_FILE, ui]);
  const songs = path.join(dataDir, SONGS);
  for (const f of filesIn(songs, bundleFile)) files.push([`${SONGS}/${f}`, path.join(songs, f)]);
  const images = path.join(dataDir, IMAGES);
  for (const f of filesIn(images, own)) files.push([`${IMAGES}/${f}`, path.join(images, f)]);
  const total = files.reduce((n, [, p]) => n + fs.statSync(p).size, 0);
  if (total > MAX_BACKUP_BYTES) throw new BackupError('too big');
  return [
    { name: MANIFEST, data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') },
    ...files.map(([name, p]) => ({ name, data: fs.readFileSync(p) })),
  ];
}

/** A picture's file is compressed already: stored as it is (deflate would only cost time). */
const compressed = (name: string) => name.startsWith(`${IMAGES}/`) && !name.endsWith('.json');

export const makeBackup = (dataDir: string, app: string, now = new Date()) =>
  zip(collect(dataDir, app, now), now, compressed);

/** Only these names are restored: never a path out of data/, never another file of it. */
const ALLOWED = [
  /^manifest\.json$/,
  /^ui-state\.json$/,
  /^songs\/[^/\\.][^/\\]*\.vosongs$/,
  /^images\/[^/\\.][^/\\]*$/,
];
const allowed = (name: string) =>
  !name.includes('..') && !name.includes('\0') && ALLOWED.some((r) => r.test(name));

const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/** Read a backup file: its entries and what it holds. Refuses anything else. */
export async function readBackup(
  buf: Buffer,
): Promise<{ entries: ZipEntry[]; summary: BackupSummary }> {
  let entries: ZipEntry[];
  try {
    entries = await unzip(buf, MAX_BACKUP_BYTES + 16 * 1024 * 1024);
  } catch {
    throw new BackupError('not a zip');
  }
  const manifestEntry = entries.find((e) => e.name === MANIFEST);
  let manifest: Partial<BackupManifest> = {};
  try {
    manifest = JSON.parse(manifestEntry?.data.toString('utf8') ?? '{}');
  } catch {
    /* refused below */
  }
  if (manifest.format !== BACKUP_FORMAT || manifest.version !== 1)
    throw new BackupError('not a backup');
  const bad = entries.find((e) => !allowed(e.name));
  if (bad) throw new BackupError('foreign file');
  let settings = false;
  let programs = 0;
  let items = 0;
  const ui = entries.find((e) => e.name === UI_FILE);
  if (ui) {
    try {
      const state = JSON.parse(ui.data.toString('utf8')) as Record<string, { value?: string }>;
      settings = typeof state['vo:settings']?.value === 'string';
      const playlist = JSON.parse(state['vo:playlist']?.value ?? '{}') as {
        state?: { items?: unknown; saved?: unknown };
      };
      programs = count(playlist.state?.saved);
      items = count(playlist.state?.items);
    } catch {
      throw new BackupError('damaged');
    }
  }
  const bundles = entries
    .filter((e) => e.name.startsWith(`${SONGS}/`))
    .map((e) => e.name.slice(SONGS.length + 1, -BUNDLE_EXT.length));
  const index = entries.find((e) => e.name === `${IMAGES}/index.json`);
  let pictures = 0;
  try {
    pictures = index ? count(JSON.parse(index.data.toString('utf8')).images) : 0;
  } catch {
    throw new BackupError('damaged');
  }
  return {
    entries,
    summary: {
      app: String(manifest.app ?? ''),
      created: String(manifest.created ?? ''),
      settings,
      programs,
      items,
      bundles,
      pictures,
    },
  };
}

/** Write a file atomically (temp + rename), its folder made. */
function put(file: string, data: Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

/**
 * Make `dataDir` hold what the backup holds: the UI state (saved now, so every browser takes it
 * as the newest at its next start — web/src/lib/uiState.ts), the song bundles and the pictures
 * in place of the current ones. What the backup lacks stays as it is only for the UI state.
 */
export function applyBackup(dataDir: string, entries: ZipEntry[], now = new Date()): void {
  const ui = entries.find((e) => e.name === UI_FILE);
  if (ui) {
    const state = JSON.parse(ui.data.toString('utf8')) as Record<
      string,
      { value: string; at: number }
    >;
    const fresh: Record<string, { value: string; at: number }> = {};
    for (const [key, entry] of Object.entries(state))
      if (entry && typeof entry.value === 'string')
        fresh[key] = { value: entry.value, at: now.getTime() };
    writeJson(path.join(dataDir, UI_FILE), fresh);
  }
  const songs = path.join(dataDir, SONGS);
  for (const f of filesIn(songs, bundleFile)) fs.rmSync(path.join(songs, f));
  const images = path.join(dataDir, IMAGES);
  for (const f of filesIn(images, own)) fs.rmSync(path.join(images, f));
  for (const e of entries) {
    if (e.name.startsWith(`${SONGS}/`) || e.name.startsWith(`${IMAGES}/`))
      put(path.join(dataDir, ...e.name.split('/')), e.data);
  }
}

export const backupsDir = (dataDir: string) => path.join(dataDir, BACKUPS);

/** A file sent to restore, kept until it is restored or another one comes. */
export function keepPending(dataDir: string, buf: Buffer): void {
  put(path.join(backupsDir(dataDir), PENDING), buf);
}

export interface LastRestore {
  /** when the restored backup was made */
  created: string;
  /** when it was restored */
  at: string;
  /** the state it replaced, in data/backups/ */
  undo: string;
}

/** The last restore while «Повернути як було» is offered: a day, and while its file is there. */
export function lastRestore(dataDir: string, now = Date.now()): LastRestore | null {
  const last = readJson<LastRestore | null>(path.join(backupsDir(dataDir), LAST), null);
  if (!last || typeof last.undo !== 'string' || !/^before-[\w.-]+\.zip$/.test(last.undo))
    return null;
  if (!(now - Date.parse(last.at) < UNDO_FOR_MS)) return null;
  return fs.existsSync(path.join(backupsDir(dataDir), last.undo)) ? last : null;
}

const stamp = (now: Date) => now.toISOString().replace(/[:.]/g, '-');

/** Keep the state about to be replaced as `before-<kind>-<stamp>.zip`; the oldest of a kind go. */
async function keepBefore(
  dataDir: string,
  kind: 'restore' | 'undo',
  app: string,
  now: Date,
): Promise<string> {
  const dir = backupsDir(dataDir);
  const name = `before-${kind}-${stamp(now)}.zip`;
  put(path.join(dir, name), await makeBackup(dataDir, app, now));
  const kept = filesIn(dir, (n) => n.startsWith(`before-${kind}-`));
  for (const old of kept.slice(0, Math.max(0, kept.length - KEEP)))
    fs.rmSync(path.join(dir, old), { force: true });
  return name;
}

/**
 * Restore the pending file: first the current state as a backup of its own (the way back) and
 * the note that offers it — written before anything changes, so a restore that fails midway
 * still offers «Повернути як було» (review of #47) — then the file's. Null: nothing pending.
 */
export async function restorePending(
  dataDir: string,
  app: string,
  now = new Date(),
): Promise<BackupSummary | null> {
  const dir = backupsDir(dataDir);
  const pending = path.join(dir, PENDING);
  if (!fs.existsSync(pending)) return null;
  const { entries, summary } = await readBackup(fs.readFileSync(pending));
  const undo = await keepBefore(dataDir, 'restore', app, now);
  writeJson(path.join(dir, LAST), { created: summary.created, at: now.toISOString(), undo });
  applyBackup(dataDir, entries, now);
  fs.rmSync(pending, { force: true });
  return summary;
}

/**
 * «Повернути як було»: the state the last restore replaced. What is there now — the restored
 * state and whatever was changed since — is kept first (data/backups/before-undo-…), so going
 * back loses nothing either (review of #47). False: nothing to go back to.
 */
export async function undoRestore(
  dataDir: string,
  app: string,
  now = new Date(),
): Promise<boolean> {
  const last = lastRestore(dataDir, now.getTime());
  if (!last) return false;
  const { entries } = await readBackup(fs.readFileSync(path.join(backupsDir(dataDir), last.undo)));
  await keepBefore(dataDir, 'undo', app, now);
  applyBackup(dataDir, entries, now);
  fs.rmSync(path.join(backupsDir(dataDir), LAST), { force: true });
  return true;
}

/** A file name for a backup made at `now`: VerseOrchestrator-backup-2026-10-01-1405.zip */
export function backupName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `VerseOrchestrator-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.zip`;
}
