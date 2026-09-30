import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checksumFor,
  createInstaller,
  findUnpackedApp,
  NEXT_DIR,
  PREVIOUS_DIR,
  TOP_FILES_DIR,
  unpackCommand,
} from './installer';
import { LAYOUT_MARKER } from './layout';
import type { LatestRelease } from './updates';

const temps: string[] = [];
const tempDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-installer-'));
  temps.push(d);
  return d;
};
afterEach(() => {
  for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
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

  /** A release of `version` served by a fake fetch: the archive and its SHA256SUMS.txt. */
  function served(version: string, opts: { badSum?: boolean; offline?: boolean } = {}) {
    const work = tempDir();
    releaseFolder(work, version);
    const archive = path.join(work, 'VerseOrchestrator-linux-x64.tar.gz');
    const r = spawnSync(TAR, [
      '-czf',
      archive,
      '-C',
      work,
      `VerseOrchestrator-${version}-linux-x64`,
    ]);
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
      return String(url) === 'https://dl/a'
        ? new Response(bytes)
        : new Response(`${sum}  VerseOrchestrator-linux-x64.tar.gz\n`);
    }) as unknown as typeof globalThis.fetch;
    return { latest, fetch };
  }

  async function install(latest: LatestRelease, fetch: typeof globalThis.fetch) {
    const top = tempDir();
    fs.mkdirSync(path.join(top, 'app'));
    const dataDir = path.join(top, 'data');
    const inst = createInstaller({ top, dataDir, platform: PLATFORM, fetch });
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
    expect(fs.readdirSync(path.join(updates, TOP_FILES_DIR)).sort()).toEqual([
      'start.sh',
      'ЯК ЗАПУСТИТИ.txt',
    ]);
    expect(fs.readdirSync(updates).sort()).toEqual([TOP_FILES_DIR]);
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
