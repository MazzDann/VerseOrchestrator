import { spawn, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { N_ } from '@vo/shared';
import { checksumFor, copyAcross, findUnpackedApp, unpackCommand } from './installer.js';
import { releaseAsset, shellDirName } from './layout.js';
import { pickReleases, RELEASES_URL } from './updates.js';

/**
 * «Встановити застосунок» (1.17.2): the desktop app (Electron, desktop/) next to app/ in a release —
 * `VerseOrchestrator.app` on macOS, `shell/` elsewhere. A release archive brings it; a copy updated
 * from a browser version (≤ 1.17.1 dropped every folder but app/) gets it here from its own
 * version's archive, and later updates carry it over (installer.ts, swap.ts copyTopFiles).
 */
export { shellDirName };
/** The program inside it, as a start file runs it. */
export function shellProgram(top: string, platform: NodeJS.Platform = process.platform): string {
  const dir = path.join(top, shellDirName(platform));
  if (platform === 'darwin') return dir;
  return path.join(dir, platform === 'win32' ? 'VerseOrchestrator.exe' : 'verseorchestrator');
}

export const shellPresent = (top: string, platform: NodeJS.Platform = process.platform): boolean =>
  fs.existsSync(shellProgram(top, platform));

/**
 * How the desktop app is opened for the app running on `port`: it finds it there, takes over as
 * the control window and leaves it running when it quits (desktop/src/main.ts). From the home
 * folder, never inside app/ (a swap would meet EBUSY — 1.8.8).
 */
export function openShellCommand(
  top: string,
  port: number,
  platform: NodeJS.Platform = process.platform,
): [string, string[], SpawnOptions] {
  const env: NodeJS.ProcessEnv = { ...process.env, VO_PORT: String(port) };
  delete env.ELECTRON_RUN_AS_NODE;
  const opts: SpawnOptions = { stdio: 'ignore', detached: true, cwd: os.homedir(), env };
  // `open` starts it through Launch Services (its own Dock icon, not this process's child);
  // --env hands it the port (macOS 13+, the shell's own minimum)
  if (platform === 'darwin')
    return ['/usr/bin/open', ['--env', `VO_PORT=${port}`, shellProgram(top, platform)], opts];
  // Linux: --no-sandbox like start.sh (Ubuntu 24.04's AppArmor gives Chromium no sandbox)
  const args = platform === 'linux' ? ['--no-sandbox'] : [];
  return [shellProgram(top, platform), args, opts];
}

export function openShell(top: string, port: number): void {
  const [cmd, args, opts] = openShellCommand(top, port);
  const child = spawn(cmd, args, opts);
  child.on('error', (e) => console.warn(`[desktop] not opened: ${e.message}`));
  child.unref();
}

/**
 * Moves the shell folder from a release unpacked in `release` (the folder holding its app/) to
 * `top`, when `top` has none — the same volume renames, another one copies (copyAcross keeps the
 * bundle's links and modes). A shell already there stays: it may be running (a swap from inside
 * the desktop app), and Electron itself changes with a new archive only.
 */
export async function adoptShell(
  release: string,
  top: string,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  const name = shellDirName(platform);
  const from = path.join(release, name);
  const to = path.join(top, name);
  if (!fs.existsSync(from) || fs.existsSync(to)) return false;
  for (let i = 1; ; i++) {
    try {
      fs.renameSync(from, to);
      return true;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EXDEV') return copyAcross(from, to);
      // Windows: an antivirus or an indexer holds the folder just unpacked a moment (installer.ts)
      if (platform !== 'win32' || code === 'ENOENT' || i >= 20) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

export interface ShellInstallState {
  phase: 'idle' | 'download' | 'verify' | 'unpack' | 'done' | 'error';
  received: number;
  total: number;
  error: string | null;
}

/** Downloads this version's own archive and keeps only the desktop app from it. */
export function createShellInstaller(o: {
  top: string;
  updatesDir: string;
  current: string;
  fetch?: typeof fetch;
  url?: string;
  platform?: NodeJS.Platform;
  arch?: string;
}) {
  const doFetch = o.fetch ?? fetch;
  const platform = o.platform ?? process.platform;
  let state: ShellInstallState = { phase: 'idle', received: 0, total: 0, error: null };
  const fail = (error: string) => {
    state = { ...state, phase: 'error', error };
  };

  async function run(): Promise<void> {
    const assetName = releaseAsset(platform, o.arch ?? process.arch);
    const work = path.join(o.updatesDir, 'desktop');
    try {
      fs.rmSync(work, { recursive: true, force: true });
      fs.mkdirSync(work, { recursive: true });
      let releases: unknown;
      try {
        const res = await doFetch(o.url ?? RELEASES_URL, {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': `VerseOrchestrator/${o.current}`,
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        releases = await res.json();
      } catch {
        return fail(N_('Не вдалося завантажити застосунок: немає зв’язку з GitHub'));
      }
      // this very version — its desktop app fits its app/ (a beta is found on either channel)
      const mine = pickReleases(releases, 'beta', assetName).find((r) => r.version === o.current);
      if (!mine?.asset || !mine.sums)
        return fail(N_('Для цієї версії й системи в релізі немає застосунку'));
      state = { phase: 'download', received: 0, total: mine.asset.size, error: null };
      const file = path.join(work, mine.asset.name);
      const hash = createHash('sha256');
      try {
        const res = await doFetch(mine.asset.url, { redirect: 'follow' });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const count = new Transform({
          transform: (chunk: Buffer, _enc, done) => {
            state.received += chunk.length;
            hash.update(chunk);
            done(null, chunk);
          },
        });
        await pipeline(
          Readable.fromWeb(res.body as import('node:stream/web').ReadableStream),
          count,
          fs.createWriteStream(file),
        );
        state.phase = 'verify';
        const sums = await (await doFetch(mine.sums, { redirect: 'follow' })).text();
        if (hash.digest('hex') !== checksumFor(sums, mine.asset.name))
          return fail(N_('Архів застосунку пошкоджено: контрольна сума не збігається'));
      } catch {
        return fail(N_('Не вдалося завантажити застосунок: немає зв’язку з GitHub'));
      }
      state.phase = 'unpack';
      const unpacked = path.join(work, 'unpacked');
      fs.mkdirSync(unpacked);
      const [cmd, args] = unpackCommand(platform, file, unpacked);
      await new Promise<void>((resolve, reject) => {
        // from its own folder, never app/ (the server's): a restart then would meet EBUSY (review)
        const p = spawn(cmd, args, { stdio: 'ignore', windowsHide: true, cwd: work });
        p.once('error', reject);
        p.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${code}`))));
      });
      const found = findUnpackedApp(unpacked, o.current);
      if ('error' in found) return fail(found.error);
      if (
        !(await adoptShell(path.dirname(found.app), o.top, platform)) &&
        !shellPresent(o.top, platform)
      )
        return fail(N_('Для цієї версії й системи в релізі немає застосунку'));
      state = { ...state, phase: 'done' };
    } catch (e) {
      console.warn(`[desktop] install: ${(e as Error).message}`);
      fail(N_('Не вдалося встановити застосунок'));
    } finally {
      // Windows may hold a file a moment (an antivirus): what stays goes at the next try
      await fs.promises.rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  return {
    state: (): ShellInstallState => ({ ...state }),
    /** at work: an update's download, restart or rollback waits (they share data/updates, app/) */
    busy: (): boolean => ['download', 'verify', 'unpack'].includes(state.phase),
    start(): void {
      if (['download', 'verify', 'unpack'].includes(state.phase)) return;
      state = { phase: 'download', received: 0, total: 0, error: null };
      void run().catch((e: Error) => {
        console.warn(`[desktop] install: ${e.message}`);
        fail(N_('Не вдалося встановити застосунок'));
      });
    },
  };
}
