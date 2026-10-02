import fs from 'node:fs';
import fsp from 'node:fs/promises';
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
 * Restoring first moves the state it replaces into a folder of its own (data/backups/), so
 * «Повернути як було» can move it back; going back keeps the state it replaces too. Files are
 * read and written with fs/promises and the zip is (de)compressed on the thread pool: the hub —
 * phones, remotes, the output windows' commands — keeps going meanwhile (review of #47).
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
 * The largest backup the operator can take away (1 GB of files): a restore reads the whole file
 * into memory, so one larger is refused when it is made — not found out at the restore. The
 * states kept in data/backups/ before a restore or an undo have no such limit: their files are
 * moved there, not packed (review of #47).
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

/**
 * Why a file can't be restored, or a backup can't be made: 'too big' (over 1 GB), anything
 * else — not a backup of this app, or damaged.
 */
export class BackupError extends Error {}

/** Names a backup holds: never a dot file — macOS leaves `._NAME` companions on a flash drive. */
const own = (name: string) => !name.startsWith('.') && !name.endsWith('.tmp');

async function filesIn(dir: string, keep: (name: string) => boolean): Promise<string[]> {
  try {
    return (await fsp.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isFile() && keep(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

const bundleFile = (n: string) => own(n) && n.endsWith(BUNDLE_EXT);

/** What goes into a backup of `dataDir`, the manifest first; over 1 GB is BackupError('too big'). */
export async function collect(dataDir: string, app: string, now = new Date()): Promise<ZipEntry[]> {
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
  for (const f of await filesIn(songs, bundleFile))
    files.push([`${SONGS}/${f}`, path.join(songs, f)]);
  const images = path.join(dataDir, IMAGES);
  for (const f of await filesIn(images, own)) files.push([`${IMAGES}/${f}`, path.join(images, f)]);
  let total = 0;
  for (const [, p] of files) total += (await fsp.stat(p)).size;
  if (total > MAX_BACKUP_BYTES) throw new BackupError('too big');
  const out: ZipEntry[] = [
    { name: MANIFEST, data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') },
  ];
  for (const [name, p] of files) out.push({ name, data: await fsp.readFile(p) });
  return out;
}

/** A picture's file is compressed already: stored as it is (deflate would only cost time). */
const compressed = (name: string) => name.startsWith(`${IMAGES}/`) && !name.endsWith('.json');

export async function makeBackup(dataDir: string, app: string, now = new Date()): Promise<Buffer> {
  return zip(await collect(dataDir, app, now), now, compressed);
}

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
async function put(file: string, data: Buffer): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, data);
  try {
    await fsp.rename(tmp, file);
  } catch (e) {
    await fsp.rm(tmp, { force: true }); // nothing half-written left behind
    throw e;
  }
}

/**
 * Make `dataDir` hold what the backup holds: the song bundles and the pictures in place of the
 * current ones, then the UI state — last, and stamped with the time it is written, so a change
 * a window sent while the files went in is older than it (review of #47); every browser takes
 * it as the newest at its next start (web/src/lib/uiState.ts). What the backup lacks stays as
 * it is only for the UI state. Returns the time the UI state was stamped with.
 */
export async function applyBackup(dataDir: string, entries: ZipEntry[]): Promise<number> {
  const songs = path.join(dataDir, SONGS);
  for (const f of await filesIn(songs, bundleFile)) await fsp.rm(path.join(songs, f));
  const images = path.join(dataDir, IMAGES);
  for (const f of await filesIn(images, own)) await fsp.rm(path.join(images, f));
  for (const e of entries) {
    if (e.name.startsWith(`${SONGS}/`) || e.name.startsWith(`${IMAGES}/`))
      await put(path.join(dataDir, ...e.name.split('/')), e.data);
  }
  const ui = entries.find((e) => e.name === UI_FILE);
  return ui ? writeUiState(dataDir, JSON.parse(ui.data.toString('utf8'))) : Date.now();
}

/** The UI state written, stamped with the time it is written; returns that time. */
function writeUiState(dataDir: string, state: Record<string, { value?: unknown }>): number {
  const at = Date.now();
  const fresh: Record<string, { value: string; at: number }> = {};
  for (const [key, entry] of Object.entries(state))
    if (entry && typeof entry.value === 'string') fresh[key] = { value: entry.value, at };
  writeJson(path.join(dataDir, UI_FILE), fresh);
  return at;
}

export const backupsDir = (dataDir: string) => path.join(dataDir, BACKUPS);

/** A file sent to restore, kept until it is restored or another one comes. */
export async function keepPending(dataDir: string, buf: Buffer): Promise<void> {
  await put(path.join(backupsDir(dataDir), PENDING), buf);
}

export interface LastRestore {
  /** when the restored backup was made */
  created: string;
  /** when it was restored */
  at: string;
  /** the state it replaced, in data/backups/ */
  undo: string;
}

/** The last restore while «Повернути як було» is offered: a day, and while its folder is there. */
export function lastRestore(dataDir: string, now = Date.now()): LastRestore | null {
  const last = readJson<LastRestore | null>(path.join(backupsDir(dataDir), LAST), null);
  if (!last || typeof last.undo !== 'string' || !/^before-restore-[\w-]+$/.test(last.undo))
    return null;
  if (!(now - Date.parse(last.at) < UNDO_FOR_MS)) return null;
  try {
    return fs.statSync(path.join(backupsDir(dataDir), last.undo)).isDirectory() ? last : null;
  } catch {
    return null;
  }
}

const stamp = (now: Date) => now.toISOString().replace(/[:.]/g, '-');

/** What Windows answers for a file another program holds a moment (an antivirus, the indexer). */
const HELD = new Set(['EBUSY', 'EPERM', 'EACCES']);

/**
 * Move a file, its folder made; across drives (data/ linked elsewhere) by copying. A file held a
 * moment is tried again, for a second at most (review of #47).
 */
async function move(from: string, to: string): Promise<void> {
  await fsp.mkdir(path.dirname(to), { recursive: true });
  for (let tries = 1; ; tries++) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (code === 'EXDEV') {
        await fsp.copyFile(from, to);
        await fsp.rm(from);
        return;
      }
      if (!HELD.has(code) || tries >= 10) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

/** The song bundles and the pictures of a data folder (or a kept state): [folder, name]. */
async function stateFiles(dir: string): Promise<[string, string][]> {
  return [
    ...(await filesIn(path.join(dir, SONGS), bundleFile)).map((f): [string, string] => [SONGS, f]),
    ...(await filesIn(path.join(dir, IMAGES), own)).map((f): [string, string] => [IMAGES, f]),
  ];
}

/**
 * Move the song bundles and the pictures of one data folder (or kept state) into another — all
 * of them or none: when one can't be moved, those already moved go back, and the error stands. A
 * state half moved was neither the old one nor the new one, and the way back lost files
 * (review of #47).
 */
async function moveState(from: string, to: string): Promise<void> {
  const moved: [string, string][] = [];
  try {
    for (const [sub, f] of await stateFiles(from)) {
      const a = path.join(from, sub, f);
      const b = path.join(to, sub, f);
      await move(a, b);
      moved.push([a, b]);
    }
  } catch (e) {
    for (const [a, b] of moved.reverse()) await move(b, a).catch(() => undefined);
    throw e;
  }
}

/**
 * A folder for the state about to be replaced, `data/backups/before-<kind>-<stamp>/`, the UI
 * state copied in (a backup without one leaves it as it is). The song bundles and the pictures
 * are moved in next (moveState), not packed into a zip: no copy in memory and no size limit — a
 * local zip over 2 GB could not even be read back (review of #47).
 */
async function keepFolder(dataDir: string, kind: 'restore' | 'undo', now: Date): Promise<string> {
  const into = path.join(backupsDir(dataDir), `before-${kind}-${stamp(now)}`);
  await fsp.mkdir(into, { recursive: true });
  const ui = path.join(dataDir, UI_FILE);
  if (fs.existsSync(ui)) await fsp.copyFile(ui, path.join(into, UI_FILE));
  return into;
}

/** A kept folder no longer needed: removed only when no song or picture is left in it. */
async function dropFolder(folder: string): Promise<void> {
  if ((await stateFiles(folder)).length === 0)
    await fsp.rm(folder, { recursive: true, force: true });
}

/**
 * The oldest kept folders of a kind go: five stay, the one just made (`keep`) always among them
 * — names sort by the clock, and a clock behind the older names must not make it «the oldest».
 * Done last and best effort: a folder that can't go now goes next time, and the operation it
 * follows has succeeded already (review of #47).
 */
async function prune(dataDir: string, kind: 'restore' | 'undo', keep: string): Promise<void> {
  try {
    const dir = backupsDir(dataDir);
    const others = (await fsp.readdir(dir, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && e.name.startsWith(`before-${kind}-`) && e.name !== keep)
      .map((e) => e.name)
      .sort();
    for (const old of others.slice(0, Math.max(0, others.length - (KEEP - 1))))
      await fsp.rm(path.join(dir, old), { recursive: true, force: true });
  } catch (e) {
    console.warn(`[server] backup: an old kept state stays for now: ${(e as Error).message}`);
  }
}

/** Backup work running or waiting (made, checked, restored, undone). */
let queue: Promise<unknown> = Promise.resolve();
let queued = 0;
/** Changes to the song bundles or the pictures under way (startChange). */
let changing = 0;
/** Who waits for no backup work / for no change. */
const free: (() => void)[] = [];
const unchanged: (() => void)[] = [];

const wake = (waiting: (() => void)[]) => {
  for (const w of waiting.splice(0)) w();
};
async function until(ready: () => boolean, waiting: (() => void)[]): Promise<void> {
  while (!ready()) await new Promise<void>((r) => waiting.push(r));
}

/**
 * Backup work after the work before it, once the changes under way have ended: a save during a
 * restore, or two restores from two windows, read or wrote a half-replaced data/, and a change
 * landing in the middle was lost (review of #47). The routes run it through this.
 */
export function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  queued++;
  const run = queue
    .then(() => until(() => changing === 0, unchanged))
    .then(work)
    .finally(() => {
      if (--queued === 0) wake(free);
    });
  queue = run.catch(() => undefined);
  return run;
}

/** Backup work is running or waiting. */
export const backupBusy = () => queued > 0;

/**
 * A change to the song bundles or the pictures (index.ts — the whole request, its body
 * included): it starts once no backup work is running or waiting, and backup work waits for it
 * to end. Nothing is refused: an «Скасувати» that came during a save still works (review of
 * #47). Returns its end (called once; more calls do nothing).
 */
export async function startChange(): Promise<() => void> {
  await until(() => queued === 0, free);
  changing++;
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    if (--changing === 0) wake(unchanged);
  };
}

/**
 * Restore the pending file: the current state moved into a folder of its own (the way back) and
 * the note that offers it, then the file's. All of it or nothing: a failure on the way puts the
 * current state back — only when even that fails does the note stay, offering «Повернути як
 * було» (review of #47). Null: nothing pending.
 */
export async function restorePending(
  dataDir: string,
  app: string,
  now = new Date(),
): Promise<BackupSummary | null> {
  const dir = backupsDir(dataDir);
  const pending = path.join(dir, PENDING);
  if (!fs.existsSync(pending)) return null;
  const { entries, summary } = await readBackup(await fsp.readFile(pending));
  const kept = await keepFolder(dataDir, 'restore', now);
  try {
    await moveState(dataDir, kept);
  } catch (e) {
    await dropFolder(kept);
    throw e;
  }
  const last = path.join(dir, LAST);
  // an earlier restore's note, put back when this one changes nothing (review of #47)
  const earlier = fs.existsSync(last) ? await fsp.readFile(last) : null;
  try {
    writeJson(last, { created: summary.created, at: now.toISOString(), undo: path.basename(kept) });
    await applyBackup(dataDir, entries);
  } catch (e) {
    try {
      // what of the backup went in goes (it is still in the file), what was there comes back
      for (const [sub, f] of await stateFiles(dataDir))
        await fsp.rm(path.join(dataDir, sub, f), { force: true });
      await moveState(kept, dataDir);
    } catch {
      throw e; // the note stays: «Повернути як було» brings the kept state back
    }
    await dropFolder(kept);
    if (earlier) await put(last, earlier);
    else await fsp.rm(last, { force: true });
    throw e;
  }
  await fsp.rm(pending, { force: true });
  await prune(dataDir, 'restore', path.basename(kept));
  return summary;
}

/**
 * «Повернути як було»: the state the last restore replaced, moved back. What is there now — the
 * restored state and whatever was changed since — is moved out first (data/backups/before-undo-…),
 * so going back loses nothing either (review of #47). Either move failing puts everything back
 * where it was, and the way back stays offered. The UI state goes in last, stamped as the
 * newest. False: nothing to go back to.
 */
export async function undoRestore(dataDir: string, now = new Date()): Promise<boolean> {
  const last = lastRestore(dataDir, now.getTime());
  if (!last) return false;
  const dir = backupsDir(dataDir);
  const from = path.join(dir, last.undo);
  const kept = await keepFolder(dataDir, 'undo', now);
  try {
    await moveState(dataDir, kept);
  } catch (e) {
    await dropFolder(kept);
    throw e;
  }
  try {
    await moveState(from, dataDir);
  } catch (e) {
    await moveState(kept, dataDir).catch(() => undefined);
    await dropFolder(kept);
    throw e;
  }
  // the way back is spent: an error after this point must not offer it again — a retry would
  // move what just came back out (review of #47)
  await fsp.rm(path.join(dir, LAST), { force: true });
  const ui = readJson<Record<string, { value?: unknown }> | null>(path.join(from, UI_FILE), null);
  if (ui && typeof ui === 'object') writeUiState(dataDir, ui);
  await fsp.rm(from, { recursive: true, force: true }).catch(() => undefined);
  await prune(dataDir, 'undo', path.basename(kept));
  return true;
}

/** A file name for a backup made at `now`: VerseOrchestrator-backup-2026-10-01-1405.zip */
export function backupName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `VerseOrchestrator-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.zip`;
}
