import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { assertWritable, readJson, writeJson } from './jsonFile.js';
import { KNOWN_BROWSERS } from './browsers.js';
import { carriedSettings, sanitizeServerSettings } from './serverSettings.js';
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
/** which checked file pending.zip is: the page restores the one its card shows */
const PENDING_ID = 'pending.id';
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
  /**
   * false: made without the pictures (1.12.0-beta.3 — an automatic copy whose pictures would pass
   * 1 GB); a restore then leaves this copy's pictures as they are. Absent: they are in it.
   */
  pictures?: false;
}

/**
 * The start settings (browser, port and idle stop, updates — 1.12.0-beta.3) ride inside the
 * backup's UI state as one more entry: a version before it restores the file as it always did
 * (it refuses any file name it doesn't know, but keeps an unknown UI entry), and ignores it.
 */
export const START_KEY = 'vo:start-settings';

/**
 * In a copy made without the pictures: a file no version before 1.12.0-beta.3 accepts, so they
 * refuse the whole copy — they ignore `manifest.pictures`, and their restore would move this
 * copy's pictures aside and put none back (review of 1.12.0-beta.3).
 */
const NO_PICTURES = 'no-pictures.txt';
// the marker file's own text, in both languages: someone opening the .zip reads it
const NO_PICTURES_TEXT =
  'Ця копія зроблена без зображень (вони займали б понад 1 ГБ). Відновлення лишає зображення, які є.\n' + // i18n-ignore
  'This backup was made without the images (they would take over 1 GB). A restore keeps the images there are.\n';

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
  /** the pictures are in it (false: made without them — this copy's stay as they are) */
  withPictures: boolean;
  /** the start settings it carries (1.12.0-beta.3): the browser chosen and the port */
  start: { browser: string; port: number } | null;
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

/** The operator's files of a data folder: [name in a backup, path] — UI state, songs, pictures. */
async function ownFiles(dataDir: string, pictures = true): Promise<[string, string][]> {
  const files: [string, string][] = [];
  const ui = path.join(dataDir, UI_FILE);
  // asynchronous: another copy's folder may be on a slow or sleeping drive (stateEntries)
  if (
    await fsp.stat(ui).then(
      (s) => s.isFile(),
      () => false,
    )
  )
    files.push([UI_FILE, ui]);
  const songs = path.join(dataDir, SONGS);
  for (const f of await filesIn(songs, bundleFile))
    files.push([`${SONGS}/${f}`, path.join(songs, f)]);
  const images = path.join(dataDir, IMAGES);
  if (pictures)
    for (const f of await filesIn(images, own))
      files.push([`${IMAGES}/${f}`, path.join(images, f)]);
  return files;
}

/**
 * The start settings a backup carries: this copy's browser, port and idle stop, updates — not its
 * modules (they name its own modules/ files) nor its remote persistence. Null: no settings file.
 */
function startSettings(dataDir: string): Record<string, unknown> | null {
  const raw = readJson<unknown>(path.join(dataDir, 'settings.json'), null);
  if (!raw || typeof raw !== 'object') return null;
  const s = sanitizeServerSettings(raw);
  return { standby: s.standby, updates: s.updates, launch: s.launch };
}

/**
 * What goes into a backup of `dataDir`, the manifest first, the songs and pictures by their files
 * (read when packed — an automatic copy streams them, zip.ts zipToFile); over 1 GB is
 * BackupError('too big'). `pictures: false` leaves the pictures out (an automatic copy that
 * would pass 1 GB, 1.12.0-beta.3). The UI state carries the start settings too (START_KEY).
 */
export async function backupEntries(
  dataDir: string,
  app: string,
  now = new Date(),
  { pictures = true }: { pictures?: boolean } = {},
): Promise<StateEntry[]> {
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: 1,
    app,
    created: now.toISOString(),
  };
  if (!pictures) manifest.pictures = false;
  const files = await ownFiles(dataDir, pictures);
  let total = 0;
  for (const [, p] of files) total += (await fsp.stat(p)).size;
  if (total > MAX_BACKUP_BYTES) throw new BackupError('too big');
  const out: StateEntry[] = [
    { name: MANIFEST, data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') },
  ];
  // the UI state, with the start settings as one more entry (START_KEY); a file held by another
  // program fails the backup as before (read as bytes), one that isn't JSON goes in as it is
  const uiFile = files.find(([name]) => name === UI_FILE)?.[1];
  // a file held a moment (an antivirus, the indexer) is tried again; one held longer fails the
  // backup, as before (review of 1.12.0-beta.3)
  const raw = uiFile ? await held(() => fsp.readFile(uiFile)) : null;
  let ui: Record<string, unknown> | null = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw.toString('utf8').replace(/^\uFEFF/, '')) : {};
    ui = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    ui = null;
  }
  // a UI state that isn't JSON stays out — the songs and pictures stay restorable; with it in,
  // every restore of the copy was refused as damaged (review of 1.12.0-beta.3)
  if (raw && !ui)
    console.warn(`[server] backup: ${UI_FILE} is not valid JSON — the backup goes without it`);
  const start = startSettings(dataDir);
  if (ui && (raw || start)) {
    const state = { ...ui };
    delete state[START_KEY];
    if (start) state[START_KEY] = { value: JSON.stringify(start), at: now.getTime() };
    out.push({ name: UI_FILE, data: Buffer.from(JSON.stringify(state)) });
  }
  if (!pictures) out.push({ name: NO_PICTURES, data: Buffer.from(NO_PICTURES_TEXT) });
  for (const [name, p] of files) if (name !== UI_FILE) out.push({ name, file: p });
  return out;
}

/** A backup's entries with their bytes, for the .zip made in memory (`Зберегти копію`). */
export async function collect(
  dataDir: string,
  app: string,
  now = new Date(),
  opts: { pictures?: boolean } = {},
): Promise<ZipEntry[]> {
  const out: ZipEntry[] = [];
  for (const e of await backupEntries(dataDir, app, now, opts))
    out.push({ name: e.name, data: e.data ?? (await fsp.readFile(e.file!)) });
  return out;
}

/** The start settings a backup's entries carry (START_KEY inside the UI state), or null. */
export function startOf(entries: StateEntry[]): Record<string, unknown> | null {
  const ui = entries.find((e) => e.name === UI_FILE)?.data;
  if (!ui) return null;
  try {
    const state = JSON.parse(ui.toString('utf8')) as Record<string, { value?: unknown }>;
    const value = state[START_KEY]?.value;
    const start = typeof value === 'string' ? (JSON.parse(value) as unknown) : null;
    return start && typeof start === 'object' ? (start as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * A file to put in place: its bytes (a backup's .zip) or the file they are copied from (another
 * copy's folder, 1.12.0-beta.2 — copied on disk, never held in memory).
 */
export interface StateEntry {
  name: string;
  data?: Buffer;
  file?: string;
}

/** The UI state and the pictures' index of another copy are read: larger ones are not its own. */
const SMALL_MAX = 64 * 1024 * 1024;

/**
 * Another copy's state to put in place («Перенести з іншої копії…», 1.12.0-beta.2): its songs and
 * pictures as files to copy — no size limit, nothing read into memory (a copy with gigabytes of
 * pictures must not take the hub down) —, its UI state and pictures' index read (the summary
 * needs them). A songs or images folder that links out of that data folder is left out, and so
 * is a linked UI state: the operator named this folder, not where its links lead.
 */
export async function stateEntries(dataDir: string): Promise<StateEntry[]> {
  const real = await fsp.realpath(dataDir).catch(() => null);
  if (!real) return [];
  const within = new Map<string, boolean>();
  const inside = async (sub: string) => {
    if (!within.has(sub)) {
      const r = await fsp.realpath(path.join(dataDir, sub)).catch(() => null);
      within.set(sub, r !== null && r.startsWith(real + path.sep));
    }
    return within.get(sub)!;
  };
  const out: StateEntry[] = [];
  for (const [name, file] of await ownFiles(dataDir)) {
    const small = name === UI_FILE || name === `${IMAGES}/index.json`;
    if (name !== UI_FILE && !(await inside(name.split('/')[0]))) continue;
    if (!small) {
      out.push({ name, file });
      continue;
    }
    const st = await fsp.lstat(file).catch(() => null);
    if (!st?.isFile() || st.size > SMALL_MAX) continue;
    out.push({ name, data: await fsp.readFile(file) });
  }
  return out;
}

/** A picture's file is compressed already: stored as it is (deflate would only cost time). */
export const compressed = (name: string) =>
  name.startsWith(`${IMAGES}/`) && !name.endsWith('.json');

export async function makeBackup(dataDir: string, app: string, now = new Date()): Promise<Buffer> {
  return zip(await collect(dataDir, app, now), now, compressed);
}

/** Only these names are restored: never a path out of data/, never another file of it. */
const ALLOWED = [
  /^manifest\.json$/,
  /^ui-state\.json$/,
  /^songs\/[^/\\.][^/\\]*\.vosongs$/,
  /^images\/[^/\\.][^/\\]*$/,
  /^no-pictures\.txt$/,
];
const allowed = (name: string) =>
  !name.includes('..') && !name.includes('\0') && ALLOWED.some((r) => r.test(name));

const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/**
 * A backup as it was made, from one an archiver made again: Safari on a Mac unpacks a
 * downloaded .zip, and Finder's «Стиснути» puts the folder's name before every entry and adds
 * __MACOSX/._* and .DS_Store. Those are dropped — never written — and the one top folder taken
 * off (review of #47).
 */
function asMade(entries: ZipEntry[]): ZipEntry[] {
  const kept = entries.filter(
    (e) => !e.name.startsWith('__MACOSX/') && !(e.name.split('/').pop() ?? '').startsWith('.'),
  );
  if (kept.some((e) => e.name === MANIFEST)) return kept;
  const top = kept.find((e) => e.name.endsWith(`/${MANIFEST}`))?.name.slice(0, -MANIFEST.length);
  if (!top || top.slice(0, -1).includes('/') || !kept.every((e) => e.name.startsWith(top)))
    return kept;
  return kept.map((e) => ({ ...e, name: e.name.slice(top.length) }));
}

/** Read a backup file: its entries and what it holds. Refuses anything else. */
export async function readBackup(
  buf: Buffer,
): Promise<{ entries: ZipEntry[]; summary: BackupSummary }> {
  let entries: ZipEntry[];
  try {
    entries = asMade(await unzip(buf, MAX_BACKUP_BYTES + 16 * 1024 * 1024));
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
  return { entries, summary: summarize(entries, manifest) };
}

/** What backup entries hold (readBackup; another copy's data, otherCopy.ts). */
export function summarize(entries: StateEntry[], manifest: Partial<BackupManifest>): BackupSummary {
  let settings = false;
  let programs = 0;
  let items = 0;
  const ui = entries.find((e) => e.name === UI_FILE)?.data;
  if (ui) {
    try {
      const state = JSON.parse(ui.toString('utf8')) as Record<string, { value?: string }>;
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
  const index = entries.find((e) => e.name === `${IMAGES}/index.json`)?.data;
  let pictures = 0;
  try {
    pictures = index ? count(JSON.parse(index.toString('utf8')).images) : 0;
  } catch {
    throw new BackupError('damaged');
  }
  const start = startOf(entries);
  const launch = start ? sanitizeServerSettings(start) : null;
  return {
    app: String(manifest.app ?? ''),
    created: String(manifest.created ?? ''),
    settings,
    programs,
    items,
    bundles,
    pictures,
    withPictures: manifest.pictures !== false && !entries.some((e) => e.name === NO_PICTURES),
    // the browser by the name the settings list it under («system» stays: the page says it)
    start: launch
      ? {
          browser:
            KNOWN_BROWSERS.find((b) => b.id === launch.launch.browser)?.name ??
            launch.launch.browser,
          port: launch.standby.port,
        }
      : null,
  };
}

/**
 * Write a file atomically (temp + rename), its folder made: from bytes, or copied from another
 * file. A write that fails — a full disk — leaves no temp file behind (review of 1.12.0-beta.2).
 */
async function put(file: string, data: Buffer | { from: string }): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    if (Buffer.isBuffer(data)) await fsp.writeFile(tmp, data);
    else await fsp.copyFile(data.from, tmp);
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
 * it is only for the UI state. `beforeUi` runs between the two (an import's own files of data/,
 * replaceState): the UI state stays the last step. Returns the time the UI state was stamped with.
 */
export async function applyBackup(
  dataDir: string,
  entries: StateEntry[],
  beforeUi?: () => Promise<void>,
  subs: readonly Sub[] = BOTH,
): Promise<number> {
  const songs = path.join(dataDir, SONGS);
  for (const f of await filesIn(songs, bundleFile)) await fsp.rm(path.join(songs, f));
  // a backup made without the pictures leaves this copy's as they are (1.12.0-beta.3)
  const images = path.join(dataDir, IMAGES);
  if (subs.includes(IMAGES))
    for (const f of await filesIn(images, own)) await fsp.rm(path.join(images, f));
  for (const e of entries) {
    const sub = e.name.split('/')[0];
    if (e.name === sub || !subs.includes(sub as Sub)) continue;
    const to = path.join(dataDir, ...e.name.split('/'));
    if (e.data) await put(to, e.data);
    else if (e.file) await put(to, { from: e.file });
  }
  await beforeUi?.();
  const ui = entries.find((e) => e.name === UI_FILE)?.data;
  const state = ui ? (JSON.parse(ui.toString('utf8')) as Record<string, { value?: unknown }>) : {};
  delete state[START_KEY];
  // a UI state that held only the start settings is none: this copy's stays as it is
  return Object.keys(state).length > 0 ? writeUiState(dataDir, state) : Date.now();
}

/** The UI state written, stamped with the time it is written; returns that time. */
function writeUiState(dataDir: string, state: Record<string, { value?: unknown }>): number {
  const at = Date.now();
  const fresh: Record<string, { value: string; at: number }> = {};
  for (const [key, entry] of Object.entries(state))
    if (key !== START_KEY && entry && typeof entry.value === 'string')
      fresh[key] = { value: entry.value, at };
  // a restore's own content, not made from reading the file it replaces
  writeJson(path.join(dataDir, UI_FILE), fresh, { replace: true });
  return at;
}

export const backupsDir = (dataDir: string) => path.join(dataDir, BACKUPS);

/**
 * A file sent to restore, kept until it is restored or another one comes; returns its id — the
 * restore names it, so a file another window checked since is never restored in its place
 * (review of #47).
 */
export async function keepPending(dataDir: string, buf: Buffer): Promise<string> {
  const id = crypto.randomUUID();
  await put(path.join(backupsDir(dataDir), PENDING), buf);
  await put(path.join(backupsDir(dataDir), PENDING_ID), Buffer.from(id));
  return id;
}

/** What a restore is told besides the time. */
export interface RestoreOptions {
  /** the checked file's id (keepPending): another one pending means nothing is restored */
  id?: string;
  /**
   * Called right after the UI state is written, before the slow cleanup: the windows must take
   * the restored state before any of them sends its old one back (review of #47).
   */
  applied?: () => void;
}

export interface LastRestore {
  /** when the restored backup was made */
  created: string;
  /** when it was restored */
  at: string;
  /** the state it replaced, in data/backups/ */
  undo: string;
  /** how many songs and pictures were moved there: a folder holding another number offers nothing */
  files?: number;
  /** «Перенести з іншої копії…» (1.12.0-beta.2): the other copy's folder */
  from?: string;
  /** an import without the operator's things: the songs, pictures and UI state stayed as they were */
  state?: false;
  /** the folders moved when not both (a backup made without the pictures: songs only) */
  subs?: string[];
  /**
   * Files of data/ itself the import wrote (EXTRAS): «Повернути як було» puts back the ones kept
   * in the folder and removes the ones this copy didn't have.
   */
  extras?: string[];
  /**
   * The speaker remotes' pairings the import added (their ids): «Повернути як було» drops only
   * these — a phone paired since stays paired (review of 1.12.0-beta.2).
   */
  pairings?: string[];
}

/**
 * Files of data/ itself an import may write besides the UI state, the songs and the pictures: the
 * start settings, the albums' and videos' lists. Not the pairings: the remote store adds them
 * itself (remote.ts adoptPairings) — it saves its own file, and a write here could cross its own.
 */
export const EXTRAS = ['settings.json', 'albums.json', 'videos.json'] as const;
export type Extra = (typeof EXTRAS)[number];
const isExtra = (n: unknown): n is Extra => EXTRAS.includes(n as Extra);

/** The last restore while «Повернути як було» is offered: a day, and while its folder is there. */
export function lastRestore(dataDir: string, now = Date.now()): LastRestore | null {
  const last = readJson<LastRestore | null>(path.join(backupsDir(dataDir), LAST), null);
  if (
    !last ||
    typeof last.undo !== 'string' ||
    !/^before-(?:restore|import)-[\w-]+$/.test(last.undo)
  )
    return null;
  if (!(now - Date.parse(last.at) < UNDO_FOR_MS)) return null;
  const folder = path.join(backupsDir(dataDir), last.undo);
  try {
    if (!fs.statSync(folder).isDirectory()) return null;
  } catch {
    return null;
  }
  // a folder emptied by a rollback whose note stayed: going «back» would only move the current
  // songs and pictures out (review of #47)
  if (typeof last.files === 'number' && countState(folder) !== last.files) return null;
  return last;
}

/** How many songs and pictures a kept folder holds (as stateFiles counts them). */
function countState(folder: string): number {
  const count = (sub: string, keep: (name: string) => boolean) => {
    try {
      return fs
        .readdirSync(path.join(folder, sub), { withFileTypes: true })
        .filter((e) => e.isFile() && keep(e.name)).length;
    } catch {
      return 0;
    }
  };
  return count(SONGS, bundleFile) + count(IMAGES, own);
}

const stamp = (now: Date) => now.toISOString().replace(/[:.]/g, '-');

/** `work` tried again while the file is held a moment (HELD), for a second at most. */
async function held<T>(work: () => Promise<T>): Promise<T> {
  for (let tries = 1; ; tries++) {
    try {
      return await work();
    } catch (e) {
      if (!HELD.has((e as NodeJS.ErrnoException).code ?? '') || tries >= 10) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

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
type Sub = typeof SONGS | typeof IMAGES;
const BOTH: readonly Sub[] = [SONGS, IMAGES];

async function stateFiles(dir: string, subs: readonly Sub[] = BOTH): Promise<[string, string][]> {
  return [
    ...(subs.includes(SONGS) ? await filesIn(path.join(dir, SONGS), bundleFile) : []).map(
      (f): [string, string] => [SONGS, f],
    ),
    ...(subs.includes(IMAGES) ? await filesIn(path.join(dir, IMAGES), own) : []).map(
      (f): [string, string] => [IMAGES, f],
    ),
  ];
}

/**
 * Move the song bundles and the pictures of one data folder (or kept state) into another — all
 * of them or none: when one can't be moved, those already moved go back, and the error stands. A
 * state half moved was neither the old one nor the new one, and the way back lost files
 * (review of #47).
 */
async function moveState(from: string, to: string, subs: readonly Sub[] = BOTH): Promise<number> {
  const moved: [string, string][] = [];
  try {
    for (const [sub, f] of await stateFiles(from, subs)) {
      const a = path.join(from, sub, f);
      const b = path.join(to, sub, f);
      await move(a, b);
      moved.push([a, b]);
    }
  } catch (e) {
    for (const [a, b] of moved.reverse()) await move(b, a).catch(() => undefined);
    throw e;
  }
  return moved.length;
}

/**
 * A folder for the state about to be replaced, `data/backups/before-<kind>-<stamp>/`, the UI
 * state copied in (a backup without one leaves it as it is). The song bundles and the pictures
 * are moved in next (moveState), not packed into a zip: no copy in memory and no size limit — a
 * local zip over 2 GB could not even be read back (review of #47).
 */
type Kind = 'restore' | 'import' | 'undo';
async function keepFolder(
  dataDir: string,
  kind: Kind,
  now: Date,
  extras: readonly Extra[] = [],
): Promise<string> {
  const into = path.join(backupsDir(dataDir), `before-${kind}-${stamp(now)}`);
  await fsp.mkdir(into, { recursive: true });
  for (const name of [UI_FILE, ...extras]) {
    const file = path.join(dataDir, name);
    if (fs.existsSync(file)) await fsp.copyFile(file, path.join(into, name));
  }
  return into;
}

/**
 * The files of data/ itself an import wrote, as they were before it: from the kept folder, or
 * removed when this copy had none. Each one tried; the first error stands.
 */
async function putBackExtras(dataDir: string, kept: string, names: readonly Extra[]) {
  let failed: unknown = null;
  for (const name of names) {
    try {
      const old = path.join(kept, name);
      if (fs.existsSync(old)) await put(path.join(dataDir, name), { from: old });
      else await fsp.rm(path.join(dataDir, name), { force: true });
    } catch (e) {
      failed ??= e;
    }
  }
  if (failed) throw failed;
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
async function prune(dataDir: string, kind: Kind, keep: string): Promise<void> {
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
  { id, applied }: RestoreOptions = {},
): Promise<BackupSummary | null> {
  const dir = backupsDir(dataDir);
  const pending = path.join(dir, PENDING);
  if (!fs.existsSync(pending)) return null;
  if (id !== undefined && readText(path.join(dir, PENDING_ID)) !== id) return null;
  const { entries, summary } = await readBackup(await fsp.readFile(pending));
  const start = startOf(entries);
  await replaceState(dataDir, entries, summary, now, {
    kind: 'restore',
    applied,
    subs: summary.withPictures ? BOTH : [SONGS],
    extras: start ? { 'settings.json': () => carriedStart(dataDir, start) } : {},
  });
  for (const f of [pending, path.join(dir, PENDING_ID)])
    await fsp.rm(f, { force: true }).catch(() => undefined);
  return summary;
}

/**
 * This copy's settings file with the start settings a backup or another copy carries: its own
 * modules, remote persistence and other keys stay. Read when written, the way the app reads it;
 * one it can't read now is never written over — the restore stops and puts everything back.
 */
export function carriedStart(dataDir: string, start: unknown): Buffer {
  const file = path.join(dataDir, 'settings.json');
  const ours = readJson<unknown>(file, {});
  assertWritable(file);
  return Buffer.from(JSON.stringify(carriedSettings(ours, start), null, 2) + '\n');
}

/** What replaceState is told besides the state. */
export interface ReplaceOptions {
  kind: 'restore' | 'import';
  applied?: () => void;
  /** an import: the other copy's folder, for the note */
  from?: string;
  /**
   * An import: files of data/ itself (EXTRAS), each made right before it is written — from what
   * is there then, so a setting saved while the songs and pictures went in is not lost (review
   * of 1.12.0-beta.2); null: nothing to write. The current ones are kept first.
   */
  extras?: Partial<Record<Extra, () => Buffer | null>>;
  /** an import: the ids of the pairings it adds (`applied` adds them), for the note */
  pairings?: string[];
  /** the folders the new state has: songs and pictures, or songs alone (pictures: false) */
  subs?: readonly Sub[];
}

/**
 * Put `entries` in place of the current state (a restore, an import; null: an import of the
 * extras alone): the current state moved into a folder of its own (the way back) and the note
 * that offers it, then the new one. All of it or nothing: a failure on the way puts the current
 * state back — only when even that fails does the note stay, offering «Повернути як було»
 * (review of #47).
 */
export async function replaceState(
  dataDir: string,
  entries: StateEntry[] | null,
  summary: BackupSummary,
  now: Date,
  { kind, applied, from, extras = {}, pairings = [], subs = BOTH }: ReplaceOptions,
): Promise<void> {
  const dir = backupsDir(dataDir);
  const kept = await keepFolder(dataDir, kind, now);
  let files: number;
  try {
    files = entries ? await moveState(dataDir, kept, subs) : 0;
  } catch (e) {
    await dropFolder(kept).catch(() => undefined);
    throw e;
  }
  const last = path.join(dir, LAST);
  // an earlier restore's note, put back when this one changes nothing (review of #47)
  const earlier = fs.existsSync(last) ? await fsp.readFile(last) : null;
  const note: LastRestore = {
    created: summary.created,
    at: now.toISOString(),
    undo: path.basename(kept),
    files,
  };
  if (from) note.from = from;
  if (pairings.length) note.pairings = pairings;
  if (!entries) note.state = false;
  if (subs.length !== BOTH.length) note.subs = [...subs];
  // the files of data/ itself written so far: a failure puts back only these
  const written: Extra[] = [];
  const writeExtras = async () => {
    const made: [Extra, Buffer][] = [];
    for (const n of EXTRAS) {
      const data = extras[n]?.() ?? null;
      if (data) made.push([n, data]);
    }
    if (made.length === 0) return;
    for (const [n] of made) {
      const file = path.join(dataDir, n);
      if (fs.existsSync(file)) await fsp.copyFile(file, path.join(kept, n));
    }
    note.extras = made.map(([n]) => n);
    writeJson(last, note, { replace: true });
    for (const [n, data] of made) {
      written.push(n); // a write that fails midway is put back too
      await put(path.join(dataDir, n), data);
    }
  };
  try {
    writeJson(last, note, { replace: true }); // this restore's note, whatever the last one was
    // the UI state stays the last step: the extras go in between (applyBackup's beforeUi)
    if (entries) await applyBackup(dataDir, entries, writeExtras, subs);
    else await writeExtras();
  } catch (e) {
    // the songs and pictures first — moving them back needs no free space, the extras' writes
    // do (a full disk) —, then the extras; each tried whatever the other did (review of
    // 1.12.0-beta.2)
    let failed = false;
    if (entries)
      try {
        // what of the backup went in goes (it is still in the file), what was there comes back
        for (const [sub, f] of await stateFiles(dataDir, subs))
          await fsp.rm(path.join(dataDir, sub, f), { force: true });
        await moveState(kept, dataDir, subs);
      } catch {
        failed = true;
      }
    try {
      await putBackExtras(dataDir, kept, written);
    } catch {
      failed = true;
    }
    if (failed) throw e; // the note stays: «Повернути як було» brings the kept state back
    // the note first: an emptied folder must not stay offered (its count no longer matches,
    // lastRestore, should this fail too); the folder best effort; the real cause reported
    await (earlier ? put(last, earlier) : fsp.rm(last, { force: true })).catch(() => undefined);
    await dropFolder(kept).catch(() => undefined);
    throw e;
  }
  tell(applied);
  await prune(dataDir, kind, path.basename(kept));
}

/**
 * The state is in place: the caller is told (the windows, the library's songs). Its error fails
 * nothing — the restore stands, and a «try again» would restore it a second time and point the
 * way back at the restored state (review of #47).
 */
function tell(applied?: () => void) {
  try {
    applied?.();
  } catch (e) {
    console.warn(`[server] backup: after the restore: ${(e as Error).message}`);
  }
}

const readText = (file: string) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

/** What «Повернути як було» did, for the caller. */
export interface Undone {
  /** the pairings the import had added: the remote store drops them (remote.ts dropPairings) */
  pairings: string[];
  /** this copy had no UI state before: the one there now went too — the page goes to defaults */
  uiCleared: boolean;
}

/**
 * «Повернути як було»: the state the last restore replaced, moved back. What is there now — the
 * restored state and whatever was changed since — is moved out first (data/backups/before-undo-…),
 * so going back loses nothing either (review of #47). Either move failing puts everything back
 * where it was, and the way back stays offered. The UI state goes in last, stamped as the
 * newest. Null: nothing to go back to.
 */
export async function undoRestore(
  dataDir: string,
  now = new Date(),
  applied?: (done: Undone) => void,
): Promise<Undone | null> {
  const last = lastRestore(dataDir, now.getTime());
  if (!last) return null;
  const dir = backupsDir(dataDir);
  const from = path.join(dir, last.undo);
  const extras = (last.extras ?? []).filter(isExtra);
  // an import of the settings or the pairings alone left the songs, pictures and UI state alone
  const state = last.state !== false;
  // a restore of a backup without the pictures moved the songs only (1.12.0-beta.3)
  const subs = Array.isArray(last.subs) ? BOTH.filter((s) => last.subs!.includes(s)) : BOTH;
  const kept = await keepFolder(dataDir, 'undo', now, extras);
  try {
    if (state) await moveState(dataDir, kept, subs);
  } catch (e) {
    await dropFolder(kept).catch(() => undefined);
    throw e;
  }
  try {
    if (state) await moveState(from, dataDir, subs);
  } catch (e) {
    await moveState(kept, dataDir, subs).catch(() => undefined);
    await dropFolder(kept).catch(() => undefined);
    throw e;
  }
  try {
    await putBackExtras(dataDir, from, extras);
  } catch (e) {
    // as it was before the undo: the songs and pictures first, then the extras
    if (state) {
      await moveState(dataDir, from, subs).catch(() => undefined);
      await moveState(kept, dataDir, subs).catch(() => undefined);
    }
    await putBackExtras(dataDir, kept, extras).catch(() => undefined);
    await dropFolder(kept).catch(() => undefined);
    throw e;
  }
  // the way back is spent: an error after this point must not offer it again — a retry would
  // move what just came back out (review of #47)
  await fsp.rm(path.join(dir, LAST), { force: true });
  let uiCleared = false;
  if (state) {
    const before = path.join(from, UI_FILE);
    const ui = readJson<Record<string, { value?: unknown }> | null>(before, null);
    if (ui && typeof ui === 'object') writeUiState(dataDir, ui);
    else if (!fs.existsSync(before)) {
      // this copy had no UI state before (a fresh copy, the import's main case): the one there
      // now goes too — kept in before-undo —, and the page drops its copy (review of 1.12.0-beta.2)
      await fsp.rm(path.join(dataDir, UI_FILE), { force: true });
      uiCleared = true;
    }
  }
  const done: Undone = {
    pairings: (last.pairings ?? []).filter((id): id is string => typeof id === 'string'),
    uiCleared,
  };
  tell(() => applied?.(done));
  await fsp.rm(from, { recursive: true, force: true }).catch(() => undefined);
  await prune(dataDir, 'undo', path.basename(kept));
  return done;
}

/** A file name for a backup made at `now`: VerseOrchestrator-backup-2026-10-01-1405.zip */
export function backupName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `VerseOrchestrator-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.zip`;
}
