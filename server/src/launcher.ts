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
import { currentEntry, isAutostartOn, setAutostart, type AutostartEntry } from './autostart.ts';
import { appWindowCommand, createShortcut } from './shortcut.ts';
import {
  appProcess,
  buildUi,
  CONTROL_HEADER,
  createStandby,
  needsBuild,
  portFree,
  readStandbySettings,
  run,
  waiterAt,
} from './standby.ts';

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
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-browser') o.browser = false;
    else if (a === '--check') o.check = true;
    else if (a === '--off') o.off = true;
    else if (a === '--app') o.app = true;
    else if (a === '--shortcut') o.shortcut = true;
    else if (a === '--port') {
      const port = Number(argv[++i]);
      if (!Number.isInteger(port) || port < 1024 || port > 65535)
        return 'Порт — ціле число від 1024 до 65535, наприклад: --port 4748';
      o.port = port;
    } else
      return `Невідомий параметр «${a}». Можна: --no-browser, --port N, --check, --off, --app, --shortcut`;
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

const secs = (from: number) => `${((Date.now() - from) / 1000).toFixed(1)} с`;
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

function openBrowser(url: string, asApp = false): void {
  // an app window if asked and Chrome/Edge is there, else the default browser
  const cmd =
    (asApp && appWindowCommand(process.platform, url)) || browserCommand(process.platform, url);
  if (!cmd) {
    say(`  Відкрийте в браузері: ${url}`);
    return;
  }
  const child = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true, windowsHide: true });
  child.on('error', () => say(`  Відкрийте в браузері: ${url}`));
  child.unref();
}

async function main(argv: string[]): Promise<number> {
  const opts = parseArgs(argv);
  if (typeof opts === 'string') {
    say(opts);
    return 2;
  }
  const started = Date.now();
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const dataDir = process.env.VO_DATA_DIR ?? path.join(root, 'data');
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
  say(
    `VerseOrchestrator ${version}${opts.check ? ' — перевірка' : opts.off ? ' — вимкнення' : ''}`,
  );
  const settings = readStandbySettings(dataDir);
  const port = opts.port ?? settings.port;
  const local = `http://localhost:${port}`;

  // --off: «Вимкнути повністю» from the console (0.7.2)
  if (opts.off) {
    const r = await switchOff(port, currentEntry(root));
    if (r.stillRunning) {
      say(`✗ Застосунок на :${port} не зупинився. Закрийте вікно, де його запущено.`);
      return 1;
    }
    say(
      r.wasRunning
        ? `✓ Застосунок зупинено (працював на :${port})`
        : `✓ На :${port} застосунок не працював`,
    );
    say(r.autostartRemoved ? '✓ Автозапуск разом з комп’ютером прибрано' : '✓ Автозапуску не було');
    say('');
    say(`Поза папкою застосунку лишилися тільки дані браузера для ${local}: копії`);
    say(
      'налаштувань і кеш бібліотеки (самі налаштування — у data/). Щоб стерти й їх, запустіть застосунок і в',
    );
    say('Налаштування вигляду → Застосунок виберіть «Вимкнути повністю» з позначкою «стерти');
    say('дані браузера» — або видаліть дані цього сайту в налаштуваннях браузера. Після цього');
    say('папку застосунку можна просто видалити.');
    return 0;
  }

  // --shortcut: the desktop shortcut, then done (0.7.5)
  if (opts.shortcut) {
    try {
      const files = createShortcut(root);
      say(`✓ Ярлик на робочому столі: ${files[0]}`);
      say(
        '  Він запускає застосунок і відкриває вікно керування окремим вікном (Chrome або Edge).',
      );
      return 0;
    } catch (err) {
      say(`✗ Ярлик не створено: ${(err as Error).message}`);
      return 1;
    }
  }

  // Already running (autostart, a second launch): open it — there is nothing to prepare
  const running = !!(await waiterAt(port));
  if (running && !opts.check) {
    say(`✓ Застосунок уже працює: ${local}`);
    if (opts.browser) openBrowser(`${local}/`, opts.app);
    return 0;
  }

  // 1. Dependencies (npm ci on a fresh copy — needs the internet once)
  const deps = depsState(root);
  if (deps.state === 'ok') say('✓ Залежності на місці');
  else if (opts.check)
    say(
      `! Залежності: ${deps.state === 'install' ? 'не встановлено' : 'встановлено для іншої системи'} (npm ci)`,
    );
  else {
    const t = Date.now();
    say(
      deps.state === 'install'
        ? '… Встановлюю залежності (npm ci; перший раз — кілька хвилин, потрібен інтернет)'
        : '… Залежності встановлено для іншої системи — перевстановлюю (npm ci)',
    );
    try {
      await run('npm', NPM_CI[deps.mode], root, log, { inherit: true });
    } catch {
      say('✗ Не вдалося встановити залежності. Перевірте інтернет і запустіть ще раз.');
      return 1;
    }
    say(`✓ Залежності встановлено за ${secs(t)}`);
  }

  // 2. The native SQLite module (a folder moved to another Node version / system)
  let sqlite = deps.state === 'ok' || !opts.check ? sqliteLoads() : { ok: false, error: '' };
  if (!sqlite.ok && !opts.check) {
    say('… Модуль SQLite зібрано для іншої версії Node — перебудовую');
    try {
      await run('npm', ['rebuild', 'better-sqlite3'], root, log, { inherit: true });
    } catch {
      /* reported below */
    }
    sqlite = sqliteLoads();
  }
  if (sqlite.ok) {
    say('✓ Модуль SQLite працює');
    if (!opts.check)
      try {
        writeDepsRecord(root, deps.mode);
      } catch {
        /* read-only copy: checked again next time */
      }
  } else if (deps.state === 'ok' || !opts.check) {
    say(`✗ Модуль SQLite не завантажується: ${sqlite.error || 'невідома помилка'}`);
    say('  Спробуйте: npm ci');
    if (!opts.check) return 1;
  }

  // 3. The library: the server's, or built from MyBible modules, or the browser's segments
  const lib = libraryState(root);
  if (lib.kind === 'ready') say('✓ Бібліотека на місці');
  else if (lib.kind === 'build' && opts.check) say(`! Бібліотеку буде зібрано з ${lib.modules}`);
  else if (lib.kind === 'build') {
    const t = Date.now();
    say(`… Збираю бібліотеку з модулів MyBible (${lib.modules}; кілька хвилин)`);
    try {
      await run('npm', ['run', 'build:library'], root, log, { inherit: true });
      say(`✓ Бібліотеку зібрано за ${secs(t)}`);
    } catch {
      say('✗ Бібліотеку не вдалося зібрати — застосунок запуститься без неї (див. вище).');
    }
  } else if (lib.kind === 'browser') {
    say('! Бібліотеки сервера немає: тексти читатиме браузер (Налаштування вигляду →');
    say('  Застосунок → Джерело даних → «у браузері»); телефони й пульт їх не побачать.');
  } else {
    say('! Бібліотеки немає: покладіть модулі MyBible (*.SQLite3) у папку modules/ і');
    say('  запустіть ще раз. Застосунок запуститься, але без текстів.');
  }

  // 4. The UI (web/dist), built for this version of the code
  if (!needsBuild(root)) say('✓ Інтерфейс зібрано');
  else if (opts.check) say('! Інтерфейс буде зібрано (npm run build --workspace @vo/web)');
  else {
    const t = Date.now();
    say('… Збираю інтерфейс (до хвилини)');
    // the bundler's own report (chunk sizes …) is for developers: shown only if it fails
    const output: string[] = [];
    try {
      await buildUi(root, (m) => {
        log(m);
        output.push(m);
      });
    } catch {
      say(output.join('\n').split('\n').slice(-15).join('\n'));
      say('✗ Інтерфейс не зібрано (див. вище). Спробуйте: npm ci, тоді запустіть ще раз.');
      return 1;
    }
    say(`✓ Інтерфейс зібрано за ${secs(t)}`);
  }

  // 5. The address
  if (running) {
    say(`✓ Застосунок уже працює: ${local}`);
    return 0;
  }
  if (!(await portFree(port))) {
    say(`✗ Порт ${port} зайнятий іншою програмою. Запустіть з іншим: --port 4748`);
    say('  (або змініть його в data/settings.json → standby → port).');
    return 1;
  }
  if (opts.check) {
    say(`✓ Порт ${port} вільний. Перевірку завершено за ${secs(started)}.`);
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
      // closed: by Ctrl+C / the window (stop below), «Запуск за адресою» turned off, or
      // «Вимкнути повністю» (0.7.1)
      onRetired: (why) => {
        if (why === 'shutdown')
          say(
            'Застосунок вимкнено («Вимкнути повністю»). Щоб запустити знову, запустіть цей файл.',
          );
        else if (!stopping)
          say('«Запуск за адресою» вимкнено в налаштуваннях — застосунок зупинено.');
        process.exit(0);
      },
      // the port changed in Settings → Застосунок: carry on at the new one
      onRelaunch: () =>
        void serve(readStandbySettings(dataDir).port).catch((err: Error) => {
          say(`✗ Не вдалося перейти на новий порт: ${err.message}`);
          process.exit(1);
        }),
    });
    current = standby;
    await standby.listen();
    // the app inherits it: «Вимкнути повністю» then tells this very waiter (0.7.1)
    process.env.VO_STANDBY_PORT = String(p);
    await standby.start();
    say('');
    say(`✓ Застосунок працює (${secs(started)}). Вікно керування: http://localhost:${p}`);
    const phone = phoneUrl(lanIps(), p);
    say(
      phone
        ? `  Телефони в тій самій мережі Wi-Fi: ${phone}`
        : '  Мережі не видно: телефони під’єднаються, коли комп’ютер буде в мережі.',
    );
    say('  Зупинити: Ctrl+C або закрийте це вікно.');
    say('');
  };
  try {
    await serve(port);
  } catch (err) {
    say(`✗ Застосунок не запустився: ${(err as Error).message}`);
    return 1;
  }
  if (opts.browser) openBrowser(`${local}/`, opts.app);

  const stop = () => {
    stopping = true;
    say('Зупиняю…');
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
  if (!nodeVersionOk(process.versions.node)) {
    say(`Потрібен Node.js 22.18 або новіший (зараз ${process.versions.node}): https://nodejs.org`);
    process.exit(1);
  }
  void main(process.argv.slice(2)).then((code) => {
    if (code >= 0) process.exit(code);
  });
}
