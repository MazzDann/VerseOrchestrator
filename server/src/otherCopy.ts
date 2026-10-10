import fs from 'node:fs';
import path from 'node:path';
import { collect, replaceState, summarize, type BackupSummary, type Extra } from './backup.js';
import {
  bundlesIn,
  copyFolderOf,
  dataChanged,
  isFile,
  peek,
  resolveCopy,
  sameFolder,
  siblingCopies,
  UI_FILE,
  type FoundCopy,
} from './copyFinder.js';
import { KNOWN_BROWSERS } from './browsers.js';
import { sanitizeServerSettings } from './serverSettings.js';
import { compareVersions, parseVersion } from './updates.js';

/**
 * «Перенести з іншої копії…» (1.12.0-beta.2, the user's idea of 2026-10-10): another copy of the
 * app on this computer — an older folder that updated itself, a fresh zip unpacked beside it —
 * hands its things over to this one. The user's case on the test Windows: a new copy started with
 * an empty data/ (no browser choice, no pairings, no look), while everything stayed in the old one.
 *
 * What it carries, in three parts the operator picks: the operator's things (the UI state, the
 * song bundles, the pictures, the albums' and videos' lists — what a backup carries, plus the
 * lists), the start settings (browser, port and idle stop, updates; not the modules to build —
 * they name this copy's own modules/ files) and the speaker remotes' pairings (only here: from a
 * folder on this computer, merged with this copy's; never through a .zip). It goes through the
 * restore's machinery (backup.ts replaceState): the state it replaces is kept, «Повернути як
 * було» brings it back, the UI state is stamped as the newest.
 */

/** Another copy as the operator sees it before carrying anything over. */
export interface CopyInfo {
  /** the copy's folder: the release folder around app/ and data/, or a clone */
  folder: string;
  dataDir: string;
  /** its version (app/package.json), null when only a data folder was named */
  version: string | null;
  /** its waiter holds this copy's port: it is the one that runs */
  running: boolean;
  /** newer than this copy: some of its data this version may not read */
  newer: boolean;
  /** when its data last changed (ms), null when nothing there has a time */
  changed: number | null;
  /** the browser chosen there («Відкривати вікно керування в…») by name, null for the system's */
  browser: string | null;
  settings: boolean;
  look: boolean;
  pairings: number;
  bundles: number;
  pictures: number;
  programs: number;
  albums: number;
  videos: number;
}

/** What the operator carries over. */
export interface CopyParts {
  /** the UI state, the songs, the pictures, the albums' and videos' lists */
  things: boolean;
  /** browser, port and idle stop, updates */
  launch: boolean;
  /** the speaker remotes' pairings */
  pairings: boolean;
}

const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);

/** What a copy holds, for the operator to see before carrying it over. */
export function describeCopy(found: FoundCopy, app: string, running = false): CopyInfo {
  const { root, dataDir } = found;
  const at = (n: string) => path.join(dataDir, n);
  const version = root
    ? ((peek(path.join(root, 'package.json')) as { version?: unknown } | null)?.version ?? null)
    : null;
  const settings = peek(at('settings.json')) as { launch?: { browser?: unknown } } | null;
  const secrets = peek(at('secrets.json')) as { remotes?: unknown } | null;
  const ui = peek(at(UI_FILE)) as Record<string, { value?: unknown }> | null;
  let programs = 0;
  try {
    const playlist = JSON.parse(String(ui?.['vo:playlist']?.value ?? '{}')) as {
      state?: { saved?: unknown };
    };
    programs = count(playlist.state?.saved);
  } catch {
    /* none */
  }
  const index = peek(at(path.join('images', 'index.json'))) as { images?: unknown } | null;
  const bundles = bundlesIn(dataDir);
  const changed = dataChanged(dataDir);
  const v = typeof version === 'string' && parseVersion(version) ? version : null;
  const browser = settings?.launch?.browser;
  return {
    folder: copyFolderOf(found),
    dataDir,
    version: v,
    running,
    newer: v !== null && parseVersion(app) !== null && compareVersions(v, app) > 0,
    changed,
    browser:
      typeof browser === 'string' && browser !== 'system'
        ? (KNOWN_BROWSERS.find((b) => b.id === browser)?.name ?? browser)
        : null,
    settings: settings !== null,
    look: typeof ui?.['vo:settings']?.value === 'string',
    pairings: count(secrets?.remotes),
    bundles: bundles.length,
    pictures: count(index?.images),
    programs,
    albums: count((peek(at('albums.json')) as { albums?: unknown } | null)?.albums),
    videos: count((peek(at('videos.json')) as { videos?: unknown } | null)?.videos),
  };
}

/** The app root the waiter on `port` serves (1.11.1+ say it), null when none answers. */
export async function waiterRoot(port: number, timeoutMs = 1500): Promise<string | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/__standby`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await res.json()) as { root?: unknown };
    return typeof body.root === 'string' ? body.root : null;
  } catch {
    return null;
  }
}

/**
 * The other copies of this computer: the one whose waiter holds `port` (it runs), the ones
 * beside this copy (siblings of its folder, one level down for a nested «Extract All»). Never
 * this copy's own data. The running one first, then the most recently changed.
 */
export async function findCopies(o: {
  root: string;
  dataDir: string;
  port: number;
  app: string;
}): Promise<CopyInfo[]> {
  const found = new Map<string, CopyInfo>();
  const add = (where: FoundCopy | null, running = false) => {
    if (!where || sameFolder(where.dataDir, o.dataDir)) return;
    const key = path.resolve(where.dataDir).toLowerCase();
    if (!found.has(key)) found.set(key, describeCopy(where, o.app, running));
  };
  const running = await waiterRoot(o.port);
  if (running) add(resolveCopy(running), true);
  for (const c of siblingCopies(o.root, o.dataDir)) add(c);
  return [...found.values()].sort(
    (a, b) => Number(b.running) - Number(a.running) || (b.changed ?? 0) - (a.changed ?? 0),
  );
}

/**
 * This copy's start settings with the other copy's browser, port and idle stop, updates and
 * remote persistence. The modules to build stay this copy's (they name its own modules/ files),
 * and so does anything else the file holds (the builder writes there too).
 */
export function mergedSettings(ours: unknown, theirs: unknown): Record<string, unknown> {
  const t = sanitizeServerSettings(theirs);
  const base = ours && typeof ours === 'object' ? (ours as Record<string, unknown>) : {};
  return {
    ...base,
    version: 1,
    remotes: t.remotes,
    standby: t.standby,
    updates: t.updates,
    launch: t.launch,
  };
}

interface StoredPairing {
  id: string;
  tokenHash: string;
}
const pairingsOf = (raw: unknown): StoredPairing[] =>
  ((raw as { remotes?: unknown } | null)?.remotes instanceof Array
    ? ((raw as { remotes: unknown[] }).remotes as StoredPairing[])
    : []
  ).filter(
    (p) => p && typeof p.id === 'string' && /^[0-9a-f]{64}$/.test(String(p.tokenHash ?? '')),
  );

/** This copy's pairings and the other copy's (one already here — by id or token — stays). */
export function mergedPairings(ours: unknown, theirs: unknown): { version: 1; remotes: unknown[] } {
  const kept = pairingsOf(ours);
  const ids = new Set(kept.map((p) => p.id));
  const hashes = new Set(kept.map((p) => p.tokenHash));
  const added = pairingsOf(theirs).filter((p) => !ids.has(p.id) && !hashes.has(p.tokenHash));
  return { version: 1, remotes: [...kept, ...added] };
}

const json = (v: unknown) => Buffer.from(JSON.stringify(v, null, 2) + '\n');

/**
 * Carry the parts over from the copy whose data is in `from` into `dataDir`. Returns what the
 * operator's things held (the summary a restore says), or null when they weren't carried.
 */
export async function importCopy(
  dataDir: string,
  from: FoundCopy,
  parts: CopyParts,
  app: string,
  now = new Date(),
  applied?: () => void,
): Promise<BackupSummary | null> {
  const extras: Partial<Record<Extra, Buffer>> = {};
  const own = (n: string) => peek(path.join(dataDir, n));
  const theirs = (n: string) => peek(path.join(from.dataDir, n));
  let settings: Record<string, unknown> | null = null;
  if (parts.launch) settings = mergedSettings(own('settings.json'), theirs('settings.json'));
  if (parts.pairings) {
    extras['secrets.json'] = json(mergedPairings(own('secrets.json'), theirs('secrets.json')));
    // pairings carried over are kept across restarts, whatever this copy had chosen
    settings ??= { ...((own('settings.json') as object | null) ?? {}) };
    settings.remotes = { persist: true };
  }
  if (settings) extras['settings.json'] = json(settings);
  const info = describeCopy(from, app);
  const made = {
    app: info.version ?? '',
    created: new Date(info.changed ?? now.getTime()).toISOString(),
  };
  let entries = null;
  if (parts.things) {
    // nothing packed: the files are read straight from the other folder, no size limit
    entries = (await collect(from.dataDir, app, now, Infinity)).filter(
      (e) => e.name !== 'manifest.json',
    );
    for (const n of ['albums.json', 'videos.json'] as const) {
      const file = path.join(from.dataDir, n);
      if (isFile(file)) extras[n] = fs.readFileSync(file);
    }
  }
  const summary = summarize(entries ?? [], made);
  await replaceState(dataDir, entries, summary, now, {
    kind: 'import',
    applied,
    from: info.folder,
    extras,
  });
  return entries ? summary : null;
}

export { resolveCopy, sameFolder };
