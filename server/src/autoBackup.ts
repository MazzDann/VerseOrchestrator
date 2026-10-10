import fsp from 'node:fs/promises';
import path from 'node:path';
import { BackupError, backupEntries, backupsDir, compressed } from './backup.js';
import { zipToFile } from './zip.js';

/**
 * Automatic backups (1.12.0-beta.3, the user's answers of 2026-10-10): once a day, at the app's
 * first start that day, and before a version change (an update, «Повернути версію», a version
 * picked in the list) — the moment data is most at risk. The same .zip as «Зберегти копію»
 * (backup.ts collect: the UI state with the start settings, the songs, the pictures), kept in
 * data/backups/auto/: the last 7 daily ones and the last 3 made before a version change. A copy
 * whose pictures would pass 1 GB is made without them (its manifest says so; restoring it leaves
 * the pictures there are as they are). Nothing here ever blocks an update: a backup that fails is
 * logged and the update goes on.
 */

export type AutoKind = 'daily' | 'update';
/** how many of each kind stay */
export const AUTO_KEEP: Record<AutoKind, number> = { daily: 7, update: 3 };
const AUTO = 'auto';

export const autoDir = (dataDir: string) => path.join(backupsDir(dataDir), AUTO);

/** An automatic backup as the operator sees it. */
export interface AutoBackup {
  /** its file name in data/backups/auto/ */
  name: string;
  kind: AutoKind;
  /** when it was made (ISO, from the name — local time as the name has it) */
  created: string;
  /** the version that made it */
  app: string;
  /** the version it was made before changing to (an update / rollback), when known */
  to?: string;
  size: number;
  /** false: made without the pictures (they'd have passed 1 GB) */
  pictures: boolean;
}

const VERSION = '[0-9A-Za-z.+]+(?:-[0-9A-Za-z.+]+)*?';
/** auto-<kind>-<YYYY-MM-DD-HHMMSS>-<app>[-to-<version>][-no-pictures].zip */
const NAME = new RegExp(
  `^auto-(daily|update)-(\\d{4})-(\\d{2})-(\\d{2})-(\\d{2})(\\d{2})(\\d{2})-(${VERSION})(?:-to-(${VERSION}))?(-no-pictures)?\\.zip$`,
);
/** A version as it may stand in a file name. */
const safe = (v: string) => v.replace(/[^0-9A-Za-z.+-]/g, '');

const p2 = (n: number) => String(n).padStart(2, '0');
/** local time, as the operator reads the folder: 2026-10-10-091502 */
const stamp = (d: Date) =>
  `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;

/** What a file name says, or null for a file that isn't one of these. */
export function parseAutoName(name: string): Omit<AutoBackup, 'size'> | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const [, kind, y, mo, d, h, mi, s, app, to, noPictures] = m;
  const created = new Date(+y, +mo - 1, +d, +h, +mi, +s);
  if (Number.isNaN(created.getTime())) return null;
  return {
    name,
    kind: kind as AutoKind,
    created: created.toISOString(),
    app,
    ...(to ? { to } : {}),
    pictures: !noPictures,
  };
}

/** The automatic backups there are, newest first. */
export async function listAutoBackups(dataDir: string): Promise<AutoBackup[]> {
  let names: string[] = [];
  try {
    names = await fsp.readdir(autoDir(dataDir));
  } catch {
    return [];
  }
  const found: AutoBackup[] = [];
  for (const name of names) {
    const info = parseAutoName(name);
    if (!info) continue;
    const size = await fsp.stat(path.join(autoDir(dataDir), name)).then(
      (st) => (st.isFile() ? st.size : -1),
      () => -1,
    );
    if (size >= 0) found.push({ ...info, size });
  }
  return found.sort((a, b) => b.created.localeCompare(a.created) || b.name.localeCompare(a.name));
}

/** No daily backup made today (local date) yet. */
export function dailyDue(list: AutoBackup[], now = new Date()): boolean {
  const today = stamp(now).slice(0, 10);
  return !list.some((b) => b.kind === 'daily' && stamp(new Date(b.created)).slice(0, 10) === today);
}

/**
 * Make an automatic backup of `dataDir` now: with the pictures, or without them when they'd pass
 * 1 GB. The oldest of its kind go after it (AUTO_KEEP). Run it through backup.ts oneAtATime, as
 * every backup work is.
 */
export async function makeAutoBackup(
  dataDir: string,
  app: string,
  kind: AutoKind,
  { now = new Date(), to }: { now?: Date; to?: string } = {},
): Promise<AutoBackup> {
  let pictures = true;
  let entries;
  try {
    entries = await backupEntries(dataDir, app, now);
  } catch (e) {
    if (!(e instanceof BackupError) || e.message !== 'too big') throw e;
    entries = await backupEntries(dataDir, app, now, { pictures: false });
    pictures = false;
  }
  const name = `auto-${kind}-${stamp(now)}-${safe(app) || 'dev'}${to ? `-to-${safe(to)}` : ''}${
    pictures ? '' : '-no-pictures'
  }.zip`;
  await fsp.mkdir(autoDir(dataDir), { recursive: true });
  // streamed: one picture in memory at a time, never the whole backup (it runs next to the hub)
  const size = await zipToFile(path.join(autoDir(dataDir), name), entries, now, compressed);
  await pruneAuto(dataDir, kind, name);
  return { ...parseAutoName(name)!, size };
}

/**
 * The oldest of a kind go: AUTO_KEEP stay, the one just made always among them. Best effort — one
 * that can't go now goes next time.
 */
async function pruneAuto(dataDir: string, kind: AutoKind, keep: string): Promise<void> {
  const others = (await listAutoBackups(dataDir)).filter((b) => b.kind === kind && b.name !== keep);
  for (const old of others.slice(AUTO_KEEP[kind] - 1))
    await fsp.rm(path.join(autoDir(dataDir), old.name), { force: true }).catch((e: Error) => {
      console.warn(`[server] backup: an old automatic copy stays for now: ${e.message}`);
    });
}

/** An automatic backup's bytes by its name — only a name of these, never a path. */
export async function readAutoBackup(dataDir: string, name: unknown): Promise<Buffer | null> {
  if (typeof name !== 'string' || !parseAutoName(name)) return null;
  return fsp.readFile(path.join(autoDir(dataDir), name)).catch(() => null);
}
