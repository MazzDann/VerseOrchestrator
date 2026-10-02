import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checksumFor,
  createInstaller,
  findUnpackedApp,
  hasRollback,
  NEXT_DIR,
  NEXT_RECORD,
  PREVIOUS_DIR,
  TOP_FILES_DIR,
  unpackCommand,
} from './installer';
import { LAYOUT_MARKER } from './layout';
import { runSwap, type SwapPlan, type SwapResult } from './swap';
import type { LatestRelease } from './updates';

const temps: string[] = [];
const tempDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-installer-'));
  temps.push(d);
  return d;
};
afterEach(() => {
  // Windows: a file a process only just let go of may stay locked a moment longer
  for (const d of temps.splice(0))
    fs.rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** A release folder as the workflow packs it: the start file, the notes, app/ with the marker. */
function releaseFolder(
  dir: string,
  version: string,
  name = `VerseOrchestrator-${version}-linux-x64`,
) {
  const top = path.join(dir, name);
  fs.mkdirSync(path.join(top, 'app'), { recursive: true });
  fs.mkdirSync(path.join(top, 'data'));
  fs.writeFileSync(path.join(top, 'app', 'package.json'), JSON.stringify({ version }));
  fs.writeFileSync(path.join(top, 'app', LAYOUT_MARKER), '{}');
  fs.writeFileSync(path.join(top, 'start.sh'), '#!/bin/sh\n');
  fs.writeFileSync(path.join(top, 'ЯК ЗАПУСТИТИ.txt'), version);
  return top;
}

// the system's tar, as the installer uses it (Windows: its own bsdtar, not Git's)
const TAR =
  process.platform === 'win32'
    ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
// macOS unpacks zips with ditto; a test archive is a tar.gz, which every system's tar reads
const PLATFORM = process.platform === 'darwin' ? 'linux' : process.platform;

/**
 * A release of `version` served by a fake fetch: the archive and its SHA256SUMS.txt (`gate`: the
 * archive comes once it settles).
 */
function served(
  version: string,
  opts: { badSum?: boolean; offline?: boolean; gate?: Promise<unknown> } = {},
) {
  const work = tempDir();
  releaseFolder(work, version);
  const archive = path.join(work, 'VerseOrchestrator-linux-x64.tar.gz');
  const r = spawnSync(TAR, ['-czf', archive, '-C', work, `VerseOrchestrator-${version}-linux-x64`]);
  expect(r.status).toBe(0);
  const bytes = fs.readFileSync(archive);
  const sum = opts.badSum ? '0'.repeat(64) : createHash('sha256').update(bytes).digest('hex');
  const latest: LatestRelease = {
    version,
    url: 'https://example.test/release',
    publishedAt: '',
    prerelease: false,
    asset: {
      name: 'VerseOrchestrator-linux-x64.tar.gz',
      url: 'https://dl/a',
      size: bytes.length,
    },
    sums: 'https://dl/sums',
  };
  const fetch = vi.fn(async (url: string | URL | Request) => {
    if (opts.offline) throw new TypeError('fetch failed');
    if (String(url) === 'https://dl/a') await opts.gate;
    return String(url) === 'https://dl/a'
      ? new Response(bytes)
      : new Response(`${sum}  VerseOrchestrator-linux-x64.tar.gz\n`);
  }) as unknown as typeof globalThis.fetch;
  return { latest, fetch };
}

describe('installing an update (1.0.0)', () => {
  it('finds a file in SHA256SUMS.txt', () => {
    const a = 'a'.repeat(64);
    const b = 'B'.repeat(64);
    const sums = `${a}  VerseOrchestrator-windows-x64.zip\r\n${b} *VerseOrchestrator-linux-x64.tar.gz\n`;
    expect(checksumFor(sums, 'VerseOrchestrator-windows-x64.zip')).toBe(a);
    expect(checksumFor(sums, 'VerseOrchestrator-linux-x64.tar.gz')).toBe(b.toLowerCase());
    expect(checksumFor(sums, 'VerseOrchestrator-macos-arm64.zip')).toBeNull();
  });

  it('unpacks with the system’s own tools', () => {
    expect(unpackCommand('darwin', '/u/a.zip', '/u/x')).toEqual([
      '/usr/bin/ditto',
      ['-x', '-k', '/u/a.zip', '/u/x'],
    ]);
    expect(unpackCommand('linux', '/u/a.tar.gz', '/u/x')).toEqual([
      'tar',
      ['-xzf', '/u/a.tar.gz', '-C', '/u/x'],
    ]);
    const [cmd, args] = unpackCommand('win32', 'C:\\u\\a.zip', 'C:\\u\\x');
    expect(cmd).toMatch(/System32[\\/]tar\.exe$/);
    expect(args).toEqual(['-xf', 'C:\\u\\a.zip', '-C', 'C:\\u\\x']);
  });

  it('takes only a release app of the expected version', () => {
    const dir = tempDir();
    const top = releaseFolder(dir, '1.0.1');
    expect(findUnpackedApp(dir, '1.0.1')).toEqual({ app: path.join(top, 'app') });
    expect(findUnpackedApp(dir, '1.0.2')).toEqual({ error: 'В архіві оновлення не та версія' });
    fs.rmSync(path.join(top, 'app', LAYOUT_MARKER));
    expect(findUnpackedApp(dir, '1.0.1')).toEqual({
      error: 'Архів оновлення має незнайому будову',
    });
    releaseFolder(dir, '1.0.1', 'VerseOrchestrator-1.0.1-other');
    expect(findUnpackedApp(dir, '1.0.1')).toHaveProperty('error');
  });

  async function install(latest: LatestRelease, fetch: typeof globalThis.fetch) {
    const top = tempDir();
    fs.mkdirSync(path.join(top, 'app'));
    const dataDir = path.join(top, 'data');
    const inst = createInstaller({ top, dataDir, platform: PLATFORM, fetch, current: '1.0.0' });
    expect(inst.start(latest)).toBe(true);
    await vi.waitFor(() => expect(inst.state().phase).toMatch(/ready|error/), { timeout: 15_000 });
    return { top, dataDir, inst };
  }

  it('«Повернути попередню версію»: app.previous becomes app.next (1.4.0)', () => {
    const top = releaseFolder(tempDir(), '1.4.0');
    const inst = createInstaller({ top, dataDir: path.join(top, 'data') });
    expect(inst.previousVersion()).toBeNull();
    expect(inst.prepareRollback()).toBeNull();
    // what the last update left behind
    const prev = path.join(top, PREVIOUS_DIR);
    fs.mkdirSync(prev);
    fs.writeFileSync(path.join(prev, 'package.json'), JSON.stringify({ version: '1.3.1' }));
    expect(inst.previousVersion()).toBeNull(); // no marker: not a release app
    fs.writeFileSync(path.join(prev, LAYOUT_MARKER), '{}');
    expect(inst.previousVersion()).toBe('1.3.1');
    // a downloaded update waiting in app.next goes: the swap takes app.next
    fs.mkdirSync(path.join(top, NEXT_DIR));
    fs.writeFileSync(
      path.join(top, NEXT_DIR, 'package.json'),
      JSON.stringify({ version: '1.5.0' }),
    );
    expect(inst.prepareRollback()).toBe('1.3.1');
    expect(inst.readyVersion()).toBe('1.3.1');
    // a swap that doesn't finish leaves it there: offered again (1.6.2)
    expect(
      JSON.parse(fs.readFileSync(path.join(inst.updatesDir, NEXT_RECORD), 'utf8')),
    ).toMatchObject({ version: '1.3.1' });
    expect(fs.existsSync(prev)).toBe(false);
    expect(inst.previousVersion()).toBeNull();
  });

  it('downloads, checks and unpacks next to the running app', async () => {
    const { latest, fetch } = served('1.0.1');
    const { top, dataDir, inst } = await install(latest, fetch);
    expect(inst.state()).toMatchObject({ phase: 'ready', version: '1.0.1', error: null });
    expect(inst.state().received).toBe(latest.asset!.size);
    expect(inst.readyVersion()).toBe('1.0.1');
    expect(fs.existsSync(path.join(top, NEXT_DIR, LAYOUT_MARKER))).toBe(true);
    // the start file and the notes wait for the swap; the archive is gone
    const updates = path.join(dataDir, 'updates');
    expect(fs.readdirSync(path.join(updates, TOP_FILES_DIR, '1.0.1')).sort()).toEqual([
      'start.sh',
      'ЯК ЗАПУСТИТИ.txt',
    ]);
    expect(fs.readdirSync(updates).sort()).toEqual([NEXT_RECORD, TOP_FILES_DIR]);
    // the newest known when the download began, for the pin (1.6.3): none given here
    expect(inst.chosenOver('1.0.1')).toBeNull();
    fs.writeFileSync(
      path.join(updates, NEXT_RECORD),
      JSON.stringify({ version: '1.0.1', by: '1.0.0', newest: '1.0.3' }),
    );
    expect(inst.chosenOver('1.0.1')).toBe('1.0.3');
    expect(inst.chosenOver('1.0.2')).toBeNull();
    // this version put it there: a restart of it offers it again, whether or not it is the newest
    // (1.6.2); the same folder after an update by hand (another version running) only if newest
    expect(inst.waiting(null)).toBe('1.0.1');
    const byHand = createInstaller({ top, dataDir, current: '1.0.2' });
    expect(byHand.waiting(null)).toBeNull();
    expect(byHand.waiting('1.0.1')).toBe('1.0.1');
    // not a release copy: never
    fs.rmSync(path.join(top, NEXT_DIR, LAYOUT_MARKER));
    expect(inst.waiting('1.0.1')).toBeNull();
  });

  it('refuses a damaged archive, no archive for this system, and no connection', async () => {
    const bad = served('1.0.1', { badSum: true });
    const damaged = await install(bad.latest, bad.fetch);
    expect(damaged.inst.state()).toMatchObject({
      phase: 'error',
      error: 'Архів оновлення пошкоджено: контрольна сума не збігається',
    });
    expect(fs.existsSync(path.join(damaged.top, NEXT_DIR))).toBe(false);

    const none = await install({ ...bad.latest, asset: null }, bad.fetch);
    expect(none.inst.state().error).toBe('Для цієї системи в релізі немає архіву');

    const off = served('1.0.1', { offline: true });
    const offline = await install(off.latest, off.fetch);
    expect(offline.inst.state().error).toBe(
      'Не вдалося завантажити оновлення: немає зв’язку з GitHub',
    );
  });
});

/** A release app in `top/dir` holding `version`, as a release packs it (the marker). */
function appFolder(top: string, dir: string, version: string): string {
  const app = path.join(top, dir);
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ version, type: 'module' }));
  fs.writeFileSync(path.join(app, LAYOUT_MARKER), '{}');
  return app;
}
const versionIn = (top: string, dir: string): string | null => {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(top, dir, 'package.json'), 'utf8')) as {
        version: string;
      }
    ).version;
  } catch {
    return null;
  }
};
const SWAP_TS = fileURLToPath(new URL('./swap.ts', import.meta.url));
const HOUR = 60 * 60 * 1000;

describe('going back, and what a swap leaves behind (1.4.1)', () => {
  it('knows which versions go back by themselves', () => {
    expect(hasRollback('1.3.1')).toBe(false);
    expect(hasRollback('1.4.0')).toBe(true);
    expect(hasRollback('1.10.0')).toBe(true);
    expect(hasRollback('2.0.0')).toBe(true);
  });

  it('says why a restart or a rollback must wait while an update unpacks', async () => {
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    let unpacked!: () => void;
    const unpackGate = new Promise<void>((r) => (unpacked = r));
    const { latest, fetch } = served('1.4.1', { gate });
    const top = tempDir();
    appFolder(top, 'app', '1.4.0');
    const inst = createInstaller({
      top,
      dataDir: path.join(top, 'data'),
      platform: PLATFORM,
      fetch,
      exec: async (cmd, args) => {
        await unpackGate;
        expect(spawnSync(cmd, args).status).toBe(0);
      },
    });
    expect(inst.notNow()).toBeNull();
    expect(inst.start(latest)).toBe(true);
    expect(inst.state().phase).toBe('download');
    expect(inst.busy()).toBe(true);
    expect(inst.start(latest)).toBe(false); // no second download
    expect(inst.notNow()).toBeNull(); // a download gives way (the next test)
    open();
    await vi.waitFor(() => expect(inst.state().phase).toBe('unpack'), { timeout: 15_000 });
    expect(inst.notNow()).toBe('Зачекайте, доки оновлення розпакується');
    unpacked();
    await vi.waitFor(() => expect(inst.state().phase).toBe('ready'), { timeout: 15_000 });
    expect(inst.notNow()).toBeNull();
    inst.markRestarting();
    expect(inst.notNow()).toBe('Застосунок уже перезапускається');
  });

  it('a rollback during a download: the download gives way, app.next keeps the version brought back', async () => {
    const top = tempDir();
    appFolder(top, 'app', '1.4.1');
    appFolder(top, PREVIOUS_DIR, '1.4.0');
    // the archive comes in two parts: the rollback lands between them
    const plain = served('1.4.2');
    const bytes = new Uint8Array(await (await plain.fetch(plain.latest.asset!.url)).arrayBuffer());
    let rest!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.subarray(0, 64));
        rest = () => {
          c.enqueue(bytes.subarray(64));
          c.close();
        };
      },
    });
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url) === plain.latest.asset!.url ? new Response(body) : plain.fetch(url),
    ) as unknown as typeof globalThis.fetch;
    const exec = vi.fn(async () => undefined);
    const inst = createInstaller({
      top,
      dataDir: path.join(top, 'data'),
      platform: PLATFORM,
      fetch,
      exec,
    });
    expect(inst.start(plain.latest)).toBe(true);
    const archive = path.join(inst.updatesDir, plain.latest.asset!.name);
    await vi.waitFor(() => expect(fs.existsSync(archive)).toBe(true), { timeout: 15_000 });
    expect(inst.state().phase).toBe('download');
    expect(inst.notNow()).toBeNull();
    // what the server does on «Повернути версію 1.4.0»
    const node = path.join(tempDir(), 'node');
    fs.writeFileSync(node, '');
    inst.prepareSwap({
      execPath: node,
      script: SWAP_TS,
      kind: 'rollback',
      from: '1.4.1',
      to: '1.4.0',
      pids: [],
      port: 1,
    });
    inst.markRestarting();
    rest();
    // the download drops its archive at its next step: no check, no unpack
    await vi.waitFor(() => expect(fs.existsSync(archive)).toBe(false), { timeout: 15_000 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(exec).not.toHaveBeenCalled();
    expect(inst.state().phase).toBe('restarting');
    expect(versionIn(top, NEXT_DIR)).toBe('1.4.0');
    expect(fs.readdirSync(inst.updatesDir).sort()).toEqual([
      NEXT_RECORD,
      'node',
      'plan.json',
      'swap.mts',
    ]);
  });

  it('a download a rollback overtakes leaves app.next to the version brought back', async () => {
    const { latest, fetch } = served('1.4.1');
    const top = tempDir();
    appFolder(top, 'app', '1.4.0');
    appFolder(top, PREVIOUS_DIR, '1.3.1');
    let overtaken = false;
    const inst = createInstaller({
      top,
      dataDir: path.join(top, 'data'),
      platform: PLATFORM,
      fetch,
      // «Повернути версію 1.3.1» as the archive finishes unpacking (1.4.0 deleted 1.3.1 then)
      exec: async (cmd, args) => {
        expect(spawnSync(cmd, args).status).toBe(0);
        expect(inst.prepareRollback()).toBe('1.3.1');
        overtaken = true;
      },
    });
    expect(inst.start(latest)).toBe(true);
    const updates = path.join(top, 'data', 'updates');
    await vi.waitFor(
      () => {
        expect(overtaken).toBe(true);
        // only the rollback's record of what it put in app.next (1.6.2)
        expect(fs.readdirSync(updates)).toEqual([NEXT_RECORD]);
      },
      { timeout: 15_000 },
    );
    expect(versionIn(top, NEXT_DIR)).toBe('1.3.1');
    expect(versionIn(top, 'app')).toBe('1.4.0');
    expect(inst.state().phase).toBe('idle');
  });

  it('readies the helper before app.previous moves: a copy that fails leaves it in place', () => {
    const top = tempDir();
    appFolder(top, 'app', '1.4.1');
    appFolder(top, PREVIOUS_DIR, '1.3.1');
    appFolder(top, NEXT_DIR, '1.5.0'); // a downloaded update waiting
    const inst = createInstaller({ top, dataDir: path.join(top, 'data') });
    const swap = {
      execPath: path.join(top, 'no-such-node'), // a full disk fails the same way
      script: SWAP_TS,
      kind: 'rollback' as const,
      from: '1.4.1',
      to: '1.3.1',
      pids: [],
      port: 1,
    };
    expect(() => inst.prepareSwap(swap)).toThrow();
    expect(inst.previousVersion()).toBe('1.3.1');
    expect(inst.readyVersion()).toBe('1.5.0');
    expect(fs.existsSync(path.join(inst.updatesDir, 'plan.json'))).toBe(false);
    // nothing to go back to: refused before anything is copied
    expect(() => inst.prepareSwap({ ...swap, to: '1.2.0' })).toThrow(/no previous version/);
    expect(inst.previousVersion()).toBe('1.3.1');
  });

  // a folder that can't be written to refuses the rename; on Windows (and as root) it doesn't
  const noRename = process.platform === 'win32' || process.getuid?.() === 0;

  it.skipIf(noRename)(
    'a rename that fails leaves things as they were, a download carries on; Windows tries again',
    async () => {
      let open!: () => void;
      const gate = new Promise<void>((r) => (open = r));
      const { latest, fetch } = served('1.4.2', { gate });
      const top = tempDir();
      appFolder(top, 'app', '1.4.1');
      appFolder(top, PREVIOUS_DIR, '1.4.0');
      const dataDir = path.join(top, 'data');
      const inst = createInstaller({ top, dataDir, platform: PLATFORM, fetch });
      expect(inst.start(latest)).toBe(true); // an update downloading meanwhile
      const last = { ok: true, from: '1.4.0', to: '1.4.1', at: Date.now(), kind: 'update' };
      fs.writeFileSync(path.join(inst.updatesDir, 'result.json'), JSON.stringify(last));
      fs.writeFileSync(path.join(inst.updatesDir, 'swap.log'), '');
      const node = path.join(tempDir(), 'node');
      fs.writeFileSync(node, 'a stand-in for Node');
      const swap = {
        execPath: node,
        script: SWAP_TS,
        kind: 'rollback' as const,
        from: '1.4.1',
        to: '1.4.0',
        pids: [],
        port: 1,
      };
      fs.chmodSync(top, 0o555); // app.previous can't be renamed
      try {
        expect(() => inst.prepareSwap(swap)).toThrow(/EACCES|EPERM/);
      } finally {
        fs.chmodSync(top, 0o755);
      }
      expect(fs.readdirSync(inst.updatesDir).sort()).toEqual(['result.json', 'swap.log']);
      expect(inst.lastSwap('1.4.1')).toMatchObject({ ok: true, from: '1.4.0', to: '1.4.1' });
      expect(inst.previousVersion()).toBe('1.4.0');
      // the download wasn't told to give way
      open();
      await vi.waitFor(() => expect(inst.state().phase).toMatch(/ready|error/), {
        timeout: 15_000,
      });
      expect(inst.state().phase).toBe('ready');
      expect(versionIn(top, NEXT_DIR)).toBe('1.4.2');

      // Windows tries again for a few seconds (a scanner holding a file): here the folder
      // opens up 300 ms on, while the rename waits
      const winTop = tempDir();
      appFolder(winTop, 'app', '1.4.1');
      appFolder(winTop, PREVIOUS_DIR, '1.4.0');
      const win = createInstaller({
        top: winTop,
        dataDir: path.join(winTop, 'data'),
        platform: 'win32',
      });
      fs.mkdirSync(win.updatesDir, { recursive: true });
      fs.writeFileSync(path.join(win.updatesDir, 'result.json'), JSON.stringify(last));
      fs.chmodSync(winTop, 0o555);
      const opener = spawn('sh', ['-c', `sleep 0.3; chmod 755 '${winTop}'`]);
      const began = Date.now();
      try {
        const files = win.prepareSwap(swap);
        expect(fs.existsSync(files.plan)).toBe(true);
      } finally {
        fs.chmodSync(winTop, 0o755);
        opener.kill();
      }
      expect(Date.now() - began).toBeGreaterThanOrEqual(250);
      expect(versionIn(winTop, NEXT_DIR)).toBe('1.4.0');
      expect(win.previousVersion()).toBeNull();
      // the swap is on: the last result goes
      expect(fs.existsSync(path.join(win.updatesDir, 'result.json'))).toBe(false);
    },
  );

  it('plans a rollback; to a version before 1.4.0 this one stays as that one’s app.next', () => {
    const top = tempDir();
    appFolder(top, 'app', '1.4.1');
    appFolder(top, PREVIOUS_DIR, '1.3.1');
    const inst = createInstaller({ top, dataDir: path.join(top, 'data') });
    const node = path.join(tempDir(), 'node');
    fs.writeFileSync(node, 'a stand-in for Node');
    fs.mkdirSync(inst.updatesDir, { recursive: true });
    fs.writeFileSync(path.join(inst.updatesDir, 'result.json'), '{}'); // the swap before
    const swap = {
      execPath: node,
      script: SWAP_TS,
      kind: 'rollback' as const,
      from: '1.4.1',
      to: '1.3.1',
      pids: [123],
      port: 4999,
    };
    const files = inst.prepareSwap(swap);
    expect(fs.readFileSync(files.node, 'utf8')).toBe('a stand-in for Node');
    if (process.platform !== 'win32') expect(fs.statSync(files.node).mode & 0o111).toBe(0o111);
    expect(path.basename(files.script)).toBe('swap.mts');
    const plan = JSON.parse(fs.readFileSync(files.plan, 'utf8')) as SwapPlan;
    expect(plan).toMatchObject({ top, from: '1.4.1', to: '1.3.1', kind: 'rollback', port: 4999 });
    expect(plan.keepAsNext).toBe(true);
    expect(plan.topFiles).toBeUndefined();
    expect(fs.existsSync(path.join(inst.updatesDir, 'result.json'))).toBe(false);
    expect(versionIn(top, NEXT_DIR)).toBe('1.3.1');
    expect(inst.previousVersion()).toBeNull();

    // back to 1.4.0 or later: it has the button itself
    fs.rmSync(path.join(top, NEXT_DIR), { recursive: true });
    appFolder(top, PREVIOUS_DIR, '1.4.0');
    const again = inst.prepareSwap({ ...swap, to: '1.4.0' });
    expect(
      (JSON.parse(fs.readFileSync(again.plan, 'utf8')) as SwapPlan).keepAsNext,
    ).toBeUndefined();

    // an update: the release's top files, app.previous left alone
    appFolder(top, PREVIOUS_DIR, '1.3.1');
    const topFiles = path.join(inst.updatesDir, TOP_FILES_DIR, '1.4.2');
    fs.mkdirSync(topFiles, { recursive: true });
    const update = inst.prepareSwap({ ...swap, kind: 'update', to: '1.4.2' });
    const up = JSON.parse(fs.readFileSync(update.plan, 'utf8')) as SwapPlan;
    expect(up.topFiles).toBe(topFiles);
    expect(up.keepAsNext).toBeUndefined();
    expect(inst.previousVersion()).toBe('1.3.1');
    // a version with no top files of its own here (one a rollback left in app.next): none; and
    // one before 1.4.0 picked in the dropdown (1.6.2) keeps this one as its app.next, as a
    // rollback to it does
    const bare = inst.prepareSwap({ ...swap, kind: 'update', to: '1.3.9' });
    const older = JSON.parse(fs.readFileSync(bare.plan, 'utf8')) as SwapPlan;
    expect(older.topFiles).toBeUndefined();
    expect(older.keepAsNext).toBe(true);
    // …worded as a way back (every version from 1.4.0 says «Повернуто версію …»), still an
    // update for the folders: app.previous stays
    expect(older.kind).toBe('rollback');
    expect(inst.previousVersion()).toBe('1.3.1');
    expect(up.kind).toBe('update');
  });

  /** `<data>/updates/` as a swap leaves it: the helper's Node, its plan, the top files. */
  function afterSwap(result?: Partial<SwapResult>) {
    const top = tempDir();
    appFolder(top, 'app', '1.4.0');
    const inst = createInstaller({ top, dataDir: path.join(top, 'data') });
    const dir = inst.updatesDir;
    fs.mkdirSync(path.join(dir, TOP_FILES_DIR), { recursive: true });
    fs.writeFileSync(path.join(dir, TOP_FILES_DIR, 'start.sh'), '');
    fs.writeFileSync(path.join(dir, 'node'), '');
    fs.writeFileSync(path.join(dir, 'swap.mts'), '');
    fs.writeFileSync(path.join(dir, 'swap.log'), '');
    fs.writeFileSync(
      path.join(dir, 'plan.json'),
      JSON.stringify({ from: '1.3.0', to: '1.4.0', kind: 'update' }),
    );
    if (result)
      fs.writeFileSync(
        path.join(dir, 'result.json'),
        JSON.stringify({ ok: true, from: '1.3.0', to: '1.4.0', kind: 'update', ...result }),
      );
    return { inst, dir };
  }

  it('tidies up after a finished swap however long ago; says how it went for a day', () => {
    const now = Date.now();
    // the next start a day and more later (1.4.0 kept everything, 120 MB of Node, for good)
    const late = afterSwap({ at: now - 25 * HOUR });
    expect(late.inst.lastSwap('1.4.0', now)).toBeNull();
    expect(late.inst.tidy(now).sort()).toEqual(['node', 'plan.json', 'swap.mts', TOP_FILES_DIR]);
    expect(fs.readdirSync(late.dir).sort()).toEqual(['result.json', 'swap.log']);
    expect(late.inst.lastSwap('1.4.0', now)).toBeNull();

    const soon = afterSwap({ at: now - HOUR });
    expect(soon.inst.lastSwap('1.4.0', now)).toMatchObject({ ok: true, at: now - HOUR });
    soon.inst.tidy(now);
    expect(fs.readdirSync(soon.dir).sort()).toEqual(['result.json', 'swap.log']);
    expect(soon.inst.lastSwap('1.4.0', now)).toMatchObject({ ok: true, at: now - HOUR });
  });

  it('a swap that failed: the version in app.next keeps its top files for the next try (1.6.2)', () => {
    const now = Date.now();
    const { inst, dir } = afterSwap({ ok: false, at: now - HOUR });
    const top = path.dirname(path.dirname(dir));
    appFolder(top, NEXT_DIR, '1.3.0');
    fs.mkdirSync(path.join(dir, TOP_FILES_DIR, '1.3.0'));
    fs.writeFileSync(path.join(dir, TOP_FILES_DIR, '1.3.0', 'start.sh'), '1.3.0');
    fs.writeFileSync(
      path.join(dir, NEXT_RECORD),
      JSON.stringify({ version: '1.3.0', by: '1.4.0' }),
    );
    expect(inst.tidy(now).sort()).toEqual(['node', 'plan.json', 'swap.mts']);
    expect(fs.readdirSync(path.join(dir, TOP_FILES_DIR, '1.3.0'))).toEqual(['start.sh']);
    // once app.next is gone (installed, or replaced by a rollback), they go too
    fs.rmSync(path.join(top, NEXT_DIR), { recursive: true });
    expect(inst.tidy(now).sort()).toEqual([NEXT_RECORD, TOP_FILES_DIR]);
  });

  it('while the helper still checks this version, its plan answers — with a steady time', () => {
    const now = Date.now();
    const { inst, dir } = afterSwap();
    const began = now - 5000;
    fs.utimesSync(path.join(dir, 'plan.json'), began / 1000, began / 1000);
    const first = inst.lastSwap('1.4.0', now);
    expect(first).toMatchObject({ ok: true, from: '1.3.0', to: '1.4.0', kind: 'update' });
    expect(Math.abs(first!.at - began)).toBeLessThan(1000);
    expect(inst.lastSwap('1.4.0', now + 2000)!.at).toBe(first!.at);
    expect(inst.lastSwap('1.3.0', now)).toBeNull(); // the plan names another version
    // the pin the swap decides comes with it (1.6.3): this version takes it on once it answers
    const plan = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'));
    fs.writeFileSync(
      path.join(dir, 'plan.json'),
      JSON.stringify({ ...plan, pin: { version: '1.4.0', skip: '1.5.0' } }),
    );
    fs.utimesSync(path.join(dir, 'plan.json'), began / 1000, began / 1000);
    expect(inst.lastSwap('1.4.0', now)?.pin).toEqual({ version: '1.4.0', skip: '1.5.0' });
    // the helper is still at work: nothing of its goes
    expect(inst.tidy(now)).toEqual([]);
    // a plan with no result for too long: the helper is gone (the computer went off halfway)
    const later = now + 11 * 60 * 1000;
    expect(inst.lastSwap('1.4.0', later)).toBeNull();
    expect(inst.tidy(later).sort()).toEqual(['node', 'plan.json', 'swap.mts', TOP_FILES_DIR]);
  });

  /** A free port on this machine. */
  const freePort = () =>
    new Promise<number>((resolve, reject) => {
      const srv = net.createServer();
      srv.on('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        const { port } = srv.address() as net.AddressInfo;
        srv.close(() => resolve(port));
      });
    });

  /**
   * A release app that runs: its own `node` (this one) and a stand-in waiter that answers
   * /api/health as `version` and leaves soon after. It writes its pid to `pidFile`.
   */
  function runnableApp(top: string, dir: string, version: string, pidFile: string) {
    const app = appFolder(top, dir, version);
    const node =
      process.platform === 'win32'
        ? path.join(app, 'node', 'node.exe')
        : path.join(app, 'node', 'bin', 'node');
    fs.mkdirSync(path.dirname(node), { recursive: true });
    if (process.platform === 'win32') {
      try {
        fs.linkSync(process.execPath, node);
      } catch {
        fs.copyFileSync(process.execPath, node);
      }
    } else fs.symlinkSync(process.execPath, node);
    fs.mkdirSync(path.join(app, 'server', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(app, 'server', 'src', 'standby.ts'),
      `import fs from 'node:fs';
import http from 'node:http';
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
const version = ${JSON.stringify(version)};
http
  .createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ version }), () => setTimeout(() => process.exit(0), 100));
  })
  .listen(Number(process.env.VO_STANDBY_LISTEN), '127.0.0.1');
setTimeout(() => process.exit(0), 30_000);
`,
    );
  }

  /**
   * The stand-in has left. It runs from the release folder, and Windows deletes neither a
   * running node.exe nor the folder a process works in: the clean-up waits for it.
   */
  async function standInGone(pidFile: string) {
    let pid: number;
    try {
      pid = Number(fs.readFileSync(pidFile, 'utf8'));
    } catch {
      return; // never started
    }
    const alive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (e) {
        return (e as NodeJS.ErrnoException).code === 'EPERM';
      }
    };
    await vi.waitFor(() => expect(alive()).toBe(false), { timeout: 35_000, interval: 50 });
  }

  it('back to a version before 1.4.0: this one waits as its app.next, and its own updates still work', async () => {
    const top = tempDir();
    const dataDir = path.join(top, 'data');
    appFolder(top, 'app', '1.4.1');
    const pidFile = path.join(tempDir(), 'stand-in.pid');
    runnableApp(top, PREVIOUS_DIR, '1.3.1', pidFile);
    try {
      await backAndForth(top, dataDir);
    } finally {
      await standInGone(pidFile);
    }
  }, 80_000);

  /** Back to 1.3.1, then 1.3.1's own update over what waits in app.next. */
  async function backAndForth(top: string, dataDir: string) {
    const inst = createInstaller({ top, dataDir });
    const node = path.join(tempDir(), 'node');
    fs.writeFileSync(node, '');
    const files = inst.prepareSwap({
      execPath: node,
      script: SWAP_TS,
      kind: 'rollback',
      from: '1.4.1',
      to: '1.3.1',
      pids: [],
      port: await freePort(),
      pin: { version: '1.3.1', skip: '1.4.1' },
    });
    const plan = JSON.parse(fs.readFileSync(files.plan, 'utf8')) as SwapPlan;
    const result = await runSwap(plan, 20_000);
    expect(result).toMatchObject({ ok: true, from: '1.4.1', to: '1.3.1', kind: 'rollback' });
    // the plan's pin goes on in the result (1.6.3): the version swapped in takes it on
    expect(result.pin).toEqual({ version: '1.3.1', skip: '1.4.1' });
    expect(versionIn(top, 'app')).toBe('1.3.1');
    expect(versionIn(top, NEXT_DIR)).toBe('1.4.1');
    expect(fs.existsSync(path.join(top, PREVIOUS_DIR))).toBe(false);
    expect(fs.readFileSync(plan.log, 'utf8')).toContain('1.4.1 waits in app.next');

    // 1.0.0–1.3.x: «Оновлення» offers «Перезапустити й оновити» when readyVersion() is
    // GitHub's latest — the same readyVersion() and download() as here
    const older = createInstaller({ top, dataDir, platform: PLATFORM });
    expect(older.readyVersion()).toBe('1.4.1');
    expect(older.lastSwap('1.3.1')).toMatchObject({ ok: true, kind: 'rollback' });
    // a newer release than the one waiting: its download takes app.next's place
    const next = served('1.4.2');
    const downloader = createInstaller({ top, dataDir, platform: PLATFORM, fetch: next.fetch });
    expect(downloader.start(next.latest)).toBe(true);
    await vi.waitFor(() => expect(downloader.state().phase).toMatch(/ready|error/), {
      timeout: 15_000,
    });
    expect(downloader.state().phase).toBe('ready');
    expect(versionIn(top, NEXT_DIR)).toBe('1.4.2');
    expect(versionIn(top, 'app')).toBe('1.3.1');
  }
});
