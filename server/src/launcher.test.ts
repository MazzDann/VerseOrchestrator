import type * as ChildProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * The launcher opens browsers: no test here may (`open`, osascript, xdg-open, `cmd /c start` or a
 * browser's program throw instead) — the commands are checked as data (browserLaunch).
 */
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof ChildProcess>();
  const FORBIDDEN =
    /^(open|osascript|xdg-open|cmd(\.exe)?|powershell(\.exe)?|google[ -]chrome(-stable)?|chrome(\.exe)?|chromium(-browser)?|msedge(\.exe)?|microsoft[ -]edge(-stable)?|firefox(\.exe)?|safari|zen(\.exe)?|brave([ -]browser)?(\.exe)?|arc|opera(\.exe)?|vivaldi(\.exe)?|librewolf(\.exe)?)$/i;
  const wrap =
    <F extends (...args: never[]) => unknown>(f: F) =>
    (...args: Parameters<F>) => {
      if (FORBIDDEN.test(String(args[0]).split(/[/\\]/).pop() ?? ''))
        throw new Error(`a test ran ${String(args[0])}`);
      return f(...args);
    };
  return {
    ...real,
    spawn: wrap(real.spawn),
    spawnSync: wrap(real.spawnSync),
    execFile: wrap(real.execFile),
    execFileSync: wrap(real.execFileSync),
  };
});
import { lanIps } from './access';
import { createStandby, waiterAt } from './standby';
import type { InstalledBrowser, LaunchSettings } from './browsers';
import {
  browserCommand,
  browserLaunch,
  controlWindowLaunch,
  controlWindows,
  depsState,
  headerLine,
  healthAt,
  libraryState,
  missingBrowserLine,
  NPM_CI,
  openControlWindowLines,
  nodeVersionOk,
  parseArgs,
  phoneUrl,
  runningNote,
  switchOff,
  writeDepsRecord,
} from './launcher';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
/** A throwaway project folder with the given files (path → content). */
function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-launcher-'));
  dirs.push(dir);
  for (const [f, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), content);
  }
  return dir;
}
const lock = (packages: Record<string, object>) => JSON.stringify({ packages });

describe('launcher', () => {
  it('asks for a Node that runs .ts files without a flag', () => {
    for (const v of ['18.20.4', '20.19.0', '22.17.1', '23.5.0'])
      expect(nodeVersionOk(v)).toBe(false);
    for (const v of ['22.18.0', '23.6.0', '24.17.0', '26.0.0']) expect(nodeVersionOk(v)).toBe(true);
  });

  it('reads its command line', () => {
    const none = { off: false, app: false, shortcut: false, newWindow: false };
    expect(parseArgs([])).toEqual({ browser: true, port: null, check: false, ...none });
    expect(parseArgs(['--no-browser', '--port', '4798', '--check'])).toEqual({
      browser: false,
      port: 4798,
      check: true,
      ...none,
    });
    expect(parseArgs(['--off'])).toMatchObject({ off: true });
    expect(parseArgs(['--app'])).toMatchObject({ app: true });
    expect(parseArgs(['--shortcut'])).toMatchObject({ shortcut: true });
    expect(parseArgs(['--new-window'])).toMatchObject({ newWindow: true });
    expect(parseArgs(['--port', '80'])).toMatch(/1024/);
    expect(parseArgs(['--fast'])).toMatch(/Невідомий параметр/);
  });

  it('installs dependencies when missing, changed, or made for another system', () => {
    const packages = {
      '': { version: '0.7.0' },
      web: { version: '0.7.0' },
      'node_modules/@vo/web': { link: true },
      'node_modules/express': { version: '4.21.2' },
      'node_modules/@esbuild/linux-x64': { version: '0.25.0', optional: true },
    };
    const installed = { 'node_modules/express': { version: '4.21.2' } };
    const ok = { state: 'ok', mode: 'full' };
    // nothing installed yet
    expect(depsState(project({ 'package-lock.json': lock(packages) }))).toEqual({
      state: 'install',
      mode: 'full',
    });
    // installed by hand (no record): the same packages — the root's version bump and other
    // platforms' optional ones don't count
    const same = project({
      'package-lock.json': lock({ ...packages, '': { version: '0.7.1' } }),
      'node_modules/.package-lock.json': lock(installed),
    });
    expect(depsState(same)).toEqual(ok);
    // …a dependency changed
    const changed = project({
      'package-lock.json': lock({ ...packages, 'node_modules/express': { version: '5.1.0' } }),
      'node_modules/.package-lock.json': lock(installed),
    });
    expect(depsState(changed)).toEqual({ state: 'install', mode: 'full' });
    // recorded on another system (a folder copied between machines)
    writeDepsRecord(same, 'full', 'darwin-arm64-abi137');
    expect(depsState(same, 'win32-x64-abi137')).toEqual({ state: 'other-system', mode: 'full' });
    expect(depsState(same, 'darwin-arm64-abi137')).toEqual(ok);
  });

  it('a portable copy: only the runtime packages, installed as the record says (0.7.3)', () => {
    const packages = {
      'node_modules/express': { version: '4.21.2', integrity: 'sha512-a' },
      'node_modules/vite': { version: '6.4.3', integrity: 'sha512-b', dev: true },
    };
    const copy = project({
      'package-lock.json': lock({ '': { version: '0.7.3' }, ...packages }),
      // `npm ci --omit=dev --workspace…`: no vite
      'node_modules/.package-lock.json': lock({ 'node_modules/express': { version: '4.21.2' } }),
    });
    expect(depsState(copy, 'win32-x64-abi137').state).toBe('install'); // no record: vite missing
    writeDepsRecord(copy, 'runtime', 'win32-x64-abi137');
    expect(depsState(copy, 'win32-x64-abi137')).toEqual({ state: 'ok', mode: 'runtime' });
    // a release bump keeps it installed; a changed dependency reinstalls — the same way
    fs.writeFileSync(
      path.join(copy, 'package-lock.json'),
      lock({ '': { version: '0.7.4' }, ...packages }),
    );
    expect(depsState(copy, 'win32-x64-abi137')).toEqual({ state: 'ok', mode: 'runtime' });
    fs.writeFileSync(
      path.join(copy, 'package-lock.json'),
      lock({ ...packages, 'node_modules/express': { version: '5.1.0', integrity: 'sha512-c' } }),
    );
    expect(depsState(copy, 'win32-x64-abi137')).toEqual({ state: 'install', mode: 'runtime' });
    expect(NPM_CI.runtime).toEqual(
      expect.arrayContaining(['--omit=dev', '--workspace=@vo/server', '--workspace=@vo/builder']),
    );
  });

  it('finds the texts: the library, modules to build it from, the browser segments, or none', () => {
    expect(libraryState(project({ 'data/library.db': 'x' }), {}).kind).toBe('ready');
    const modules = project({ 'modules/KJV+.SQLite3': 'x' });
    expect(libraryState(modules, {})).toEqual({
      kind: 'build',
      modules: path.join(modules, 'modules'),
    });
    expect(libraryState(project({ 'old/MyBible/UKRK.SQLite3': 'x' }), {}).kind).toBe('build');
    expect(libraryState(project({ 'data/segments/manifest.json': '{}' }), {}).kind).toBe('browser');
    expect(libraryState(project({ 'README.md': '' }), {}).kind).toBe('missing');
    // LIBRARY_DB / VO_DATA_DIR win, as they do for the server and the builder
    const elsewhere = project({ 'lib/my.db': 'x', 'store/segments/manifest.json': '{}' });
    expect(libraryState(elsewhere, { LIBRARY_DB: path.join(elsewhere, 'lib/my.db') }).kind).toBe(
      'ready',
    );
    expect(libraryState(elsewhere, { VO_DATA_DIR: path.join(elsewhere, 'store') }).kind).toBe(
      'browser',
    );
  });

  it('opens the browser the way each system does', () => {
    const url = 'http://localhost:4747/';
    expect(browserCommand('win32', url)).toEqual(['cmd', ['/c', 'start', '', url]]);
    expect(browserCommand('darwin', url)).toEqual(['open', [url]]);
    expect(browserCommand('linux', url, { DISPLAY: ':0' })).toEqual(['xdg-open', [url]]);
    expect(browserCommand('linux', url, {})).toBeNull(); // a server without a screen
  });

  it('opens the control window in the browser chosen in the settings (2026-10-01)', () => {
    const url = 'http://localhost:4747/';
    const launch = (browser: string, appWindow = false): LaunchSettings => ({ browser, appWindow });
    const brave: InstalledBrowser = {
      id: 'brave',
      name: 'Brave',
      appWindow: true,
      bundleId: 'com.brave.Browser',
      program: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    };
    const zen: InstalledBrowser = {
      id: 'zen',
      name: 'Zen',
      appWindow: false,
      bundleId: 'app.zen-browser.zen',
      program: null,
    };
    const here =
      (...bs: InstalledBrowser[]) =>
      (id: string) =>
        bs.find((b) => b.id === id);
    const nothingHere = () => {
      throw new Error('nothing to look for with the system browser');
    };
    const none = () => false;
    // «Браузер системи»: as before — nothing looked for
    expect(
      browserLaunch('darwin', url, launch('system', true), false, nothingHere, {}, none),
    ).toEqual({
      cmd: ['open', [url]],
      missing: null,
    });
    // the chosen one: a page, or an app window by the setting or by --app (the shortcut)
    expect(browserLaunch('darwin', url, launch('brave'), false, here(brave))).toEqual({
      cmd: ['open', ['-b', 'com.brave.Browser', url]],
      missing: null,
    });
    expect(browserLaunch('darwin', url, launch('brave', true), false, here(brave)).cmd).toEqual([
      brave.program,
      [`--app=${url}`],
    ]);
    expect(browserLaunch('darwin', url, launch('brave'), true, here(brave)).cmd).toEqual([
      brave.program,
      [`--app=${url}`],
    ]);
    // Zen has no app window: a page in Zen, whatever was asked — not Chrome
    expect(browserLaunch('darwin', url, launch('zen', true), true, here(zen)).cmd).toEqual([
      'open',
      ['-b', 'app.zen-browser.zen', url],
    ]);
    // gone since it was chosen: as before, and the name for the one line that says so
    const gone = browserLaunch('darwin', url, launch('zen'), false, here(), {}, none);
    expect(gone).toEqual({ cmd: ['open', [url]], missing: 'Zen', instead: 'system' });
    expect(missingBrowserLine(gone)).toBe(
      'Zen на цьому комп’ютері не знайдено — відкриваю браузер системи (Налаштування вигляду → Застосунок).',
    );
    // … with --app as before too: Chrome or Edge as an app window when there — and the line
    // says so, not «the system browser»
    const chromeApp = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const goneApp = browserLaunch(
      'darwin',
      url,
      launch('zen'),
      true,
      here(),
      {},
      (p) => p === chromeApp,
    );
    expect(goneApp).toEqual({
      cmd: [chromeApp, [`--app=${url}`]],
      missing: 'Zen',
      instead: 'app-window',
    });
    expect(missingBrowserLine(goneApp)).toBe(
      'Zen на цьому комп’ютері не знайдено — відкриваю окремим вікном у Chrome або Edge (Налаштування вигляду → Застосунок).',
    );
    // --app with neither Chrome nor Edge: the system browser, and the line says that
    expect(browserLaunch('darwin', url, launch('zen'), true, here(), {}, none).instead).toBe(
      'system',
    );
    // here: no line
    expect(
      missingBrowserLine(browserLaunch('darwin', url, launch('brave'), false, here(brave))),
    ).toBeNull();
    // Windows and Linux: the program itself
    const edge: InstalledBrowser = {
      id: 'edge',
      name: 'Microsoft Edge',
      appWindow: true,
      bundleId: null,
      program: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    };
    expect(browserLaunch('win32', url, launch('edge', true), false, here(edge)).cmd).toEqual([
      edge.program,
      [`--app=${url}`],
    ]);
    expect(browserLaunch('win32', url, launch('edge'), false, here()).cmd).toEqual([
      'cmd',
      ['/c', 'start', '', url],
    ]);
    const firefox: InstalledBrowser = {
      id: 'firefox',
      name: 'Firefox',
      appWindow: false,
      bundleId: null,
      program: '/usr/bin/firefox',
    };
    const screen = { DISPLAY: ':0' };
    expect(
      browserLaunch('linux', url, launch('firefox'), false, here(firefox), screen).cmd,
    ).toEqual(['/usr/bin/firefox', [url]]);
    // no screen: nothing to open it on, chosen or not
    expect(browserLaunch('linux', url, launch('firefox'), false, here(firefox), {}).cmd).toBeNull();

    // the launcher's one step: settings.json → launch in the data folder, then the choice
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-launch-choice-'));
    try {
      expect(controlWindowLaunch(dataDir, 'darwin', url, false, nothingHere, {}, none).cmd).toEqual(
        ['open', [url]],
      );
      fs.writeFileSync(
        path.join(dataDir, 'settings.json'),
        JSON.stringify({ port: 4747, launch: { browser: 'brave', appWindow: true } }),
      );
      expect(controlWindowLaunch(dataDir, 'darwin', url, false, here(brave)).cmd).toEqual([
        brave.program,
        [`--app=${url}`],
      ]);
      fs.writeFileSync(
        path.join(dataDir, 'settings.json'),
        JSON.stringify({ launch: { browser: 'brave', appWindow: false } }),
      );
      expect(controlWindowLaunch(dataDir, 'darwin', url, false, here(brave)).cmd).toEqual([
        'open',
        ['-b', 'com.brave.Browser', url],
      ]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('gives phones the Wi-Fi address, not a virtual adapter', () => {
    const nic = (address: string, internal = false) =>
      ({
        address,
        family: 'IPv4',
        internal,
        netmask: '',
        mac: '',
        cidr: null,
      }) as os.NetworkInterfaceInfo;
    const ips = lanIps({
      'vEthernet (WSL)': [nic('172.20.160.1')],
      Loopback: [nic('127.0.0.1', true)],
      'Wi-Fi': [nic('192.168.0.249')],
      Ethernet: [nic('169.254.10.2')], // no DHCP
    });
    expect(ips).toEqual(['192.168.0.249', '172.20.160.1']);
    expect(phoneUrl(ips, 4747)).toBe('http://192.168.0.249:4747/follow');
    expect(phoneUrl([], 4747)).toBeNull();
  });

  it('--off: stops a running waiter (directly, when its app does not answer) and the autostart (0.7.2)', async () => {
    // an app that ignores /api/shutdown — the waiter is then shut down directly
    const app = http.createServer((_req, res) => res.end('{}'));
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
    const waiter = createStandby({
      port: 0,
      host: '127.0.0.1',
      idleMs: 60_000,
      startApp: async () => ({
        port: (app.address() as AddressInfo).port,
        onExit: () => undefined,
        stop: () => new Promise<void>((r) => app.close(() => r())),
      }),
    });
    const port = await waiter.listen();
    await waiter.start();
    const entry = {
      file: path.join(project({ 'autostart.vbs': 'x' }), 'autostart.vbs'),
      content: 'x',
    };
    expect(await switchOff(port, entry, 300)).toEqual({
      wasRunning: true,
      stillRunning: false,
      autostartRemoved: true,
    });
    expect(await waiterAt(port)).toBeNull();
    expect(fs.existsSync(entry.file)).toBe(false);
    // nothing there: says so
    expect(await switchOff(port, null, 300)).toEqual({
      wasRunning: false,
      stillRunning: false,
      autostartRemoved: false,
    });
  });

  it('names the copy on its first line: the dev label in a checkout (2026-10-01)', () => {
    const label = 'dev 1.4.2.try7 (mac-test · 20dd850)';
    const plain = { check: false, off: false };
    expect(headerLine(label, plain)).toBe(`VerseOrchestrator ${label}`);
    expect(headerLine('1.4.2', plain)).toBe('VerseOrchestrator 1.4.2');
    expect(headerLine(label, { check: true, off: false })).toBe(
      `VerseOrchestrator ${label} — перевірка`,
    );
    expect(headerLine(label, { check: false, off: true })).toBe(
      `VerseOrchestrator ${label} — вимкнення`,
    );
  });

  it('says when the app already running is another build than these files', () => {
    const here = 'dev 1.4.2.try7 (feat/x · abc1234)';
    // the same build, or an app that did not answer: nothing to say
    expect(runningNote(here, { ok: true, version: '1.4.2', label: here })).toBeNull();
    expect(runningNote('1.4.2', { ok: true, version: '1.4.2', label: '1.4.2' })).toBeNull();
    expect(runningNote(here, null)).toBeNull();
    expect(runningNote(here, 'garbage')).toBeNull();
    // started before a branch switch
    const note = runningNote(here, {
      ok: true,
      version: '1.4.2',
      label: 'dev 1.4.2.try5 (mac-test · 20dd850)',
    });
    expect(note).toContain('dev 1.4.2.try5 (mac-test · 20dd850)');
    expect(note).toContain('--off');
    // an app from before the label (a release folder): its version
    expect(runningNote(here, { ok: true, version: '1.4.1' })).toContain('1.4.1');
    expect(runningNote('1.4.2', { ok: true, version: '1.4.2' })).toBeNull();
  });

  it('asks the running app who it is', async () => {
    const app = http.createServer((req, res) => {
      if (req.url !== '/api/health') return void res.writeHead(404).end();
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, version: '1.4.2', label: 'dev 1.4.2 (main · d4961e3)' }));
    });
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', () => r()));
    const port = (app.address() as AddressInfo).port;
    try {
      expect(await healthAt(port)).toEqual({
        ok: true,
        version: '1.4.2',
        label: 'dev 1.4.2 (main · d4961e3)',
      });
    } finally {
      await new Promise<void>((r) => app.close(() => r()));
    }
    // nobody there any more
    expect(await healthAt(port)).toBeNull();
  });

  it('asks a running app which control windows are open and which browser is in charge', async () => {
    let answer: (res: http.ServerResponse) => void = () => undefined;
    const asked: string[] = [];
    const app = http.createServer((req, res) => {
      asked.push(req.url ?? '');
      answer(res);
    });
    await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
    const port = (app.address() as AddressInfo).port;
    const json = (body: unknown) => (res: http.ServerResponse) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };
    try {
      // the browser goes on to the Mac's decision (alreadyOpenLines)
      answer = json({ open: 2, active: { browser: 'firefox' } });
      expect(await controlWindows(port, 'running')).toEqual({ open: 2, active: 'firefox' });
      expect(asked).toEqual(['/api/control-windows']);
      // an app before this change says only how many: every browser is asked, as before
      answer = json({ open: 1 });
      expect(await controlWindows(port, 'running')).toEqual({ open: 1, active: null });
      // an app before 1.1.0: the page instead of an answer, or nothing — open one as before
      answer = (res) => res.end('<!doctype html>');
      expect(await controlWindows(port, 'running')).toBeNull();
      answer = (res) => {
        res.statusCode = 404;
        res.end();
      };
      expect(await controlWindows(port, 'running')).toBeNull();
      // a stopped app has no window connected: nothing is asked
      asked.length = 0;
      expect(await controlWindows(port, 'waiting')).toBeNull();
      expect(asked).toEqual([]);

      // what the launcher says: the browser in charge and the port go on to the Mac's decision
      const decided: unknown[][] = [];
      const lines = (...args: unknown[]) => {
        decided.push(args);
        return ['shown'];
      };
      answer = json({ open: 2, active: { browser: 'firefox' } });
      expect(await openControlWindowLines(port, 'running', lines)).toEqual(['shown']);
      expect(decided).toEqual([['firefox', port]]);
      answer = json({ open: 1 });
      expect(await openControlWindowLines(port, 'running', lines)).toEqual(['shown']);
      expect(decided.at(-1)).toEqual([null, port]);
      // none open, or the app can't say: nothing said, the launcher opens one
      decided.length = 0;
      answer = json({ open: 0, active: null });
      expect(await openControlWindowLines(port, 'running', lines)).toBeNull();
      answer = (res) => res.end('<!doctype html>');
      expect(await openControlWindowLines(port, 'running', lines)).toBeNull();
      expect(decided).toEqual([]);
    } finally {
      await new Promise<void>((r) => app.close(() => r()));
    }
  });
});
