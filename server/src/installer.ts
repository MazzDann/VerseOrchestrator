import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { N_ } from '@vo/shared';
import { LAYOUT_MARKER } from './layout.js';
import type { SwapPlan, SwapResult } from './swap.js';
import { compareVersions, type LatestRelease } from './updates.js';

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
/**
 * in `<data>/updates/`: the release's files next to `app/`, for swap.ts — under the version's
 * name (1.6.2), so they wait as long as that version waits in `app.next/`
 */
export const TOP_FILES_DIR = 'top';
/**
 * in `<data>/updates/`: the version this app put in `app.next/` and which version of the app did
 * (1.6.2) — what a restart of the same app may offer again
 */
export const NEXT_RECORD = 'next.json';

/** The first version with «Повернути попередню версію» of its own. */
export const FIRST_ROLLBACK = '1.4.0';
/** Can `version` go back to the version before it by itself? */
export const hasRollback = (version: string): boolean =>
  compareVersions(version, FIRST_ROLLBACK) >= 0;

/** Downloading, checking, unpacking or restarting: no second download then. */
const BUSY: readonly InstallPhase[] = ['download', 'verify', 'unpack', 'restarting'];
/** How long a swap result is shown in «Оновлення». */
const RESULT_SHOWN_MS = 24 * 60 * 60 * 1000;
/**
 * The longest the swap helper runs: 30 s for the old app to leave, renames retried for 10 s each,
 * 90 s for the new version to answer, 15 s to stop it, the way back — under four minutes. A plan
 * older than this with no result: the helper is gone (the computer went off halfway).
 */
const HELPER_MAX_MS = 10 * 60 * 1000;
/**
 * Windows may refuse a rename for a moment (a scanner, an indexer): tried again for about 5 s,
 * as swap.ts does (the server waits meanwhile: it restarts next anyway).
 */
const RENAME_TRIES = 20;
const RENAME_PAUSE_MS = 250;

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
  /** runs the unpack command (tests: a rollback in the middle of it) */
  exec?: (cmd: string, args: string[]) => Promise<void>;
  /** the running version: what it puts in app.next, it offers again after a restart (1.6.2) */
  current?: string;
}

export function createInstaller(o: InstallerOptions) {
  const doFetch = o.fetch ?? fetch;
  const platform = o.platform ?? process.platform;
  const exec = o.exec ?? run;
  const updatesDir = path.join(o.dataDir, 'updates');
  let state: InstallState = { phase: 'idle', version: null, received: 0, total: 0, error: null };

  /**
   * A rollback or a restart moves on: a download still under way must not touch app.next or the
   * state after it (1.4.1). It checks after each step it waits for; the unpack alone is refused
   * (notNow).
   */
  let turn = 0;

  /** A rename Windows may refuse for a moment, tried again; elsewhere one that fails fails for good. */
  const renameSoon = (from: string, to: string): void => {
    for (let i = 1; ; i++) {
      try {
        fs.renameSync(from, to);
        return;
      } catch (e) {
        if (platform !== 'win32' || i >= RENAME_TRIES) throw e;
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw e; // nothing there
        // a synchronous pause: no download step runs in between (turn)
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_PAUSE_MS);
      }
    }
  };

  const fail = (error: string, vars?: Record<string, string>) => {
    state = { ...state, phase: 'error', error, vars };
  };

  /** This app put `version` in app.next (1.6.2): a restart of the same app offers it again. */
  const recordNext = (version: string): void => {
    try {
      fs.mkdirSync(updatesDir, { recursive: true });
      fs.writeFileSync(
        path.join(updatesDir, NEXT_RECORD),
        JSON.stringify({ version, by: o.current ?? '' }),
      );
    } catch {
      /* without it, only the newest release is offered again */
    }
  };

  async function download(latest: LatestRelease): Promise<void> {
    const mine = turn;
    const superseded = () => turn !== mine;
    const asset = latest.asset;
    state = {
      phase: 'download',
      version: latest.version,
      received: 0,
      total: asset?.size ?? 0,
      error: null,
    };
    // the version stays in the state: the page offers to try it again (1.6.2)
    if (!asset || !latest.sums) return fail(N_('Для цієї системи в релізі немає архіву'));
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
      if (superseded()) return abandon(file);
      state.phase = 'verify';
      const sums = await (await doFetch(latest.sums, { redirect: 'follow' })).text();
      const want = checksumFor(sums, asset.name);
      const hash = createHash('sha256');
      await pipeline(fs.createReadStream(file), hash);
      if (superseded()) return abandon(file);
      if (!want || hash.digest('hex') !== want)
        return fail(N_('Архів оновлення пошкоджено: контрольна сума не збігається'));
    } catch {
      if (superseded()) return abandon(file);
      return fail(N_('Не вдалося завантажити оновлення: немає зв’язку з GitHub'));
    }
    const unpacked = path.join(updatesDir, 'unpacked');
    try {
      state.phase = 'unpack';
      fs.mkdirSync(unpacked);
      const [cmd, args] = unpackCommand(platform, file, unpacked);
      await exec(cmd, args);
      // app.next may hold the version a rollback brings back now: leave it
      if (superseded()) return abandon(file, unpacked);
      const found = findUnpackedApp(unpacked, latest.version);
      if ('error' in found) return fail(found.error);
      const next = path.join(o.top, NEXT_DIR);
      fs.rmSync(next, { recursive: true, force: true });
      fs.renameSync(found.app, next); // same disk: data/ is next to app/
      recordNext(latest.version);
      // the start file and the notes: swap.ts puts them next to app/ once the new version runs
      const topFiles = path.join(updatesDir, TOP_FILES_DIR, latest.version);
      fs.mkdirSync(topFiles, { recursive: true });
      const release = path.dirname(found.app);
      for (const e of fs.readdirSync(release, { withFileTypes: true }))
        if (e.isFile()) fs.renameSync(path.join(release, e.name), path.join(topFiles, e.name));
      fs.rmSync(unpacked, { recursive: true, force: true });
      fs.rmSync(file, { force: true });
      state.phase = 'ready';
    } catch {
      if (superseded()) return abandon(file, unpacked);
      fail(N_('Не вдалося розпакувати оновлення'));
    }
  }

  /** A download overtaken by a rollback or a restart: only its own files go. */
  function abandon(...files: string[]): void {
    for (const f of files) fs.rmSync(f, { recursive: true, force: true });
  }

  const readUpdateFile = <T>(file: string): { data: T; mtime: number } | null => {
    try {
      const f = path.join(updatesDir, file);
      return { data: JSON.parse(fs.readFileSync(f, 'utf8')) as T, mtime: fs.statSync(f).mtimeMs };
    } catch {
      return null;
    }
  };

  /** Has the swap helper finished — or died long ago? What it holds can go then. */
  const helperGone = (now: number): boolean => {
    if (readUpdateFile<SwapResult>('result.json')) return true;
    const plan = readUpdateFile<SwapPlan>('plan.json');
    return !!plan && now - plan.mtime > HELPER_MAX_MS;
  };

  return {
    state: (): InstallState => ({ ...state }),
    /** Downloading, checking, unpacking or restarting: no second download. */
    busy: (): boolean => BUSY.includes(state.phase),
    /**
     * Why a restart or a rollback can't start now (a dictionary key), or null (1.4.1). A download
     * or its check gives way (turn): this app stops, and the download with it. The unpack runs
     * the system's tar in the app's folder, and it outlives this app: Windows wouldn't let the
     * swap rename app/ then.
     */
    notNow(): string | null {
      if (state.phase === 'restarting') return N_('Застосунок уже перезапускається');
      return state.phase === 'unpack' ? N_('Зачекайте, доки оновлення розпакується') : null;
    },
    /** Start downloading (the answer comes at once; the page follows the phases). */
    start(latest: LatestRelease): boolean {
      if (this.busy()) return false;
      void download(latest);
      return true;
    },
    /**
     * What app.next holds to restart with (1.6.2): a release copy this very version of the app
     * put there — a download, a rollback whose swap didn't finish — or else the newest release.
     * A leftover isn't offered: one from before an update by hand, or the copy a rollback to a
     * version before 1.4.0 left (keepAsNext) once that version is replaced by hand.
     */
    waiting(newest: string | null): string | null {
      const version = this.readyVersion();
      if (!version || !fs.existsSync(path.join(o.top, NEXT_DIR, LAYOUT_MARKER))) return null;
      if (version === newest) return version;
      const record = readUpdateFile<{ version?: string; by?: string }>(NEXT_RECORD)?.data;
      return !!o.current && record?.version === version && record.by === o.current ? version : null;
    },
    /** The version app.next holds, whoever put it there (see waiting()). */
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
      fs.rmSync(path.join(o.top, NEXT_DIR), {
        recursive: true,
        force: true,
        // Node waits 100 ms longer each time: 4.5 s in all
        ...(platform === 'win32' ? { maxRetries: 9, retryDelay: 100 } : {}),
      });
      renameSoon(path.join(o.top, PREVIOUS_DIR), path.join(o.top, NEXT_DIR));
      // a swap that doesn't finish leaves it there: offered again as the version to restart with
      recordNext(version);
      // only now: a rename that fails leaves a download under way to carry on
      turn++;
      state = { ...state, phase: 'idle', version: null };
      return version;
    },
    /**
     * Get the swap helper ready in `<data>/updates/` (swap.ts): its own copy of Node and of
     * swap.ts — nothing in app/ may stay in use while app/ is renamed — and its plan. A rollback
     * turns app.previous into app.next only after that (1.4.1). Anything that fails (a full
     * disk, a folder Windows holds) leaves things as they were: the previous version where it
     * was, the last swap's result, no copies. Returns what to run.
     */
    prepareSwap(p: {
      /** this Node */
      execPath: string;
      /** swap.ts in the running app */
      script: string;
      kind: 'update' | 'rollback';
      from: string;
      to: string;
      /** the running app and its waiter */
      pids: number[];
      port: number;
    }): { node: string; script: string; plan: string } {
      const back = p.kind === 'rollback';
      if (back && this.previousVersion() !== p.to)
        throw new Error(`no previous version ${p.to} to go back to`);
      fs.mkdirSync(updatesDir, { recursive: true });
      const node = path.join(updatesDir, path.basename(p.execPath));
      // .mts: an ES module wherever the release sits (a package.json above it can't say otherwise)
      const script = path.join(updatesDir, 'swap.mts');
      const planFile = path.join(updatesDir, 'plan.json');
      const topFiles = path.join(updatesDir, TOP_FILES_DIR, p.to);
      const plan: SwapPlan = {
        top: o.top,
        pids: p.pids,
        port: p.port,
        from: p.from,
        to: p.to,
        // a rollback keeps the start file as it is: the older release's isn't kept (nor is it
        // for a version that waits in app.next after a rollback)
        ...(back || !fs.existsSync(topFiles) ? {} : { topFiles }),
        result: path.join(updatesDir, 'result.json'),
        log: path.join(updatesDir, 'swap.log'),
        // an older version picked in the dropdown (1.6.2) is worded as a way back: the version it
        // lands on says «Повернуто версію …» (every version from 1.4.0 knows that kind), not
        // «Оновлено з … до …». The swap stays an update: the top files, app.previous replaced
        kind: back || compareVersions(p.to, p.from) < 0 ? 'rollback' : 'update',
        // to a version with no rollback of its own — back, or picked in the dropdown (1.6.2):
        // this one stays as its app.next
        ...(!hasRollback(p.to) ? { keepAsNext: true } : {}),
      };
      try {
        fs.copyFileSync(p.execPath, node);
        if (process.platform !== 'win32') fs.chmodSync(node, 0o755);
        fs.copyFileSync(p.script, script);
        fs.writeFileSync(planFile, JSON.stringify(plan));
        if (back) this.prepareRollback();
      } catch (e) {
        for (const f of [node, script, planFile]) {
          try {
            fs.rmSync(f, { force: true });
          } catch {
            /* in use: the next download clears the folder */
          }
        }
        throw e;
      }
      // the swap is on: the last one's result goes, so pages wait for this one's (a result
      // that stays would only show until the helper writes its own)
      try {
        fs.rmSync(path.join(updatesDir, 'result.json'), { force: true });
      } catch {
        /* see above */
      }
      return { node, script, plan: planFile };
    },
    markRestarting(): void {
      turn++;
      state = { ...state, phase: 'restarting' };
    },
    /**
     * How the last swap went (result.json) — for a day. Before the helper writes it (a few
     * minutes at most, its plan naming this very version), this app answering is the answer:
     * pages that load meanwhile say so too, with the time the swap began.
     */
    lastSwap(appVersion: string, now = Date.now()): SwapResult | null {
      const done = readUpdateFile<SwapResult>('result.json');
      if (done) return now - done.data.at < RESULT_SHOWN_MS ? done.data : null;
      const plan = readUpdateFile<SwapPlan>('plan.json');
      if (!plan || plan.data.to !== appVersion || now - plan.mtime > HELPER_MAX_MS) return null;
      return {
        ok: true,
        from: plan.data.from,
        to: plan.data.to,
        at: Math.floor(plan.mtime),
        ...(plan.data.kind ? { kind: plan.data.kind } : {}),
      };
    },
    /**
     * A swap — an update or a rollback — leaves the helper's copy of Node, its plan and the
     * release's top files in `<data>/updates/`: they go once the helper has finished (its
     * result.json, however old — 1.4.1) or is long gone; the result and the log stay, and so do
     * the top files of a version still in app.next (1.6.2). Returns what went.
     */
    tidy(now = Date.now()): string[] {
      if (!helperGone(now)) return [];
      const gone: string[] = [];
      // a swap that failed leaves the version in app.next: its top files and its record wait
      // with it (1.6.2)
      const waiting = this.readyVersion();
      const record = readUpdateFile<{ version?: string }>(NEXT_RECORD)?.data;
      for (const f of fs.readdirSync(updatesDir)) {
        if (f === 'result.json' || f === 'swap.log') continue;
        if (f === TOP_FILES_DIR && waiting && fs.existsSync(path.join(updatesDir, f, waiting)))
          continue;
        if (f === NEXT_RECORD && waiting && record?.version === waiting) continue;
        try {
          fs.rmSync(path.join(updatesDir, f), { recursive: true, force: true });
          gone.push(f);
        } catch {
          /* still in use (Windows): next time */
        }
      }
      return gone;
    },
    updatesDir,
  };
}
