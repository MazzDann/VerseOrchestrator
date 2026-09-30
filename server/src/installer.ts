import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { N_ } from '@vo/shared';
import { LAYOUT_MARKER } from './layout.js';
import type { LatestRelease } from './updates.js';

/**
 * Installing a newer release (1.0.0), for a copy in the release layout only (0.14.0).
 *
 *  1. download — this system's archive into `<data>/updates/`, its SHA-256 checked against the
 *     release's own SHA256SUMS.txt;
 *  2. unpack — with the system's tar (Windows 10+, macOS and Linux all have one) — and put the new
 *     `app/` next to the running one as `app.next/`. The show goes on meanwhile;
 *  3. restart (swap.ts) — only when the operator says so.
 *
 * The user's `data/` and `modules/` are never touched: they live outside `app/`.
 */

export type InstallPhase =
  | 'idle'
  | 'download'
  | 'verify'
  | 'unpack'
  | 'ready'
  | 'restarting'
  | 'error';

export interface InstallState {
  phase: InstallPhase;
  /** the version being installed */
  version: string | null;
  received: number;
  total: number;
  /** a dictionary key */
  error: string | null;
  vars?: Record<string, string>;
}

export const NEXT_DIR = 'app.next';
export const PREVIOUS_DIR = 'app.previous';
/** in `<data>/updates/`: the release's files next to `app/`, for swap.ts */
export const TOP_FILES_DIR = 'top';

/** `<sha256>  <file>` lines → the hash of `file`, or null. */
export function checksumFor(sums: string, file: string): string | null {
  for (const line of sums.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+?)\s*$/i.exec(line);
    if (m && m[2] === file) return m[1].toLowerCase();
  }
  return null;
}

/**
 * The unpacked archive holds one folder, `VerseOrchestrator-<version>-<os>-<arch>/`, with the
 * app in `app/`: its path when it is the version expected and a release's app (the marker), or
 * an error key.
 */
export function findUnpackedApp(dir: string, version: string): { app: string } | { error: string } {
  const tops = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('VerseOrchestrator-'));
  if (tops.length !== 1) return { error: N_('Архів оновлення має незнайому будову') };
  const app = path.join(dir, tops[0].name, 'app');
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')) as {
      version?: string;
    };
    if (pkg.version !== version) return { error: N_('В архіві оновлення не та версія') };
  } catch {
    return { error: N_('Архів оновлення має незнайому будову') };
  }
  if (!fs.existsSync(path.join(app, LAYOUT_MARKER)))
    return { error: N_('Архів оновлення має незнайому будову') };
  return { app };
}

/** How this system unpacks its archive into `dir`. */
export function unpackCommand(platform: string, archive: string, dir: string): [string, string[]] {
  if (platform === 'win32')
    // bsdtar, part of Windows 10 since 1803: reads zip
    return [
      path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe'),
      ['-xf', archive, '-C', dir],
    ];
  if (platform === 'darwin') return ['/usr/bin/ditto', ['-x', '-k', archive, dir]];
  return ['tar', ['-xzf', archive, '-C', dir]];
}

const run = (cmd: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore', windowsHide: true });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });

export interface InstallerOptions {
  /** the release folder: where `app/` sits (the parent of the running app) */
  top: string;
  dataDir: string;
  platform?: string;
  fetch?: typeof fetch;
}

export function createInstaller(o: InstallerOptions) {
  const doFetch = o.fetch ?? fetch;
  const platform = o.platform ?? process.platform;
  const updatesDir = path.join(o.dataDir, 'updates');
  let state: InstallState = { phase: 'idle', version: null, received: 0, total: 0, error: null };

  const fail = (error: string, vars?: Record<string, string>) => {
    state = { ...state, phase: 'error', error, vars };
  };

  async function download(latest: LatestRelease): Promise<void> {
    const asset = latest.asset;
    if (!asset || !latest.sums) return fail(N_('Для цієї системи в релізі немає архіву'));
    state = {
      phase: 'download',
      version: latest.version,
      received: 0,
      total: asset.size,
      error: null,
    };
    fs.rmSync(updatesDir, { recursive: true, force: true });
    fs.mkdirSync(updatesDir, { recursive: true });
    // room for the archive, the unpacked copy and app.next: about four times the archive
    try {
      const free = fs.statfsSync(o.top);
      const need = asset.size * 4;
      if (free.bavail * free.bsize < need)
        return fail(N_('Замало місця на диску: потрібно близько {mb} МБ'), {
          mb: String(Math.ceil(need / 1048576)),
        });
    } catch {
      /* no statfs here: try anyway */
    }
    const file = path.join(updatesDir, asset.name);
    try {
      const res = await doFetch(asset.url, { redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const count = new Transform({
        transform: (chunk: Buffer, _enc, done) => {
          state.received += chunk.length;
          done(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(res.body as import('node:stream/web').ReadableStream),
        count,
        fs.createWriteStream(file),
      );
      state.phase = 'verify';
      const sums = await (await doFetch(latest.sums, { redirect: 'follow' })).text();
      const want = checksumFor(sums, asset.name);
      const hash = createHash('sha256');
      await pipeline(fs.createReadStream(file), hash);
      if (!want || hash.digest('hex') !== want)
        return fail(N_('Архів оновлення пошкоджено: контрольна сума не збігається'));
    } catch {
      return fail(N_('Не вдалося завантажити оновлення: немає зв’язку з GitHub'));
    }
    try {
      state.phase = 'unpack';
      const unpacked = path.join(updatesDir, 'unpacked');
      fs.mkdirSync(unpacked);
      const [cmd, args] = unpackCommand(platform, file, unpacked);
      await run(cmd, args);
      const found = findUnpackedApp(unpacked, latest.version);
      if ('error' in found) return fail(found.error);
      const next = path.join(o.top, NEXT_DIR);
      fs.rmSync(next, { recursive: true, force: true });
      fs.renameSync(found.app, next); // same disk: data/ is next to app/
      // the start file and the notes: swap.ts puts them next to app/ once the new version runs
      const topFiles = path.join(updatesDir, TOP_FILES_DIR);
      fs.mkdirSync(topFiles);
      const release = path.dirname(found.app);
      for (const e of fs.readdirSync(release, { withFileTypes: true }))
        if (e.isFile()) fs.renameSync(path.join(release, e.name), path.join(topFiles, e.name));
      fs.rmSync(unpacked, { recursive: true, force: true });
      fs.rmSync(file, { force: true });
      state.phase = 'ready';
    } catch {
      fail(N_('Не вдалося розпакувати оновлення'));
    }
  }

  return {
    state: (): InstallState => ({ ...state }),
    /** Start downloading (the answer comes at once; the page follows the phases). */
    start(latest: LatestRelease): boolean {
      if (['download', 'verify', 'unpack', 'restarting'].includes(state.phase)) return false;
      void download(latest);
      return true;
    },
    /** A version already unpacked by an earlier run of this app is ready too. */
    readyVersion(): string | null {
      try {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(o.top, NEXT_DIR, 'package.json'), 'utf8'),
        ) as { version?: string };
        return pkg.version ?? null;
      } catch {
        return null;
      }
    },
    /**
     * The version the last update left in `app.previous/` (1.4.0) — one that can be run again:
     * a release copy (the marker) with its version. Null: none.
     */
    previousVersion(): string | null {
      const prev = path.join(o.top, PREVIOUS_DIR);
      try {
        if (!fs.existsSync(path.join(prev, LAYOUT_MARKER))) return null;
        const pkg = JSON.parse(fs.readFileSync(path.join(prev, 'package.json'), 'utf8')) as {
          version?: string;
        };
        return pkg.version ?? null;
      } catch {
        return null;
      }
    },
    /**
     * «Повернути попередню версію» (1.4.0): `app.previous/` becomes `app.next/`, so the swap
     * that installs an update brings it back (a downloaded update waiting there goes). Returns
     * its version, or null when there is none.
     */
    prepareRollback(): string | null {
      const version = this.previousVersion();
      if (!version) return null;
      fs.rmSync(path.join(o.top, NEXT_DIR), { recursive: true, force: true });
      fs.renameSync(path.join(o.top, PREVIOUS_DIR), path.join(o.top, NEXT_DIR));
      state = { ...state, phase: 'idle', version: null };
      return version;
    },
    markRestarting(): void {
      state = { ...state, phase: 'restarting' };
    },
    updatesDir,
  };
}
