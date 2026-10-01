/**
 * «Відкривати вікно керування в…» (the user's ask, 2026-10-01): the browsers installed on this
 * computer, the choice kept in data/settings.json → `launch`, and how to open the control window
 * in the chosen one — as an app window (no tabs, no address bar) where the browser can. The
 * launcher reads the choice before any browser opens; the server lists the browsers for the
 * control window (GET /api/browsers) and keeps the choice (PUT /api/server-settings).
 *
 * Nothing here starts anything: it reads folders and Info.plist files — no Apple Events, no
 * `open`; only an Info.plist in Apple's binary format goes through plutil (a file reader), and
 * only when it names a browser. The launcher spawns the command it gets.
 *
 * Only node: imports — the launcher runs before `npm ci` (like standby.ts and shortcut.ts).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Runner } from './shortcut.ts';

/** Chromium opens a page as an app window (`--app`); Gecko and WebKit have no such mode. */
export type Engine = 'chromium' | 'gecko' | 'webkit';

export interface KnownBrowser {
  /** the name kept in settings.json */
  id: string;
  /** the product's own name, the same in every language */
  name: string;
  engine: Engine;
  /** macOS: the bundle ids it ships under (CFBundleIdentifier) */
  mac: readonly string[];
  /** Windows: where its program lies under Program Files, Program Files (x86) or LocalAppData */
  win: readonly string[];
  /** Linux: its program's names on PATH */
  linux: readonly string[];
}

/** In the order the list shows them: the common ones first. */
export const KNOWN_BROWSERS: readonly KnownBrowser[] = [
  {
    id: 'chrome',
    name: 'Google Chrome',
    engine: 'chromium',
    mac: ['com.google.Chrome'],
    win: ['Google\\Chrome\\Application\\chrome.exe'],
    linux: ['google-chrome', 'google-chrome-stable'],
  },
  { id: 'safari', name: 'Safari', engine: 'webkit', mac: ['com.apple.Safari'], win: [], linux: [] },
  {
    id: 'firefox',
    name: 'Firefox',
    engine: 'gecko',
    mac: ['org.mozilla.firefox'],
    win: ['Mozilla Firefox\\firefox.exe'],
    linux: ['firefox'],
  },
  {
    id: 'zen',
    name: 'Zen',
    engine: 'gecko',
    mac: ['app.zen-browser.zen'],
    win: ['Zen Browser\\zen.exe'],
    linux: ['zen-browser', 'zen'],
  },
  {
    id: 'brave',
    name: 'Brave',
    engine: 'chromium',
    mac: ['com.brave.Browser'],
    win: ['BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
    linux: ['brave-browser', 'brave'],
  },
  {
    id: 'edge',
    name: 'Microsoft Edge',
    engine: 'chromium',
    mac: ['com.microsoft.edgemac'],
    win: ['Microsoft\\Edge\\Application\\msedge.exe'],
    linux: ['microsoft-edge', 'microsoft-edge-stable'],
  },
  // Arc on Windows is a Store app: no program at a path to start
  {
    id: 'arc',
    name: 'Arc',
    engine: 'chromium',
    mac: ['company.thebrowser.Browser'],
    win: [],
    linux: [],
  },
  {
    id: 'opera',
    name: 'Opera',
    engine: 'chromium',
    mac: ['com.operasoftware.Opera'],
    win: ['Programs\\Opera\\opera.exe', 'Opera\\opera.exe'],
    linux: ['opera'],
  },
  {
    id: 'vivaldi',
    name: 'Vivaldi',
    engine: 'chromium',
    mac: ['com.vivaldi.Vivaldi'],
    win: ['Vivaldi\\Application\\vivaldi.exe'],
    linux: ['vivaldi', 'vivaldi-stable'],
  },
  {
    id: 'chromium',
    name: 'Chromium',
    engine: 'chromium',
    mac: ['org.chromium.Chromium'],
    win: ['Chromium\\Application\\chrome.exe'],
    linux: ['chromium', 'chromium-browser'],
  },
  {
    id: 'librewolf',
    name: 'LibreWolf',
    engine: 'gecko',
    mac: ['io.gitlab.librewolf-community', 'org.mozilla.librewolf'],
    win: ['LibreWolf\\librewolf.exe'],
    linux: ['librewolf'],
  },
  {
    id: 'firefox-dev',
    name: 'Firefox Developer Edition',
    engine: 'gecko',
    mac: ['org.mozilla.firefoxdeveloperedition'],
    win: ['Firefox Developer Edition\\firefox.exe'],
    linux: ['firefox-developer-edition'],
  },
];

export const knownBrowser = (id: string): KnownBrowser | undefined =>
  KNOWN_BROWSERS.find((b) => b.id === id);

/** A browser found on this computer. */
export interface InstalledBrowser {
  id: string;
  name: string;
  /** it opens the control window as an app window (`--app`): the Chromium family */
  appWindow: boolean;
  /** macOS: what `open -b` opens */
  bundleId: string | null;
  /** the program itself: the one Windows and Linux start; on a Mac the one `--app` goes to */
  program: string | null;
}

/** What detection reads — the real system's by default, a test's own otherwise. */
export interface BrowserProbe {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  home: string;
  /** a file is there (a symlink to one too) */
  isFile: (file: string) => boolean;
  /** the names in a folder; none when it can't be read */
  list: (dir: string) => string[];
  /** a file's bytes, or null */
  read: (file: string) => Buffer | null;
  /** runs plutil for an Info.plist in the binary format */
  run: Runner;
}

const systemProbe = (): BrowserProbe => ({
  platform: process.platform,
  env: process.env,
  home: os.homedir(),
  isFile: (file) => {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  },
  list: (dir) => {
    try {
      return fs.readdirSync(dir);
    } catch {
      return [];
    }
  },
  read: (file) => {
    try {
      return fs.readFileSync(file);
    } catch {
      return null;
    }
  },
  run: (cmd, args, timeout) => {
    const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout });
    return {
      status: r.status,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
      error: r.error as NodeJS.ErrnoException | undefined,
    };
  },
});

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** A top-level string of an XML Info.plist (the keys we read stand once in it). */
function xmlPlistString(xml: string, key: string): string | null {
  const m = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(xml);
  return m ? m[1].replace(/&(\w+);/g, (all, e: string) => XML_ENTITIES[e] ?? all).trim() : null;
}

/** A string of a binary Info.plist, by plutil (it reads the file; nothing else runs). */
function binaryPlistString(run: Runner, file: string, key: string): string | null {
  const r = run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', file], 5000);
  const value = r.stdout.trim();
  return !r.error && r.status === 0 && value ? value : null;
}

const MAC_IDS = new Set(KNOWN_BROWSERS.flatMap((b) => b.mac));

/**
 * The bundle id and the program of the app at `app` (a bundle), from its Info.plist; null when
 * it is not one of KNOWN_BROWSERS. A binary plist keeps its ASCII strings as they are, so one
 * that names no browser's id is passed by without plutil.
 */
export function macAppInfo(
  app: string,
  probe: Pick<BrowserProbe, 'read' | 'run'>,
): { bundleId: string; executable: string | null } | null {
  const file = `${app}/Contents/Info.plist`;
  const bytes = probe.read(file);
  if (!bytes) return null;
  let bundleId: string | null;
  let executable: string | null;
  if (bytes.subarray(0, 6).toString('latin1') === 'bplist') {
    const text = bytes.toString('latin1');
    if (![...MAC_IDS].some((id) => text.includes(id))) return null;
    bundleId = binaryPlistString(probe.run, file, 'CFBundleIdentifier');
    executable = bundleId ? binaryPlistString(probe.run, file, 'CFBundleExecutable') : null;
  } else {
    const xml = bytes.toString('utf8');
    bundleId = xmlPlistString(xml, 'CFBundleIdentifier');
    executable = xmlPlistString(xml, 'CFBundleExecutable');
  }
  return bundleId && MAC_IDS.has(bundleId) ? { bundleId, executable } : null;
}

/**
 * The browsers of KNOWN_BROWSERS on this computer, in their order, each once. macOS: the apps in
 * /Applications and ~/Applications by their bundle ids (a renamed app is still found). Windows:
 * the usual install folders. Linux: the programs on PATH.
 */
export function detectBrowsers(own: Partial<BrowserProbe> = {}): InstalledBrowser[] {
  const probe = { ...systemProbe(), ...own };
  const found = new Map<string, InstalledBrowser>();
  const add = (b: KnownBrowser, bundleId: string | null, program: string | null) => {
    if (found.has(b.id)) return;
    // an app window needs the program itself (a Mac's `open` passes no flags to a running app)
    const appWindow = b.engine === 'chromium' && !!program;
    found.set(b.id, { id: b.id, name: b.name, appWindow, bundleId, program });
  };
  if (probe.platform === 'darwin') {
    for (const dir of ['/Applications', path.posix.join(probe.home, 'Applications')]) {
      for (const name of probe
        .list(dir)
        .filter((n) => n.endsWith('.app'))
        .sort()) {
        const app = path.posix.join(dir, name);
        const info = macAppInfo(app, probe);
        const b = info && KNOWN_BROWSERS.find((k) => k.mac.includes(info.bundleId));
        if (!info || !b) continue;
        const program = info.executable && `${app}/Contents/MacOS/${info.executable}`;
        add(b, info.bundleId, program && probe.isFile(program) ? program : null);
      }
    }
  } else if (probe.platform === 'win32') {
    const env = probe.env;
    const roots = [
      env.ProgramFiles ?? 'C:\\Program Files',
      env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
      env.LOCALAPPDATA ?? path.win32.join(probe.home, 'AppData', 'Local'),
    ];
    for (const b of KNOWN_BROWSERS) {
      const program = b.win
        .flatMap((rel) => roots.map((root) => path.win32.join(root, rel)))
        .find((p) => probe.isFile(p));
      if (program) add(b, null, program);
    }
  } else {
    const dirs = (probe.env.PATH ?? '').split(':').filter(Boolean);
    for (const b of KNOWN_BROWSERS) {
      const program = b.linux
        .flatMap((n) => dirs.map((d) => path.posix.join(d, n)))
        .find((p) => probe.isFile(p));
      if (program) add(b, null, program);
    }
  }
  return KNOWN_BROWSERS.flatMap((b) => found.get(b.id) ?? []);
}

/** What GET /api/browsers says: every known browser, whether it is here, and its app window. */
export interface BrowserListing {
  id: string;
  name: string;
  installed: boolean;
  appWindow: boolean;
}

export function browserListing(installed: readonly InstalledBrowser[]): BrowserListing[] {
  return KNOWN_BROWSERS.map((b) => {
    const here = installed.find((i) => i.id === b.id);
    return {
      id: b.id,
      name: b.name,
      installed: !!here,
      appWindow: here ? here.appWindow : b.engine === 'chromium',
    };
  });
}

// --- the choice -----------------------------------------------------------------------

/** data/settings.json → launch: where the start file opens the control window. */
export interface LaunchSettings {
  /** 'system' — the system's default browser, as before — or an id of KNOWN_BROWSERS */
  browser: string;
  /** as an app window, without tabs or an address bar — where the browser can (Chromium) */
  appWindow: boolean;
}

export const SYSTEM_BROWSER = 'system';
export const DEFAULT_LAUNCH: LaunchSettings = { browser: SYSTEM_BROWSER, appWindow: false };

/** Anything (a hand-edited file, an API body) as valid settings: an unknown browser is the system's. */
export function sanitizeLaunch(raw: unknown): LaunchSettings {
  const r = (raw ?? {}) as { browser?: unknown; appWindow?: unknown };
  const browser =
    typeof r.browser === 'string' && knownBrowser(r.browser) ? r.browser : SYSTEM_BROWSER;
  return {
    browser,
    appWindow: typeof r.appWindow === 'boolean' ? r.appWindow : DEFAULT_LAUNCH.appWindow,
  };
}

/** The choice as the launcher reads it, before any browser opens (settings.json → launch). */
export function readLaunchSettings(dataDir: string): LaunchSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
    return sanitizeLaunch(raw?.launch);
  } catch {
    return DEFAULT_LAUNCH;
  }
}

/**
 * How to open `url` in `b`: as an app window when asked and it can (`--app`, given to the
 * program itself), else as a page — macOS `open -b <bundle id>`, elsewhere the program with the
 * address. Null on Linux without a screen to open it on, or when there is nothing to start.
 */
export function openInCommand(
  platform: NodeJS.Platform,
  b: InstalledBrowser,
  url: string,
  asApp: boolean,
  env: NodeJS.ProcessEnv = process.env,
): [string, string[]] | null {
  if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) return null;
  if (asApp && b.appWindow && b.program) return [b.program, [`--app=${url}`]];
  if (platform === 'darwin') return b.bundleId ? ['open', ['-b', b.bundleId, url]] : null;
  return b.program ? [b.program, [url]] : null;
}
