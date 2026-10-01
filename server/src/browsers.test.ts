import type * as ChildProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunResult } from './shortcut';

/**
 * No test here may start a browser or any app, or read this machine's apps through a program:
 * `open`, osascript, plutil, xdg-open, `cmd /c start` and every browser's program throw instead
 * (on this Mac an agent's run once put a browser — and a permission prompt — on the screen of
 * whoever ran it). Detection gets a fake probe: folders, files and a runner of its own.
 */
const FORBIDDEN =
  /^(open|osascript|plutil|xdg-open|cmd(\.exe)?|powershell(\.exe)?|google[ -]chrome(-stable)?|chrome(\.exe)?|chromium(-browser)?|msedge(\.exe)?|microsoft[ -]edge(-stable)?|firefox(-developer-edition)?(\.exe)?|safari|zen(-browser)?(\.exe)?|brave([ -]browser)?(\.exe)?|arc|opera(\.exe)?|vivaldi(-stable)?(\.exe)?|librewolf(\.exe)?)$/i;
const guard = (cmd: unknown) => {
  const name = String(cmd).split(/[/\\]/).pop() ?? '';
  if (FORBIDDEN.test(name)) throw new Error(`a test ran ${String(cmd)}`);
};
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof ChildProcess>();
  const wrap =
    <F extends (...args: never[]) => unknown>(f: F) =>
    (...args: Parameters<F>) => {
      guard(args[0]);
      return f(...args);
    };
  return {
    ...real,
    spawn: wrap(real.spawn),
    spawnSync: wrap(real.spawnSync),
    execFile: wrap(real.execFile),
    execFileSync: wrap(real.execFileSync),
    exec: () => {
      throw new Error('a test ran a shell command');
    },
    execSync: () => {
      throw new Error('a test ran a shell command');
    },
  };
});
import { spawnSync } from 'node:child_process';
import {
  browserListing,
  DEFAULT_LAUNCH,
  detectBrowsers,
  KNOWN_BROWSERS,
  macAppInfo,
  openInCommand,
  readLaunchSettings,
  sanitizeLaunch,
  type BrowserProbe,
  type InstalledBrowser,
} from './browsers';
import { MAC_BROWSERS } from './shortcut';

const url = 'http://localhost:4747/';

const plistXml = (id: string, exe: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleExecutable</key>
	<string>${exe}</string>
	<key>CFBundleIdentifier</key>
	<string>${id}</string>
</dict>
</plist>`;

/** A Mac with these apps (folder → app → Info.plist text or bytes) and these programs inside. */
function fakeMac(
  apps: Record<string, Record<string, string | Buffer>>,
  programs: string[],
  run: BrowserProbe['run'] = () => {
    throw new Error('plutil was not expected');
  },
): Partial<BrowserProbe> {
  return {
    platform: 'darwin',
    home: '/Users/op',
    env: {},
    list: (dir) => Object.keys(apps[dir] ?? {}),
    read: (file) => {
      const m = /^(.*)\/([^/]+\.app)\/Contents\/Info\.plist$/.exec(file);
      const v = m && apps[m[1]]?.[m[2]];
      return v === undefined || v === null ? null : Buffer.from(v);
    },
    isFile: (p) => programs.includes(p),
    run,
  };
}

describe('the browsers on this computer (2026-10-01)', () => {
  it('a Mac: the apps in /Applications and ~/Applications, by bundle id, each once', () => {
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const brave = '/Users/op/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
    const found = detectBrowsers(
      fakeMac(
        {
          '/Applications': {
            'Google Chrome.app': plistXml('com.google.Chrome', 'Google Chrome'),
            'Safari.app': plistXml('com.apple.Safari', 'Safari'),
            // renamed: still Zen by its id
            'Zen Browser.app': plistXml('app.zen-browser.zen', 'zen'),
            'Pages.app': plistXml('com.apple.iWork.Pages', 'Pages'),
            'README.txt': 'not an app',
          },
          '/Users/op/Applications': {
            'Brave Browser.app': plistXml('com.brave.Browser', 'Brave Browser'),
            // a second copy: the first one found stays
            'Google Chrome.app': plistXml('com.google.Chrome', 'Google Chrome'),
            'Broken.app': '',
          },
        },
        [chrome, brave, '/Applications/Safari.app/Contents/MacOS/Safari'],
      ),
    );
    expect(found).toEqual<InstalledBrowser[]>([
      {
        id: 'chrome',
        name: 'Google Chrome',
        appWindow: true,
        bundleId: 'com.google.Chrome',
        program: chrome,
      },
      {
        id: 'safari',
        name: 'Safari',
        appWindow: false,
        bundleId: 'com.apple.Safari',
        program: '/Applications/Safari.app/Contents/MacOS/Safari',
      },
      {
        id: 'zen',
        name: 'Zen',
        appWindow: false,
        bundleId: 'app.zen-browser.zen',
        program: null, // its program isn't there: `open -b` still opens it
      },
      {
        id: 'brave',
        name: 'Brave',
        appWindow: true,
        bundleId: 'com.brave.Browser',
        program: brave,
      },
    ]);
  });

  it('a Mac: a Chromium browser whose program is missing opens as a page, not as an app window', () => {
    const [arc] = detectBrowsers(
      fakeMac(
        { '/Applications': { 'Arc.app': plistXml('company.thebrowser.Browser', 'Arc') } },
        [],
      ),
    );
    expect(arc).toMatchObject({ id: 'arc', appWindow: false, program: null });
  });

  it('a binary Info.plist goes to plutil only when it names a browser', () => {
    const asked: string[][] = [];
    const run = (cmd: string, args: string[]): RunResult => {
      asked.push([cmd, ...args]);
      const key = args[1];
      return {
        status: 0,
        stdout: key === 'CFBundleIdentifier' ? 'com.apple.Safari\n' : 'Safari\n',
        stderr: '',
      };
    };
    const binary = (s: string) => Buffer.concat([Buffer.from('bplist00'), Buffer.from(s)]);
    const probe = {
      read: (f: string) =>
        f.includes('Pages') ? binary('com.apple.iWork.Pages') : binary('com.apple.Safari'),
      run,
    };
    expect(macAppInfo('/Applications/Pages.app', probe)).toBeNull();
    expect(asked).toEqual([]); // no browser's id in it: plutil not asked
    expect(macAppInfo('/Applications/Safari.app', probe)).toEqual({
      bundleId: 'com.apple.Safari',
      executable: 'Safari',
    });
    const file = '/Applications/Safari.app/Contents/Info.plist';
    expect(asked).toEqual([
      ['/usr/bin/plutil', '-extract', 'CFBundleIdentifier', 'raw', '-o', '-', file],
      ['/usr/bin/plutil', '-extract', 'CFBundleExecutable', 'raw', '-o', '-', file],
    ]);
    // plutil failing, or answering an id that isn't a browser's: none
    const failing = { read: probe.read, run: () => ({ status: 1, stdout: '', stderr: 'no' }) };
    expect(macAppInfo('/Applications/Safari.app', failing)).toBeNull();
  });

  it('Windows: the usual install folders, Program Files and LocalAppData', () => {
    const env = {
      ProgramFiles: 'C:\\Program Files',
      'ProgramFiles(x86)': 'C:\\Program Files (x86)',
      LOCALAPPDATA: 'C:\\Users\\Op\\AppData\\Local',
    };
    const here = [
      'C:\\Users\\Op\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
      'C:\\Program Files\\Zen Browser\\zen.exe',
      'C:\\Users\\Op\\AppData\\Local\\Programs\\Opera\\opera.exe',
    ];
    const found = detectBrowsers({
      platform: 'win32',
      env,
      home: 'C:\\Users\\Op',
      isFile: (p) => here.includes(p),
    });
    expect(found.map((b) => [b.id, b.program, b.appWindow])).toEqual([
      ['chrome', here[0], true],
      ['firefox', here[2], false],
      ['zen', here[3], false],
      ['edge', here[1], true],
      ['opera', here[4], true],
    ]);
    expect(found.every((b) => b.bundleId === null)).toBe(true);
  });

  it('Linux: the programs on PATH', () => {
    const here = ['/usr/bin/firefox', '/snap/bin/chromium', '/usr/bin/brave-browser'];
    const found = detectBrowsers({
      platform: 'linux',
      env: { PATH: '/usr/local/bin:/usr/bin:/snap/bin' },
      isFile: (p) => here.includes(p),
    });
    expect(found.map((b) => [b.id, b.program, b.appWindow])).toEqual([
      ['firefox', '/usr/bin/firefox', false],
      ['brave', '/usr/bin/brave-browser', true],
      ['chromium', '/snap/bin/chromium', true],
    ]);
  });

  it('lists every known browser for the control window, the ones here marked', () => {
    const listing = browserListing([
      { id: 'zen', name: 'Zen', appWindow: false, bundleId: null, program: '/x/zen' },
    ]);
    expect(listing).toHaveLength(KNOWN_BROWSERS.length);
    expect(listing.find((b) => b.id === 'zen')).toEqual({
      id: 'zen',
      name: 'Zen',
      installed: true,
      appWindow: false,
    });
    // not here: what it could do if it were
    expect(listing.find((b) => b.id === 'vivaldi')).toMatchObject({
      installed: false,
      appWindow: true,
    });
    expect(listing.find((b) => b.id === 'safari')).toMatchObject({
      installed: false,
      appWindow: false,
    });
  });

  it('a Mac: a second start asks every browser that offers an app window for it', () => {
    // «Окремим вікном» is offered for the Chromium family; the raise (shortcut.ts) must know each
    const asked = new Set(MAC_BROWSERS.map((b) => b.id));
    for (const b of KNOWN_BROWSERS.filter((k) => k.engine === 'chromium'))
      expect(b.mac.filter((id) => !asked.has(id))).toEqual([]);
  });
});

describe('the choice in settings.json → launch', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it('keeps a known browser and a yes/no; anything else is the system browser', () => {
    expect(sanitizeLaunch({ browser: 'zen', appWindow: true })).toEqual({
      browser: 'zen',
      appWindow: true,
    });
    expect(sanitizeLaunch({ browser: 'chrome' })).toEqual({ browser: 'chrome', appWindow: false });
    expect(sanitizeLaunch({ browser: 'netscape', appWindow: 'yes' })).toEqual(DEFAULT_LAUNCH);
    expect(sanitizeLaunch({ browser: '--app=evil' })).toEqual(DEFAULT_LAUNCH);
    expect(sanitizeLaunch({ browser: 42 })).toEqual(DEFAULT_LAUNCH);
    expect(sanitizeLaunch(null)).toEqual(DEFAULT_LAUNCH);
    expect(sanitizeLaunch('chrome')).toEqual(DEFAULT_LAUNCH);
  });

  it('the launcher reads it from the data folder, before anything opens', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-browsers-'));
    dirs.push(dir);
    expect(readLaunchSettings(dir)).toEqual(DEFAULT_LAUNCH); // no file yet
    const file = path.join(dir, 'settings.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ standby: { port: 4747 }, launch: { browser: 'brave', appWindow: true } }),
    );
    expect(readLaunchSettings(dir)).toEqual({ browser: 'brave', appWindow: true });
    fs.writeFileSync(file, '{ broken');
    expect(readLaunchSettings(dir)).toEqual(DEFAULT_LAUNCH);
  });
});

describe('opening the control window in the chosen browser', () => {
  const chrome: InstalledBrowser = {
    id: 'chrome',
    name: 'Google Chrome',
    appWindow: true,
    bundleId: 'com.google.Chrome',
    program: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  };
  const safari: InstalledBrowser = {
    id: 'safari',
    name: 'Safari',
    appWindow: false,
    bundleId: 'com.apple.Safari',
    program: '/Applications/Safari.app/Contents/MacOS/Safari',
  };

  it('a Mac: `open -b` as a page; the program itself with --app as an app window', () => {
    expect(openInCommand('darwin', chrome, url, false)).toEqual([
      'open',
      ['-b', 'com.google.Chrome', url],
    ]);
    expect(openInCommand('darwin', chrome, url, true)).toEqual([chrome.program, [`--app=${url}`]]);
    // Safari has no app window: a page, whatever was asked
    expect(openInCommand('darwin', safari, url, true)).toEqual([
      'open',
      ['-b', 'com.apple.Safari', url],
    ]);
  });

  it('Windows and Linux: the program with the address, or with --app', () => {
    const edge: InstalledBrowser = {
      id: 'edge',
      name: 'Microsoft Edge',
      appWindow: true,
      bundleId: null,
      program: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    };
    expect(openInCommand('win32', edge, url, false)).toEqual([edge.program, [url]]);
    expect(openInCommand('win32', edge, url, true)).toEqual([edge.program, [`--app=${url}`]]);
    const firefox: InstalledBrowser = {
      id: 'firefox',
      name: 'Firefox',
      appWindow: false,
      bundleId: null,
      program: '/usr/bin/firefox',
    };
    expect(openInCommand('linux', firefox, url, true, { DISPLAY: ':0' })).toEqual([
      '/usr/bin/firefox',
      [url],
    ]);
    expect(openInCommand('linux', firefox, url, false, {})).toBeNull(); // no screen
  });

  it('nothing here ever started a program', () => {
    expect(() => spawnSync('open', ['-b', 'com.google.Chrome', url])).toThrow('a test ran open');
    expect(() => spawnSync(chrome.program!, [`--app=${url}`])).toThrow('a test ran');
    expect(() => spawnSync('/usr/bin/osascript', ['-e', 'beep'])).toThrow('a test ran');
  });
});
