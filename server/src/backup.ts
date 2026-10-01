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
 * «Повернути як було» can bring it back.
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
/** the states restores replaced, kept for «Повернути як було» (and by hand) */
const UNDO_KEEP = 5;

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

/** Why a file can't be restored (keys of the server's messages). */
export class BackupError extends Error {}

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

/** What goes into a backup of `dataDir`, the manifest first. */
export function collect(dataDir: string, app: string, now = new Date()): ZipEntry[] {
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: 1,
    app,
    created: now.toISOString(),
  };
  const out: ZipEntry[] = [
    { name: MANIFEST, data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') },
  ];
  const ui = path.join(dataDir, UI_FILE);
  if (fs.existsSync(ui)) out.push({ name: UI_FILE, data: fs.readFileSync(ui) });
  const songs = path.join(dataDir, SONGS);
  for (const f of filesIn(songs, (n) => n.endsWith(BUNDLE_EXT)))
    out.push({ name: `${SONGS}/${f}`, data: fs.readFileSync(path.join(songs, f)) });
  const images = path.join(dataDir, IMAGES);
  for (const f of filesIn(images, (n) => !n.startsWith('.') && !n.endsWith('.tmp')))
    out.push({ name: `${IMAGES}/${f}`, data: fs.readFileSync(path.join(images, f)) });
  return out;
}

export const makeBackup = (dataDir: string, app: string, now = new Date()) =>
  zip(collect(dataDir, app, now), now);

/** Only these names are restored: never a path out of data/, never another file of it. */
const ALLOWED = [
  new RegExp(`^${MANIFEST}$`),
  new RegExp(`^${UI_FILE.replace('.', '\\.')}$`),
  /^songs\/[^/\\]+\.vosongs$/,
  /^images\/[^/\\.][^/\\]*$/,
];
const allowed = (name: string) =>
  !name.includes('..') && !name.includes('\0') && ALLOWED.some((r) => r.test(name));

const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/** Read a backup file: its entries and what it holds. Refuses anything else. */
export function readBackup(buf: Buffer): { entries: ZipEntry[]; summary: BackupSummary } {
  let entries: ZipEntry[];
  try {
    entries = unzip(buf);
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
  for (const f of filesIn(songs, (n) => n.endsWith(BUNDLE_EXT))) fs.rmSync(path.join(songs, f));
  const images = path.join(dataDir, IMAGES);
  for (const f of filesIn(images, (n) => !n.startsWith('.'))) fs.rmSync(path.join(images, f));
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

export function lastRestore(dataDir: string): LastRestore | null {
  const last = readJson<LastRestore | null>(path.join(backupsDir(dataDir), LAST), null);
  return last && fs.existsSync(path.join(backupsDir(dataDir), last.undo)) ? last : null;
}

/**
 * Restore the pending file: first the current state as a backup of its own (the way back),
 * then the file's. Null: nothing pending.
 */
export function restorePending(
  dataDir: string,
  app: string,
  now = new Date(),
): BackupSummary | null {
  const dir = backupsDir(dataDir);
  const pending = path.join(dir, PENDING);
  if (!fs.existsSync(pending)) return null;
  const { entries, summary } = readBackup(fs.readFileSync(pending));
  const undo = `before-restore-${now.toISOString().replace(/[:.]/g, '-')}.zip`;
  put(path.join(dir, undo), makeBackup(dataDir, app, now));
  applyBackup(dataDir, entries, now);
  fs.rmSync(pending, { force: true });
  writeJson(path.join(dir, LAST), { created: summary.created, at: now.toISOString(), undo });
  const kept = filesIn(dir, (n) => n.startsWith('before-restore-'));
  for (const old of kept.slice(0, Math.max(0, kept.length - UNDO_KEEP)))
    fs.rmSync(path.join(dir, old), { force: true });
  return summary;
}

/** «Повернути як було»: the state the last restore replaced. False: nothing to go back to. */
export function undoRestore(dataDir: string, now = new Date()): boolean {
  const last = lastRestore(dataDir);
  if (!last) return false;
  const { entries } = readBackup(fs.readFileSync(path.join(backupsDir(dataDir), last.undo)));
  applyBackup(dataDir, entries, now);
  fs.rmSync(path.join(backupsDir(dataDir), LAST), { force: true });
  return true;
}

/** A file name for a backup made at `now`: VerseOrchestrator-backup-2026-10-01-1405.zip */
export function backupName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `VerseOrchestrator-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.zip`;
}
