import fsp from 'node:fs/promises';
import path from 'node:path';
import { replaceState, stateEntries, summarize, type BackupSummary, type Extra } from './backup.js';
import { KNOWN_BROWSERS, sanitizeLaunch } from './browsers.js';
import {
  bundlesIn,
  copyFolderOf,
  dataChanged,
  peek,
  resolveCopy,
  sameFolder,
  siblingCopies,
  UI_FILE,
  type FoundCopy,
} from './copyFinder.js';
import { assertWritable, readJson } from './jsonFile.js';
import { knownPairing } from './remote.js';
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
 * they name this copy's own modules/ files — nor this copy's remote persistence) and the speaker
 * remotes' pairings (only here, only from a real copy — an app folder with its data —, added to
 * this copy's by the remote store; never through a .zip). It goes through the restore's
 * machinery (backup.ts replaceState): the state it replaces is kept, «Повернути як було» brings
 * it back — and drops just the pairings it added —, the UI state is stamped as the newest.
 */

/** Another copy as the operator sees it before carrying anything over. */
export interface CopyInfo {
  /** the copy's folder: the release folder around app/ and data/, or a clone */
  folder: string;
  dataDir: string;
  /** its version (app/package.json), null when only a data folder was named */
  version: string | null;
  /** an app folder is there (package.json of this app): only then are its pairings offered */
  app: boolean;
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
  /** the pairings' names, for the operator to see what comes over (the first ones) */
  pairingNames: string[];
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
const NAMES_SHOWN = 8;

interface StoredPairing {
  id: string;
  name?: unknown;
  tokenHash: string;
}
/** The pairings a secrets.json lists, those that look like pairings. */
const pairingsOf = (raw: unknown): StoredPairing[] => {
  const list = (raw as { remotes?: unknown } | null)?.remotes;
  return (Array.isArray(list) ? (list as StoredPairing[]) : []).filter(
    (p) => p && typeof p.id === 'string' && /^[0-9a-f]{64}$/.test(String(p.tokenHash ?? '')),
  );
};

/** What a copy holds, for the operator to see before carrying it over. */
export async function describeCopy(
  found: FoundCopy,
  app: string,
  running = false,
): Promise<CopyInfo> {
  const { root, dataDir } = found;
  const at = (n: string) => path.join(dataDir, n);
  const [pkg, settings, secrets, ui, index, albums, videos, bundles, changed] = await Promise.all([
    root ? peek(path.join(root, 'package.json')) : null,
    peek(at('settings.json')),
    peek(at('secrets.json')),
    peek(at(UI_FILE)),
    peek(at(path.join('images', 'index.json'))),
    peek(at('albums.json')),
    peek(at('videos.json')),
    bundlesIn(dataDir),
    dataChanged(dataDir),
  ]);
  const state = ui as Record<string, { value?: unknown }> | null;
  let programs = 0;
  try {
    const playlist = JSON.parse(String(state?.['vo:playlist']?.value ?? '{}')) as {
      state?: { saved?: unknown };
    };
    programs = count(playlist.state?.saved);
  } catch {
    /* none */
  }
  const version = (pkg as { version?: unknown } | null)?.version;
  const v = typeof version === 'string' && parseVersion(version) ? version : null;
  const browser = settings ? sanitizeLaunch((settings as { launch?: unknown }).launch).browser : '';
  const pairings = pairingsOf(secrets);
  return {
    folder: await copyFolderOf(found),
    dataDir,
    version: v,
    app: root !== null,
    running,
    newer: v !== null && parseVersion(app) !== null && compareVersions(v, app) > 0,
    changed,
    browser:
      browser && browser !== 'system'
        ? (KNOWN_BROWSERS.find((b) => b.id === browser)?.name ?? browser)
        : null,
    settings: settings !== null,
    look: typeof state?.['vo:settings']?.value === 'string',
    pairings: pairings.length,
    pairingNames: pairings.slice(0, NAMES_SHOWN).map((p) => String(p.name ?? '').slice(0, 40)),
    bundles: bundles.length,
    pictures: count((index as { images?: unknown } | null)?.images),
    programs,
    albums: count((albums as { albums?: unknown } | null)?.albums),
    videos: count((videos as { videos?: unknown } | null)?.videos),
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
 * beside this copy (copyFinder.siblingCopies). Never this copy's own data. The running one
 * first, then the most recently changed.
 */
export async function findCopies(o: {
  root: string;
  dataDir: string;
  port: number;
  app: string;
}): Promise<CopyInfo[]> {
  const [runningRoot, beside] = await Promise.all([
    waiterRoot(o.port),
    siblingCopies(o.root, o.dataDir),
  ]);
  const running = runningRoot ? await resolveCopy(runningRoot) : null;
  const all: [FoundCopy, boolean][] = [];
  if (running?.root && !sameFolder(running.dataDir, o.dataDir)) all.push([running, true]);
  for (const c of beside)
    if (!all.some(([f]) => sameFolder(f.dataDir, c.dataDir))) all.push([c, false]);
  const copies = await Promise.all(all.map(([c, r]) => describeCopy(c, o.app, r)));
  return copies.sort(
    (a, b) => Number(b.running) - Number(a.running) || (b.changed ?? 0) - (a.changed ?? 0),
  );
}

/**
 * This copy's start settings with the other copy's browser, port and idle stop, and updates. The
 * modules to build stay this copy's (they name its own modules/ files), and so does its remote
 * persistence — off there would wipe this copy's pairings at the next save (review of
 * 1.12.0-beta.2) — and anything else the file holds (the builder writes there too).
 */
export function mergedSettings(ours: unknown, theirs: unknown): Record<string, unknown> {
  const t = sanitizeServerSettings(theirs);
  const base = ours && typeof ours === 'object' ? (ours as Record<string, unknown>) : {};
  return { ...base, version: 1, standby: t.standby, updates: t.updates, launch: t.launch };
}

const json = (v: unknown) => Buffer.from(JSON.stringify(v, null, 2) + '\n');

/** What importCopy did, for the caller. */
export interface Imported {
  /** what the operator's things held (the summary a restore says), null when not carried */
  summary: BackupSummary | null;
  /** the other copy's pairings to add (the remote store adds them: remote.ts adoptPairings) */
  pairings: unknown[];
  /**
   * Nothing ticked had anything new (the pairings all here already, no start settings there):
   * nothing was changed — the last restore's way back stays offered (review of 1.12.0-beta.2).
   */
  nothing?: boolean;
}

/**
 * Carry the parts over from the copy whose data is in `from` into `dataDir`. The settings are
 * made when they are written (after the songs and pictures went in), from what this copy has
 * then; the pairings are left to `applied` — the remote store adds them, it owns their file.
 */
export async function importCopy(
  dataDir: string,
  from: FoundCopy,
  parts: CopyParts,
  app: string,
  now = new Date(),
  applied?: (pairings: unknown[]) => void,
): Promise<Imported> {
  const [info, theirSettings, theirSecrets] = await Promise.all([
    describeCopy(from, app),
    peek(path.join(from.dataDir, 'settings.json')),
    peek(path.join(from.dataDir, 'secrets.json')),
  ]);
  // only from a real copy (an app folder with its data): a folder that merely holds a
  // secrets.json gives no one a remote here (review of 1.12.0-beta.2)
  const pairings =
    parts.pairings && from.root
      ? pairingsOf(theirSecrets).filter((p) => !knownPairing(p.id, p.tokenHash))
      : [];
  // a copy without start settings has none to give: the defaults would replace this copy's
  const launch = parts.launch && theirSettings !== null;
  if (!parts.things && !launch && pairings.length === 0)
    return { summary: null, pairings, nothing: true };
  const extras: Partial<Record<Extra, () => Buffer | null>> = {};
  if (launch || pairings.length)
    extras['settings.json'] = () => {
      // this copy's file as it is now — after the songs and pictures went in —, read the way the
      // app reads it (a byte-order mark, a file held a moment); one it can't read now is never
      // written over: the import stops and puts everything back (jsonFile.ts, 1.9.3)
      const file = path.join(dataDir, 'settings.json');
      const ours = readJson<unknown>(file, {});
      assertWritable(file);
      const base = (ours && typeof ours === 'object' ? ours : {}) as Record<string, unknown>;
      const next = launch ? mergedSettings(base, theirSettings) : { ...base };
      // pairings carried over are kept across restarts
      if (pairings.length) next.remotes = { persist: true };
      return json(next);
    };
  let entries = null;
  if (parts.things) {
    // nothing packed or held in memory: the songs and pictures are copied from the other folder
    entries = await stateEntries(from.dataDir);
    const lists = await Promise.all(
      (['albums.json', 'videos.json'] as const).map(async (n) => {
        const data = await fsp.readFile(path.join(from.dataDir, n)).catch(() => null);
        return [n, data] as const;
      }),
    );
    for (const [n, data] of lists) if (data) extras[n] = () => data;
  }
  const summary = summarize(entries ?? [], {
    app: info.version ?? '',
    created: new Date(info.changed ?? now.getTime()).toISOString(),
  });
  await replaceState(dataDir, entries, summary, now, {
    kind: 'import',
    from: info.folder,
    extras,
    pairings: pairings.map((p) => p.id),
    applied: () => applied?.(pairings),
  });
  return { summary: entries ? summary : null, pairings };
}

export { resolveCopy, sameFolder };
