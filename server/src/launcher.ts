/**
 * The launcher (0.7.0): `start.cmd` (Windows), `start.command` (macOS), `./start.sh` (Linux) or
 * `npm start` — one way to start the app on any machine. It prepares what a fresh copy lacks
 * (dependencies, the native SQLite module, the library, the UI build), then runs the standby
 * waiter in this console: phones reach the app only through it (the server itself listens on
 * loopback — access.ts), and the browser opens on the control window. Ctrl+C or closing the
 * window stops everything.
 *
 *   start [--no-browser] [--port N] [--check]
 *   start --off [--port N]      switch it all off (0.7.2)
 *   start --app                 the control window as an app window (0.7.5)
 *   start --shortcut            a desktop shortcut that starts it that way (0.7.5)
 *
 * Like standby.ts: only node: imports (it runs before `npm ci`) and no TS-only syntax — Node
 * runs it as it is (`node server/src/launcher.ts`, type stripping; the wrappers check that
 * Node is new enough first).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanIps } from './access.ts';
import { applyLayout, readLayout } from './layout.ts';
import { consoleLang, setLang, tr, trError } from './lang.ts';
import { currentEntry, isAutostartOn, setAutostart, type AutostartEntry } from './autostart.ts';
import {
  detectBrowsers,
  knownBrowser,
  markBrowser,
  openInCommand,
  readLaunchSettings,
  sanitizeLaunch,
  SYSTEM_BROWSER,
  type InstalledBrowser,
  type LaunchSettings,
  browserSpawnOptions,
} from './browsers.ts';
import {
  alreadyOpenLines,
  appWindowCommand,
  createShortcut,
  readControlWindows,
  type ControlWindows,
} from './shortcut.ts';
import {
  appProcess,
  buildUi,
  CONTROL_HEADER,
  createStandby,
  portFree,
  readStandbySettings,
  run,
  waiterAt,
  type WaiterStatus,
} from './standby.ts';
import { needsBuild } from './uiStamp.ts';
import { versionLabel } from './versionLabel.ts';
import { copyFolderOf, dataChanged, siblingCopies, type FoundCopy } from './copyFinder.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Node 22.18+ / 23.6+: .ts files run without a flag (the wrappers ask the same). */
export function nodeVersionOk(version: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  return major >= 24 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18);
}

export interface LaunchOptions {
  browser: boolean;
  port: number | null;
  check: boolean;
  off: boolean;
  /** the control window as an app window: Chrome/Edge `--app` (0.7.5) */
  app: boolean;
  shortcut: boolean;
  /** open the control window even when one is open already (1.1.0) */
  newWindow: boolean;
}

/** The command line, or what is wrong with it. */
export function parseArgs(argv: string[]): LaunchOptions | string {
  const o: LaunchOptions = {
    browser: true,
    port: null,
    check: false,
    off: false,
    app: false,
    shortcut: false,
    newWindow: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-browser') o.browser = false;
    else if (a === '--check') o.check = true;
    else if (a === '--off') o.off = true;
    else if (a === '--app') o.app = true;
    else if (a === '--shortcut') o.shortcut = true;
    else if (a === '--new-window') o.newWindow = true;
    else if (a === '--port') {
      const port = Number(argv[++i]);
      if (!Number.isInteger(port) || port < 1024 || port > 65535)
        return tr('Порт — ціле число від 1024 до 65535, наприклад: --port 4748');
      o.port = port;
    } else
      return tr(
        'Невідомий параметр «{arg}». Можна: --no-browser, --port N, --check, --off, --app, --shortcut, --new-window',
        { arg: a },
      );
  }
  return o;
}

/** What the installed dependencies were made for: a folder copied between systems needs its own. */
export const platformTag = () =>
  `${process.platform}-${process.arch}-abi${process.versions.modules}`;

/**
 * How the dependencies were installed: everything (a working copy), or only what the app runs
 * on — the server's and the builder's packages, no bundler or dev tools (a portable copy, 0.7.3).
 */
export type DepsMode = 'full' | 'runtime';

const QUIET = ['--no-audit', '--no-fund', '--no-update-notifier', '--loglevel=error'];
/** `npm ci` for each mode. */
export const NPM_CI: Record<DepsMode, string[]> = {
  full: ['ci', ...QUIET],
  runtime: ['ci', '--omit=dev', '--workspace=@vo/server', '--workspace=@vo/builder', ...QUIET],
};

/**
 * The lockfile's packages, as one short hash — without the workspaces' own versions, which every
 * release bumps without changing a single dependency.
 */
export function lockDigest(lockText: string): string {
  const lock = JSON.parse(lockText) as {
    packages?: Record<string, { version?: string; link?: boolean; integrity?: string }>;
  };
  const entries = Object.entries(lock.packages ?? {})
    .filter(([key, p]) => key.startsWith('node_modules/') && !p.link)
    .map(([key, p]) => `${key}@${p.version}#${p.integrity ?? ''}`)
    .sort();
  return createHash('sha256').update(entries.join('\n')).digest('hex').slice(0, 16);
}

/** Left in node_modules after an install: for which system, from which lockfile, which mode. */
interface DepsRecord {
  tag: string;
  digest: string;
  mode: DepsMode;
}
const RECORD = '.vo-deps';

function readRecord(dir: string): DepsRecord | null {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(dir, 'node_modules', RECORD), 'utf8'));
    return r && typeof r.tag === 'string' && typeof r.digest === 'string' ? r : null;
  } catch {
    return null;
  }
}

export function writeDepsRecord(dir: string, mode: DepsMode, tag = platformTag()): void {
  const digest = lockDigest(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'));
  const record: DepsRecord = { tag, digest, mode };
  fs.writeFileSync(path.join(dir, 'node_modules', RECORD), JSON.stringify(record));
}

/**
 * Whether `npm ci` is needed, and in which mode: nothing installed yet; installed for another
 * system (platformTag); the lockfile changed since the recorded install; or — installed by hand,
 * without a record — the lockfile asks for packages that aren't there (compared by content).
 */
export function depsState(
  dir: string,
  tag = platformTag(),
): { state: 'ok' | 'install' | 'other-system'; mode: DepsMode } {
  const modules = path.join(dir, 'node_modules');
  let installed: { packages?: Record<string, { version?: string }> };
  try {
    installed = JSON.parse(fs.readFileSync(path.join(modules, '.package-lock.json'), 'utf8'));
  } catch {
    return { state: 'install', mode: 'full' };
  }
  const lockText = fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8');
  const record = readRecord(dir);
  if (record) {
    // a portable copy holds only the runtime packages: the record, not the list, says «installed»
    if (record.tag !== tag) return { state: 'other-system', mode: record.mode };
    return { state: record.digest === lockDigest(lockText) ? 'ok' : 'install', mode: record.mode };
  }
  const lock = JSON.parse(lockText) as {
    packages?: Record<string, { version?: string; link?: boolean; optional?: boolean }>;
  };
  for (const [key, p] of Object.entries(lock.packages ?? {})) {
    // workspace links, and optional packages for other platforms (esbuild's, rollup's …)
    if (!key.startsWith('node_modules/') || p.link || p.optional) continue;
    if (installed.packages?.[key]?.version !== p.version) return { state: 'install', mode: 'full' };
  }
  return { state: 'ok', mode: 'full' };
}

export type LibraryState =
  | { kind: 'ready'; file: string }
  | { kind: 'build'; modules: string }
  | { kind: 'browser' }
  | { kind: 'missing' };

const hasModules = (dir: string) => {
  try {
    return fs.readdirSync(dir).some((f) => /\.sqlite3$/i.test(f));
  } catch {
    return false;
  }
};

/**
 * Where the texts come from: the server library, or MyBible modules to build it from (the
 * builder's order — builder/src/build.ts resolveModulesDir), or the segments the browser
 * engines read on their own («у браузері»), or nothing yet.
 */
export function libraryState(dir: string, env: NodeJS.ProcessEnv = process.env): LibraryState {
  const dataDir = env.VO_DATA_DIR ?? path.join(dir, 'data');
  const db = env.LIBRARY_DB ?? path.join(dataDir, 'library.db');
  if (fs.existsSync(db)) return { kind: 'ready', file: db };
  const candidates = [
    env.MODULES_DIR,
    path.join(dir, 'modules'),
    path.join(dataDir, 'modules'),
    path.join(dir, 'old', 'MyBible'),
  ];
  for (const m of candidates) if (m && hasModules(m)) return { kind: 'build', modules: m };
  if (fs.existsSync(path.join(dataDir, 'segments', 'manifest.json'))) return { kind: 'browser' };
  return { kind: 'missing' };
}

/** How to open a page in the default browser here (null: no screen to open it on). */
export function browserCommand(
  platform: NodeJS.Platform,
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): [string, string[]] | null {
  // `start`'s first quoted argument is a window title: an empty one, then the address
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', url]];
  if (platform === 'darwin') return ['open', [url]];
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return null;
  return ['xdg-open', [url]];
}

/** What opens the control window, and the chosen browser's name when it is not here. */
export interface BrowserLaunch {
  cmd: [string, string[]] | null;
  missing: string | null;
  /** what opens instead of a missing one: Chrome or Edge as an app window (`--app`), else the system's browser */
  instead?: 'app-window' | 'system';
}

/**
 * How the launcher opens the control window: in the browser chosen in Налаштування вигляду →
 * Застосунок (settings.json → launch), as an app window when asked — by the setting or `--app`
 * (the desktop shortcut) — and the browser can; with «Браузер системи», or a chosen browser that
 * is gone, as before: `--app` in Chrome or Edge when there, else the default browser. `find`
 * looks for the chosen one only when there is one.
 */
export function browserLaunch(
  platform: NodeJS.Platform,
  url: string,
  launch: LaunchSettings,
  appFlag: boolean,
  find: (id: string) => InstalledBrowser | undefined = (id) =>
    detectBrowsers().find((b) => b.id === id),
  env: NodeJS.ProcessEnv = process.env,
  exists: (p: string) => boolean = fs.existsSync,
): BrowserLaunch {
  let missing: string | null = null;
  if (launch.browser !== SYSTEM_BROWSER) {
    const b = find(launch.browser);
    // marked with the browser it opens in (markBrowser): the page then knows which one it is
    if (b)
      return {
        cmd: openInCommand(platform, b, markBrowser(url, b.id), appFlag || launch.appWindow, env),
        missing,
      };
    missing = knownBrowser(launch.browser)?.name ?? launch.browser;
  }
  const app = appFlag ? appWindowCommand(platform, url, exists, env) : null;
  const cmd = app || browserCommand(platform, url, env);
  return missing ? { cmd, missing, instead: app ? 'app-window' : 'system' } : { cmd, missing };
}

/**
 * The launcher's choice as main() makes it: the settings read from the data folder
 * (settings.json → launch), then browserLaunch — one step, so a test reaches both.
 */
export function controlWindowLaunch(
  dataDir: string,
  platform: NodeJS.Platform,
  url: string,
  appFlag: boolean,
  find?: (id: string) => InstalledBrowser | undefined,
  env?: NodeJS.ProcessEnv,
  exists?: (p: string) => boolean,
): BrowserLaunch {
  return browserLaunch(platform, url, readLaunchSettings(dataDir), appFlag, find, env, exists);
}

/** The start window's line for a chosen browser that is gone; null when it is here. */
export function missingBrowserLine(l: BrowserLaunch): string | null {
  if (!l.missing) return null;
  return l.instead === 'app-window'
    ? tr(
        '{browser} на цьому комп’ютері не знайдено — відкриваю окремим вікном у Chrome або Edge (Налаштування вигляду → Застосунок).',
        { browser: l.missing },
      )
    : tr(
        '{browser} на цьому комп’ютері не знайдено — відкриваю браузер системи (Налаштування вигляду → Застосунок).',
        { browser: l.missing },
      );
}

/** The page phones open, on the address they can most likely reach. */
export const phoneUrl = (ips: string[], port: number): string | null =>
  ips[0] ? `http://${ips[0]}:${port}/follow` : null;

/** Something answers at this port of this machine: wait until nothing does (up to `ms`). */
async function gone(port: number, ms: number): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 100)))
    if (!(await waiterAt(port))) return true;
  return false;
}

/**
 * `start --off` (0.7.2): «Вимкнути повністю» from the console — when the control window can't be
 * reached, or the waiter runs hidden since the computer started. The running app is asked first
 * (it tells the phones and remotes, removes the autostart entry and stops its waiter); should it
 * not answer, its waiter is shut down directly; the autostart entry is removed here either way.
 */
export async function switchOff(
  port: number,
  entry: AutostartEntry | null,
  waitMs = 5000,
): Promise<{ wasRunning: boolean; stillRunning: boolean; autostartRemoved: boolean }> {
  const post = (url: string) =>
    fetch(url, {
      method: 'POST',
      headers: { [CONTROL_HEADER]: '1' },
      signal: AbortSignal.timeout(3000),
    }).catch(() => undefined);
  // before the app is asked: it removes the entry itself
  const hadAutostart = isAutostartOn(entry);
  const waiter = await waiterAt(port);
  let stillRunning = false;
  if (waiter) {
    if (waiter.state === 'running') await post(`http://127.0.0.1:${port}/api/shutdown`);
    if (!(await gone(port, waitMs))) {
      await post(`http://127.0.0.1:${port}/__standby/shutdown`);
      stillRunning = !(await gone(port, waitMs));
    }
  }
  if (isAutostartOn(entry)) setAutostart(entry, false);
  return { wasRunning: !!waiter, stillRunning, autostartRemoved: hadAutostart };
}

// ---------------------------------------------------------------------------------------

const secs = (from: number) => tr('{s} с', { s: ((Date.now() - from) / 1000).toFixed(1) });
const say = (m: string) => process.stdout.write(`${m}\n`);

/** The native SQLite module loads here (another Node version or system leaves a stale one). */
function sqliteLoads(): { ok: boolean; error: string } {
  const r = spawnSync(
    process.execPath,
    ['-e', "new (require('better-sqlite3'))(':memory:').close()"],
    { cwd: path.join(root, 'server'), encoding: 'utf8', windowsHide: true },
  );
  const error = (r.stderr ?? '').split('\n').find((l) => /error/i.test(l)) ?? '';
  return { ok: r.status === 0, error: error.trim().slice(0, 200) };
}

/** The console's first line: what these files are (versionLabel.ts) and what this start does. */
export function headerLine(label: string, opts: Pick<LaunchOptions, 'check' | 'off'>): string {
  const what = opts.check ? ` — ${tr('перевірка')}` : opts.off ? ` — ${tr('вимкнення')}` : '';
  return `VerseOrchestrator ${label}${what}`;
}

/** What the app on this port says about itself (GET /api/health), or null. */
export async function healthAt(port: number): Promise<unknown> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(800),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/**
 * The app already running may be another build than these files: started before a branch was
 * switched, or from another copy (a release folder). Then the console says which one runs — the
 * header names these files. Null when it is this build, or the app did not say.
 */
export function runningNote(label: string, health: unknown): string | null {
  const h = (health ?? {}) as { version?: unknown; label?: unknown };
  // an app from before the label: its version is all it calls itself
  const running =
    typeof h.label === 'string' ? h.label : typeof h.version === 'string' ? h.version : null;
  if (running === null || running === label) return null;
  return tr(
    'Працює інша збірка: {label}. Щоб запустити цю, вимкніть застосунок («Вимкнути повністю…» або --off) і запустіть знову.',
    { label: running },
  );
}

/** Two paths name the same folder — in any letter case on Windows and macOS, as their disks do. */
export function sameFolder(
  a: string,
  b: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const norm = (s: string) => (platform === 'linux' ? p.resolve(s) : p.resolve(s).toLowerCase());
  return norm(a) === norm(b);
}

/** The folder people know a copy by: a release's own folder around app/, else the code's. */
export function copyFolder(root: string): string {
  return readLayout(root) ? path.dirname(root) : root;
}

/**
 * The waiter on the port serves ANOTHER copy of the app — another folder: an older release the
 * autostart starts, a test copy — so the control window opens there, with that copy's data, its
 * settings and the browser chosen in it (the user's report, 2026-10-09: a fresh copy unpacked
 * beside an updated one; its start file opened the old one's app, in Edge). Null for this copy, or
 * a waiter that doesn't say (before 1.11.1).
 */
export function otherCopyNote(
  root: string,
  waiter: WaiterStatus,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (typeof waiter.root !== 'string' || sameFolder(root, waiter.root, platform)) return null;
  return tr(
    'Працює інша копія застосунку: {folder}. Вікно керування відкриється в ній — з її даними й налаштуваннями (і браузером, вибраним у ній). Щоб працювала ця копія, вимкніть ту («Вимкнути повністю…» або --off) і запустіть цей файл знову.',
    { folder: copyFolder(waiter.root) },
  );
}

/**
 * The browser choice for a control window of the app that runs already: that of the copy whose
 * waiter holds the port — the user made it in that copy's control window — not this copy's own.
 * The user's report (2026-10-09, Windows 11): Opera chosen, Edge opened every time — the new
 * copy's start file read its own data/ (no choice there: the system browser, Edge) while the
 * choice sat in the data/ of the old copy, whose waiter the autostart had started. A waiter of
 * 1.11.1+ names the choice (GET /__standby); an older one is asked through its app (GET
 * /api/server-settings — it starts a stopped app, as the browser opening next would anyway).
 * Null when neither says: then this copy's own, as before.
 */
export async function runningLaunch(
  port: number,
  waiter: WaiterStatus,
  timeoutMs = 15_000,
): Promise<LaunchSettings | null> {
  if (waiter.launch && typeof waiter.launch === 'object') return sanitizeLaunch(waiter.launch);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/server-settings`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body: unknown = r.ok ? await r.json() : null;
    return body && typeof body === 'object' && 'launch' in body
      ? sanitizeLaunch(body.launch)
      : null;
  } catch {
    return null; // not ours, or no answer in time: this copy's choice
  }
}

/**
 * The control windows connected to the app on `port` and the browser of the one in charge, or
 * null when it can't say. Asked only of a running app.
 */
export async function controlWindows(port: number, state: string): Promise<ControlWindows | null> {
  if (state !== 'running') return null; // a stopped app has no window connected
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/control-windows`, {
      signal: AbortSignal.timeout(1500),
    });
    return r.ok ? readControlWindows(await r.json()) : null;
  } catch {
    return null; // an older app without the question: open one as before
  }
}

/**
 * What to say when a control window is open in the app on `port` already — it brought forward
 * (alreadyOpenLines: the browser in charge and the port go on to the Mac's decision), or where
 * to look; null when none is open, and the launcher opens one.
 */
export async function openControlWindowLines(
  port: number,
  state: string,
  lines: typeof alreadyOpenLines = alreadyOpenLines,
): Promise<string[] | null> {
  const open = await controlWindows(port, state);
  return open && open.open > 0 ? lines(open.active, port) : null;
}

function openBrowser(
  url: string,
  dataDir: string,
  asApp = false,
  running: LaunchSettings | null = null,
): void {
  // the chosen browser (as an app window if asked and it can), else as before (browserLaunch) —
  // chosen in the copy that runs when it said (runningLaunch), else in this one's data/
  const launch = running
    ? browserLaunch(process.platform, url, running, asApp)
    : controlWindowLaunch(dataDir, process.platform, url, asApp);
  const { cmd } = launch;
  const missing = missingBrowserLine(launch);
  if (missing) say(`  ${missing}`);
  if (!cmd) {
    say(`  ${tr('Відкрийте в браузері: {url}', { url })}`);
    return;
  }
  // Windows: `cmd /c start` hides its console. A browser started directly is a GUI program
  // (no console to hide), and windowsHide would hand it SW_HIDE for its first window: Chromium
  // shows itself anyway (0.7.5's --app had windowsHide), but Firefox, Zen and LibreWolf — now
  // started directly when chosen — are not known to (2026-10-01; a Windows check is due). And
  // never from app/: a browser started here stays in that folder (1.8.8, browserSpawnOptions)
  const child = spawn(cmd[0], cmd[1], browserSpawnOptions(cmd[0]));
  child.on('error', () => say(`  ${tr('Відкрийте в браузері: {url}', { url })}`));
  child.unref();
}

/** A data folder with none of the operator's settings yet: a copy that never ran. */
export const freshData = (dataDir: string) =>
  !['settings.json', 'ui-state.json'].some((n) => fs.existsSync(path.join(dataDir, n)));

/** Of the copies found, the one whose data changed last. */
export const newestCopy = (copies: FoundCopy[]): FoundCopy | null =>
  copies.map((c) => ({ c, t: dataChanged(c.dataDir) ?? 0 })).sort((a, b) => b.t - a.t)[0]?.c ??
  null;

/** The console's pointer to «Перенести з іншої копії…» for a fresh copy beside another one. */
export const otherCopyHint = (folder: string) =>
  tr(
    'Поруч є інша копія застосунку з даними: {folder}.\n  Щоб перенести з неї вигляд, пісні, налаштування й пульти — Налаштування вигляду →\n  Застосунок → «Перенести з іншої копії…».',
    { folder },
  );

async function main(argv: string[]): Promise<number> {
  const dataDir = process.env.VO_DATA_DIR ?? path.join(root, 'data');
  // the console speaks the interface language chosen in the control window (0.11.7)
  setLang(consoleLang(dataDir));
  const opts = parseArgs(argv);
  if (typeof opts === 'string') {
    say(opts);
    return 2;
  }
  const started = Date.now();
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  fs.mkdirSync(dataDir, { recursive: true });
  const logFile = path.join(dataDir, 'standby.log');
  const log = (m: string) => {
    try {
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${m}\n`);
    } catch {
      /* a full or locked disk must not stop the app */
    }
  };
  // what the waiter and the app say goes to the log file and, briefly, here
  const echo = (m: string) => {
    log(m);
    say(`  ${new Date().toTimeString().slice(0, 8)} ${m}`);
  };
  // a git checkout says it is one: «dev 1.4.2.try7 (mac-test · 20dd850)» (versionLabel.ts)
  const label = versionLabel(root, version);
  say(headerLine(label, opts));
  const settings = readStandbySettings(dataDir);
  const port = opts.port ?? settings.port;
  const local = `http://localhost:${port}`;
  // an app already there: the header named these files, so say when another copy (its waiter
  // names its folder) or another build is serving (only a running app is asked — the question
  // would wake a stopped one)
  const alreadyRunning = async (w: WaiterStatus): Promise<void> => {
    say(`✓ ${tr('Застосунок уже працює: {url}', { url: local })}`);
    const note =
      otherCopyNote(root, w) ??
      (w.state === 'running' ? runningNote(label, await healthAt(port)) : null);
    if (note) say(`  ${note}`);
  };

  // --off: «Вимкнути повністю» from the console (0.7.2)
  if (opts.off) {
    const r = await switchOff(port, currentEntry(root));
    if (r.stillRunning) {
      say(
        `✗ ${tr('Застосунок на :{port} не зупинився. Закрийте вікно, де його запущено.', { port })}`,
      );
      return 1;
    }
    say(
      r.wasRunning
        ? `✓ ${tr('Застосунок зупинено (працював на :{port})', { port })}`
        : `✓ ${tr('На :{port} застосунок не працював', { port })}`,
    );
    say(
      `✓ ${r.autostartRemoved ? tr('Автозапуск разом з комп’ютером прибрано') : tr('Автозапуску не було')}`,
    );
    say('');
    say(
      tr(
        'Поза папкою застосунку лишилися тільки дані браузера для {url}: копії\nналаштувань і кеш бібліотеки (самі налаштування — у data/). Щоб стерти й їх, запустіть застосунок і в\nНалаштування вигляду → Застосунок виберіть «Вимкнути повністю» з позначкою «стерти\nдані браузера» — або видаліть дані цього сайту в налаштуваннях браузера. Після цього\nпапку застосунку можна просто видалити.',
        { url: local },
      ),
    );
    return 0;
  }

  // --shortcut: the desktop shortcut, then done (0.7.5)
  if (opts.shortcut) {
    try {
      const files = createShortcut(root);
      say(`✓ ${tr('Ярлик на робочому столі: {file}', { file: files[0] })}`);
      say(
        `  ${tr('Він запускає застосунок і відкриває вікно керування окремим вікном — у браузері на основі Chromium, вибраному в Налаштування вигляду → Застосунок, або в Chrome чи Edge.')}`,
      );
      return 0;
    } catch (err) {
      say(`✗ ${tr('Ярлик не створено: {error}', { error: trError(err) })}`);
      return 1;
    }
  }

  // Already running (autostart, a second launch): open it — there is nothing to prepare. A
  // control window already open is shown instead of a second one (1.1.0, the operator's ask;
  // on a Mac too since the user's ask of 2026-10-01).
  const waiter = await waiterAt(port);
  if (waiter && !opts.check) {
    await alreadyRunning(waiter);
    const lines =
      opts.browser && !opts.newWindow ? await openControlWindowLines(port, waiter.state) : null;
    if (lines) {
      // brought forward (on a Mac by AppleScript, asking only the browser of the one in charge:
      // the first time, macOS asks to let the start window's app — Terminal — control it; in
      // Firefox or a browser built on it, the one connected at `port` comes forward), or where
      // to find it
      for (const line of lines) say(`  ${line}`);
    } else if (opts.browser)
      // in the browser chosen in the copy that runs — maybe not this one (runningLaunch)
      openBrowser(`${local}/`, dataDir, opts.app, await runningLaunch(port, waiter));
    return 0;
  }

  // A fresh copy beside one that holds the operator's data (1.12.0-beta.2): the user's case of
  // 2026-10-10 — a new zip unpacked next to an old copy started empty, and nothing said so
  if (freshData(dataDir)) {
    const other = newestCopy(siblingCopies(root, dataDir));
    if (other) say(`! ${otherCopyHint(copyFolderOf(other))}`);
  }

  // 1. Dependencies (npm ci on a fresh copy — needs the internet once)
  const deps = depsState(root);
  if (deps.state === 'ok') say(`✓ ${tr('Залежності на місці')}`);
  else if (opts.check)
    say(
      `! ${deps.state === 'install' ? tr('Залежності: не встановлено (npm ci)') : tr('Залежності: встановлено для іншої системи (npm ci)')}`,
    );
  else {
    const t = Date.now();
    say(
      deps.state === 'install'
        ? `… ${tr('Встановлюю залежності (npm ci; перший раз — кілька хвилин, потрібен інтернет)')}`
        : `… ${tr('Залежності встановлено для іншої системи — перевстановлюю (npm ci)')}`,
    );
    try {
      await run('npm', NPM_CI[deps.mode], root, log, { inherit: true });
    } catch {
      say(`✗ ${tr('Не вдалося встановити залежності. Перевірте інтернет і запустіть ще раз.')}`);
      return 1;
    }
    say(`✓ ${tr('Залежності встановлено за {time}', { time: secs(t) })}`);
  }

  // 2. The native SQLite module (a folder moved to another Node version / system)
  let sqlite = deps.state === 'ok' || !opts.check ? sqliteLoads() : { ok: false, error: '' };
  if (!sqlite.ok && !opts.check) {
    say(`… ${tr('Модуль SQLite зібрано для іншої версії Node — перебудовую')}`);
    try {
      await run('npm', ['rebuild', 'better-sqlite3'], root, log, { inherit: true });
    } catch {
      /* reported below */
    }
    sqlite = sqliteLoads();
  }
  if (sqlite.ok) {
    say(`✓ ${tr('Модуль SQLite працює')}`);
    if (!opts.check)
      try {
        writeDepsRecord(root, deps.mode);
      } catch {
        /* read-only copy: checked again next time */
      }
  } else if (deps.state === 'ok' || !opts.check) {
    say(
      `✗ ${tr('Модуль SQLite не завантажується: {error}', { error: sqlite.error || tr('невідома помилка') })}`,
    );
    say(`  ${tr('Спробуйте: npm ci')}`);
    if (!opts.check) return 1;
  }

  // 3. The library: the server's, or built from MyBible modules, or the browser's segments
  const lib = libraryState(root);
  if (lib.kind === 'ready') say(`✓ ${tr('Бібліотека на місці')}`);
  else if (lib.kind === 'build' && opts.check)
    say(`! ${tr('Бібліотеку буде зібрано з {modules}', { modules: lib.modules })}`);
  else if (lib.kind === 'build') {
    const t = Date.now();
    say(
      `… ${tr('Збираю бібліотеку з модулів MyBible ({modules}; кілька хвилин)', { modules: lib.modules })}`,
    );
    try {
      await run('npm', ['run', 'build:library'], root, log, { inherit: true });
      say(`✓ ${tr('Бібліотеку зібрано за {time}', { time: secs(t) })}`);
    } catch {
      say(`✗ ${tr('Бібліотеку не вдалося зібрати — застосунок запуститься без неї (див. вище).')}`);
    }
  } else if (lib.kind === 'browser') {
    say(
      `! ${tr('Бібліотеки сервера немає: тексти читатиме браузер (Налаштування вигляду →\n  Застосунок → Джерело даних → «у браузері»); телефони й пульт їх не побачать.')}`,
    );
  } else {
    say(
      `! ${tr('Бібліотеки немає: покладіть модулі MyBible (*.SQLite3) у папку modules/ і\n  запустіть ще раз. Застосунок запуститься, але без текстів.')}`,
    );
  }

  // 4. The UI (web/dist), built for this version of the code
  if (!needsBuild(root)) say(`✓ ${tr('Інтерфейс зібрано')}`);
  else if (opts.check) say(`! ${tr('Інтерфейс буде зібрано (npm run build --workspace @vo/web)')}`);
  else {
    const t = Date.now();
    say(`… ${tr('Збираю інтерфейс (до хвилини)')}`);
    // the bundler's own report (chunk sizes …) is for developers: shown only if it fails
    const output: string[] = [];
    try {
      await buildUi(root, (m) => {
        log(m);
        output.push(m);
      });
    } catch {
      say(output.join('\n').split('\n').slice(-15).join('\n'));
      say(`✗ ${tr('Інтерфейс не зібрано (див. вище). Спробуйте: npm ci, тоді запустіть ще раз.')}`);
      return 1;
    }
    say(`✓ ${tr('Інтерфейс зібрано за {time}', { time: secs(t) })}`);
  }

  // 5. The address
  if (waiter) {
    await alreadyRunning(waiter);
    return 0;
  }
  if (!(await portFree(port))) {
    say(
      `✗ ${tr('Порт {port} зайнятий іншою програмою. Запустіть з іншим: --port 4748', { port })}`,
    );
    say(`  ${tr('(або змініть його в data/settings.json → standby → port).')}`);
    return 1;
  }
  if (opts.check) {
    say(
      `✓ ${tr('Порт {port} вільний. Перевірку завершено за {time}.', { port, time: secs(started) })}`,
    );
    return 0;
  }

  // 6. Run: the standby waiter in this console, the app started right away
  let current: ReturnType<typeof createStandby> | null = null;
  let stopping = false;
  const serve = async (p: number): Promise<void> => {
    const standby = createStandby({
      port: p,
      host: '0.0.0.0',
      idleMs: settings.idleMinutes * 60_000,
      startApp: appProcess(root, log),
      log: echo,
      root,
      dataDir,
      // closed: by Ctrl+C / the window (stop below), «Запуск за адресою» turned off, or
      // «Вимкнути повністю» (0.7.1)
      onRetired: (why) => {
        if (why === 'shutdown')
          say(
            tr(
              'Застосунок вимкнено («Вимкнути повністю»). Щоб запустити знову, запустіть цей файл.',
            ),
          );
        else if (why === 'update')
          say(tr('Застосунок оновлюється: нова версія запуститься сама, у фоні.'));
        else if (why === 'restart')
          say(tr('Застосунок перезапускається з новим кодом: він запуститься сам, у фоні.'));
        else if (!stopping)
          say(tr('«Запуск за адресою» вимкнено в налаштуваннях — застосунок зупинено.'));
        process.exit(0);
      },
      // the port changed in Settings → Застосунок: carry on at the new one
      onRelaunch: () =>
        void serve(readStandbySettings(dataDir).port).catch((err: Error) => {
          say(`✗ ${tr('Не вдалося перейти на новий порт: {error}', { error: trError(err) })}`);
          process.exit(1);
        }),
    });
    current = standby;
    await standby.listen();
    // the app inherits it: «Вимкнути повністю» then tells this very waiter (0.7.1)
    process.env.VO_STANDBY_PORT = String(p);
    await standby.start();
    say('');
    say(
      `✓ ${tr('Застосунок працює ({time}). Вікно керування: {url}', { time: secs(started), url: `http://localhost:${p}` })}`,
    );
    const phone = phoneUrl(lanIps(), p);
    say(
      `  ${
        phone
          ? tr('Телефони в тій самій мережі Wi-Fi: {url}', { url: phone })
          : tr('Мережі не видно: телефони під’єднаються, коли комп’ютер буде в мережі.')
      }`,
    );
    say(`  ${tr('Зупинити: Ctrl+C або закрийте це вікно.')}`);
    say('');
  };
  try {
    await serve(port);
  } catch (err) {
    say(`✗ ${tr('Застосунок не запустився: {error}', { error: trError(err) })}`);
    return 1;
  }
  if (opts.browser) openBrowser(`${local}/`, dataDir, opts.app);

  const stop = () => {
    stopping = true;
    say(tr('Зупиняю…'));
    setTimeout(() => process.exit(0), 5000).unref();
    void (current?.close() ?? Promise.resolve()).then(() => process.exit(0));
  };
  // SIGHUP: the console window closed (Windows) or the terminal went away
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(sig, stop);
  return -1; // keep running: the waiter holds the process open
}

const invokedDirectly =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  // the output piped into something that stopped reading (`| head`): just end
  process.stdout.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EPIPE') process.exit(0);
  });
  // a release folder (0.14.0): data and modules sit next to app/ — first, before anything reads them
  applyLayout(root);
  setLang(consoleLang(process.env.VO_DATA_DIR ?? path.join(root, 'data')));
  if (!nodeVersionOk(process.versions.node)) {
    say(
      tr('Потрібен Node.js 22.18 або новіший (зараз {version}): https://nodejs.org', {
        version: process.versions.node,
      }),
    );
    process.exit(1);
  }
  void main(process.argv.slice(2)).then((code) => {
    if (code >= 0) process.exit(code);
  });
}
