import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adoptShell,
  createShellInstaller,
  openShellCommand,
  shellPresent,
  shellProgram,
} from './desktopShell';
import { LAYOUT_MARKER } from './layout';

const dirs: string[] = [];
const tempDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-shell-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('«Встановити застосунок» (1.17.2)', () => {
  it('finds the desktop app next to app/ on each system', () => {
    expect(shellProgram('/t', 'darwin')).toBe(path.join('/t', 'VerseOrchestrator.app'));
    expect(shellProgram('/t', 'win32')).toBe(path.join('/t', 'shell', 'VerseOrchestrator.exe'));
    expect(shellProgram('/t', 'linux')).toBe(path.join('/t', 'shell', 'verseorchestrator'));
  });

  it('opens it on the app’s port, from the home folder', () => {
    const [cmd, args, opts] = openShellCommand('/t', 4801, 'darwin');
    expect(cmd).toBe('/usr/bin/open');
    expect(args).toEqual(['--env', 'VO_PORT=4801', path.join('/t', 'VerseOrchestrator.app')]);
    expect(opts.cwd).toBe(os.homedir());
    const [lcmd, largs, lopts] = openShellCommand('/t', 4801, 'linux');
    expect(lcmd).toBe(path.join('/t', 'shell', 'verseorchestrator'));
    expect(largs).toEqual(['--no-sandbox']);
    expect(lopts.env?.VO_PORT).toBe('4801');
    expect(lopts.env?.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

  it('takes it from an unpacked release once', async () => {
    const release = tempDir();
    const top = tempDir();
    fs.mkdirSync(path.join(release, 'shell'));
    fs.writeFileSync(path.join(release, 'shell', 'verseorchestrator'), 'x');
    expect(shellPresent(top, 'linux')).toBe(false);
    expect(await adoptShell(release, top, 'linux')).toBe(true);
    expect(shellPresent(top, 'linux')).toBe(true);
    // nothing left to take, and one is there already
    expect(await adoptShell(release, top, 'linux')).toBe(false);
  });

  it('downloads this version’s archive and keeps only the desktop app', async () => {
    const work = tempDir();
    const rel = path.join(work, 'VerseOrchestrator-1.17.2-linux-x64');
    fs.mkdirSync(path.join(rel, 'app'), { recursive: true });
    fs.writeFileSync(path.join(rel, 'app', 'package.json'), JSON.stringify({ version: '1.17.2' }));
    fs.writeFileSync(path.join(rel, 'app', LAYOUT_MARKER), '{}');
    fs.mkdirSync(path.join(rel, 'shell'));
    fs.writeFileSync(path.join(rel, 'shell', 'verseorchestrator'), 'electron');
    const archive = path.join(work, 'a.tar.gz');
    expect(spawnSync('tar', ['-czf', archive, '-C', work, path.basename(rel)]).status).toBe(0);
    const bytes = fs.readFileSync(archive);
    const sum = createHash('sha256').update(bytes).digest('hex');
    const name = 'VerseOrchestrator-linux-x64.tar.gz';
    const releases = [
      { tag_name: 'v1.17.3', assets: [] },
      {
        tag_name: 'v1.17.2',
        assets: [
          { name, browser_download_url: 'https://dl/a', size: bytes.length },
          { name: 'SHA256SUMS.txt', browser_download_url: 'https://dl/sums' },
        ],
      },
    ];
    const fetch = vi.fn(async (url: string | URL | Request) =>
      String(url) === 'https://dl/a'
        ? new Response(bytes)
        : String(url) === 'https://dl/sums'
          ? new Response(`${sum}  ${name}\n`)
          : Response.json(releases),
    ) as unknown as typeof globalThis.fetch;
    const top = tempDir();
    const updatesDir = path.join(top, 'data', 'updates');
    const inst = createShellInstaller({
      top,
      updatesDir,
      current: '1.17.2',
      fetch,
      platform: 'linux',
      arch: 'x64',
    });
    inst.start();
    await vi.waitFor(() => expect(inst.state().phase).toMatch(/done|error/), { timeout: 15_000 });
    expect(inst.state()).toMatchObject({ phase: 'done', error: null, received: bytes.length });
    expect(fs.readFileSync(shellProgram(top, 'linux'), 'utf8')).toBe('electron');
    // nothing else of the archive stays
    expect(fs.existsSync(path.join(top, 'app'))).toBe(false);
    expect(fs.existsSync(path.join(updatesDir, 'desktop'))).toBe(false);
  });

  it('says so when the release has no desktop app for this version', async () => {
    const top = tempDir();
    const inst = createShellInstaller({
      top,
      updatesDir: path.join(top, 'u'),
      current: '1.17.1',
      fetch: vi.fn(async () => Response.json([{ tag_name: 'v1.17.1', assets: [] }])) as never,
      platform: 'linux',
      arch: 'x64',
    });
    inst.start();
    await vi.waitFor(() => expect(inst.state().phase).toBe('error'));
    expect(inst.state().error).toBe('Для цієї версії й системи в релізі немає застосунку');
  });
});
