import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  powerSaveBlocker,
  screen,
  session,
  shell,
  type BrowserWindowConstructorOptions,
  type Rectangle,
} from 'electron';
import {
  featureRect,
  outputPage,
  pageKind,
  placeOutput,
  returnDisplay,
  type Display,
} from './displays.js';

/**
 * VerseOrchestrator as a desktop app (feat/desktop, the user's ask 2026-10-13: the dependence on
 * browsers «починає муляти»). Electron brings its own Chromium, so the same engine everywhere; the
 * app itself is unchanged — the launcher (server/src/launcher.ts) runs it as always, with the
 * standby waiter phones reach, and this shell shows its pages in its own windows. What a browser
 * needed workarounds for, the shell does itself:
 *   - ONE control window: a second one is never opened, the one there comes forward (no leader /
 *     standby / «Взяти керування» between windows of one computer);
 *   - the settings window belongs to the control window: above it always, with it on focus, its
 *     field focused when it opens;
 *   - output windows on the screen the web app picks, fullscreen there at once (no click lent, no
 *     permission prompt, no popup blocker), above the rest, out of the taskbar (displays.ts);
 *   - sound plays without a click first (the countdown's beeps, a video's sound);
 *   - the screens stay awake while an output window is open;
 *   - no browser keys in the way (Ctrl+F, Ctrl+R… reach the app), the control window's place kept.
 * A running app on the port (this clone's own, say) is used as it is and left running at quit.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
/**
 * Where server/src/launcher.ts is: the repository (dev), or the release's app/ folder — found up
 * from the shell (desktop/VerseOrchestrator.exe, VerseOrchestrator.app/Contents/MacOS/…).
 */
function findAppRoot(): string {
  if (process.env.VO_APP_ROOT) return process.env.VO_APP_ROOT;
  let dir = app.isPackaged ? path.dirname(process.execPath) : path.resolve(here, '..', '..');
  for (let i = 0; i < 7; i++) {
    for (const at of [dir, path.join(dir, 'app')])
      if (fs.existsSync(path.join(at, 'server', 'src', 'launcher.ts'))) return at;
    dir = path.dirname(dir);
  }
  return path.resolve(here, '..', '..');
}
const appRoot = findAppRoot();
const PORT = Number(process.env.VO_PORT ?? 4747);
const ORIGIN = `http://localhost:${PORT}`;
const HEADERS = { 'X-VO-Control': '1' };
const PRELOAD = path.join(here, 'preload.cjs');

/** The app's icon on its windows and the taskbar (the .exe keeps Electron's: no tool for it here). */
const ICON = path.join(
  appRoot,
  'web',
  'dist',
  process.platform === 'win32' ? 'icon.ico' : 'icon.png',
);
const icon = fs.existsSync(ICON) ? ICON : undefined;

/** Every window's page settings: isolated, sandboxed, sound without a click first. */
const PAGE = {
  contextIsolation: true,
  sandbox: true,
  preload: PRELOAD,
  autoplayPolicy: 'no-user-gesture-required' as const,
  // this shell puts a reloaded full-screen window back full screen (1.25.3, preload.cts)
  additionalArguments: ['--vo-reload-fullscreen'],
};

/** Node for the launcher: the release's own (app/node), VO_NODE, else the one on PATH. */
function nodeRuntime(): string {
  const own = path.join(appRoot, 'node', process.platform === 'win32' ? 'node.exe' : 'bin/node');
  if (process.env.VO_NODE) return process.env.VO_NODE;
  return fs.existsSync(own) ? own : 'node';
}

async function answers(): Promise<boolean> {
  try {
    const r = await fetch(`${ORIGIN}/api/health`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

let launcher: ChildProcess | null = null;
/** What the launcher says goes to a file, not a pipe: the app outlives a crashed shell. */
const LAUNCHER_LOG = () => path.join(app.getPath('userData'), 'launcher.log');
const launcherLines = (): string[] => {
  try {
    return fs
      .readFileSync(LAUNCHER_LOG(), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim());
  } catch {
    return [];
  }
};

/** Why the start failed, in a line or two: the launcher's own words (✗ …), else the error's line. */
function whyNot(): string {
  const lines = launcherLines();
  const said = lines.filter((l) => l.startsWith('✗')).slice(-2);
  if (said.length) return said.join('\n');
  const error = lines.find((l) => /^\w*Error\b/.test(l.trim()));
  return error?.trim() ?? lines.slice(-2).join('\n');
}

/**
 * The first start may take minutes (the library, the parts) with nothing on the screen: a small
 * window says what is being done, once it takes longer than a moment.
 */
function openStart(): BrowserWindow {
  const w = new BrowserWindow({
    width: 440,
    height: 150,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e2025',
    title: 'VerseOrchestrator',
    icon,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  const html =
    '<meta charset="utf-8"><title>VerseOrchestrator</title><body style="margin:0;height:100vh;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:0 28px;box-sizing:border-box;background:#1e2025;color:#e9e9ea;font:15px system-ui,sans-serif;user-select:none">' +
    `<div>${say('Готую застосунок…', 'Getting the app ready…')}</div>` +
    '<div id="s" style="color:#9a9ca3;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">&nbsp;</div></body>';
  void w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const timer = setInterval(() => {
    const line = launcherLines()
      .filter((l) => /^[…✓!]|^\[builder\] step/.test(l))
      .at(-1);
    if (!line || w.isDestroyed()) return;
    // the folder's path is too long for it
    const said = line.replace(/^\[builder\] step/, '…').replace(/\s*\([^)]*[\\/][^)]*\)/, '');
    void w.webContents
      .executeJavaScript(`document.getElementById('s').textContent = ${JSON.stringify(said)}`)
      .catch(() => undefined);
  }, 400);
  w.on('closed', () => clearInterval(timer));
  return w;
}
/**
 * The app on the port was started by this shell: it stops at quit — even after an update, when
 * the swap started a new waiter of its own (server/src/swap.ts) and `launcher` is gone.
 */
let ownsApp = false;
/** the app is being started (the start window may be open); the program is quitting */
let starting = false;
let quitting = false;
let startWindow: BrowserWindow | null = null;
let handoverWaits: string | undefined;

/**
 * The launcher with all it started: on Windows a killed process leaves its children — the builder went on
 * writing the library, holding app/ against an update (4 processes seen). The builder writes in one transaction.
 */
function stopLauncher(): void {
  if (!launcher) return;
  if (process.platform === 'win32' && launcher.pid)
    try {
      execFileSync('taskkill', ['/pid', String(launcher.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5000,
      });
      return;
    } catch {
      /* gone already */
    }
  launcher.kill();
}

/** The app on PORT: the one already running, or the launcher started now (and waited for). */
async function startApp(): Promise<void> {
  if (await answers()) return;
  ownsApp = true;
  let log: number | 'ignore' = 'ignore';
  try {
    log = fs.openSync(LAUNCHER_LOG(), 'w');
  } catch {
    /* no log: the start window only says it is getting ready */
  }
  launcher = spawn(
    nodeRuntime(),
    [
      '--disable-warning=ExperimentalWarning',
      path.join(appRoot, 'server', 'src', 'launcher.ts'),
      '--no-browser',
      '--port',
      String(PORT),
    ],
    // from the home folder: a process sitting in app/ blocks an update's swap (EBUSY)
    { cwd: os.homedir(), stdio: ['ignore', log, log], windowsHide: true },
  );
  if (typeof log === 'number') fs.closeSync(log);
  launcher.on('exit', (code) => {
    launcher = null;
    if (code) console.error(`[desktop] the launcher exited (${code})`);
  });
  // the first start may install dependencies and build the library and the UI: minutes
  for (let i = 0; i < 1200; i++) {
    if (await answers()) return;
    if (!launcher) throw new Error('the launcher stopped before the app answered');
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('the app did not answer in 10 minutes');
}

const displays = (): Display[] =>
  screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds }));

// ── the control window's place, kept between starts ──────────────────────────────────────────
const PLACE_FILE = () => path.join(app.getPath('userData'), 'control-window.json');
type Kept = { bounds: Rectangle; maximized: boolean };
function keptPlace(): Kept | null {
  try {
    const k = JSON.parse(fs.readFileSync(PLACE_FILE(), 'utf8')) as Kept;
    // a screen unplugged since: a place no display shows is no place
    const on = screen.getAllDisplays().some((d) => {
      const b = d.workArea;
      return (
        k.bounds.x < b.x + b.width &&
        k.bounds.x + k.bounds.width > b.x &&
        k.bounds.y >= b.y - 50 &&
        k.bounds.y < b.y + b.height
      );
    });
    return on ? k : null;
  } catch {
    return null;
  }
}
function keepPlace(win: BrowserWindow): void {
  try {
    fs.writeFileSync(
      PLACE_FILE(),
      JSON.stringify({ bounds: win.getNormalBounds(), maximized: win.isMaximized() }),
    );
  } catch {
    /* not kept: the next start opens maximized */
  }
}

// ── the screens stay awake while something is shown ──────────────────────────────────────────
const outputs = new Set<BrowserWindow>();
/** the output windows that were opened fullscreen (always-on-top): the ones «Поступитися» toggles */
const fullscreenOutputs = new WeakSet<BrowserWindow>();
/**
 * The output windows a screen's unplug moved (1.24.0-beta.2): kept, so that the screen plugged back
 * gets the same windows back, full screen, instead of new ones.
 */
const displaced = new Set<BrowserWindow>();
/** …and on a Mac hidden: with Stage Manager on, macOS doesn't minimize a window for the program */
const setAside = new WeakSet<BrowserWindow>();

// «Поступитися екраном» for a video (1.21.0-beta.7, F1024-08): an output window (only a fullscreen
// one — a windowed output never hogs the screen) drops its always-on-top so the operator's own
// player can come forward on the 2nd screen, and takes it back on the next slide. Only a window the
// shell itself tracks as an output may ask — PAGE webPreferences are shared across pages.
ipcMain.on('vo-output-yield', (e, on: unknown) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || !outputs.has(w) || !fullscreenOutputs.has(w)) return;
  const yielding = on === true;
  w.setAlwaysOnTop(!yielding);
  w.setSkipTaskbar(!yielding && !w.isMinimized());
});

// F1107-03 (users, 2026-11-07): a full-screen output is out of the taskbar, so once minimized (Win+D,
// Win+M, Win+↓) it had no button to come back from — «треба закрити й відкрити». Minimized, it gets
// one; and it comes back by itself (not taking the keyboard from the control window) when something
// new goes on screen or «Вікно показу» is pressed: the page asks, `vo-output-restore`.
ipcMain.on('vo-output-restore', (e, asked: unknown) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || !outputs.has(w) || !(w.isMinimized() || setAside.has(w))) return;
  // put aside because its screen went: a new slide doesn't bring it over the operator, only
  // «Вікно показу» does (an older page doesn't say which: it comes, as before)
  if (displaced.has(w) && asked === false) return;
  setAside.delete(w);
  w.showInactive();
  if (w.isMinimized()) w.restore();
  if (control && !control.isDestroyed() && control.isVisible()) control.focus();
});
let awake: number | null = null;
function followOutputs(win: BrowserWindow): void {
  outputs.add(win);
  if (awake === null) awake = powerSaveBlocker.start('prevent-display-sleep');
  win.on('closed', () => {
    outputs.delete(win);
    if (outputs.size === 0 && awake !== null) {
      powerSaveBlocker.stop(awake);
      awake = null;
    }
  });
}

let control: BrowserWindow | null = null;
let settings: BrowserWindow | null = null;

function openControl(): BrowserWindow {
  const kept = keptPlace();
  const win = new BrowserWindow({
    ...(kept?.bounds ?? { width: 1400, height: 900 }),
    show: false,
    backgroundColor: '#1e2025',
    autoHideMenuBar: true,
    title: 'VerseOrchestrator',
    icon,
    webPreferences: PAGE,
  });
  win.once('ready-to-show', () => {
    if (!kept || kept.maximized) win.maximize();
    win.show();
    // a moment for the page to settle before a question over it
    setTimeout(() => void offerUpdate(win), 2500);
  });
  win.on('close', () => keepPlace(win));
  // the settings come back with the control window, above it
  win.on('focus', () => {
    if (settings && !settings.isDestroyed() && settings.isVisible()) settings.moveTop();
  });

  win.webContents.setWindowOpenHandler(({ url, features }) => {
    const kind = pageKind(url, ORIGIN);
    if (kind === 'external') {
      // the guide on GitHub, a link in a message: the system's browser
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    if (kind === 'control') {
      // one control window: the one there comes forward instead
      if (win.isMinimized()) win.restore();
      win.focus();
      return { action: 'deny' };
    }
    if (kind === 'settings') {
      const f = featureRect(features);
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          ...(f.width ? { width: f.width, height: f.height } : { width: 960, height: 720 }),
          ...(f.x !== undefined ? { x: f.x, y: f.y } : {}),
          parent: win, // above the control window always, minimized with it
          show: false, // drawn first: it opened as an empty dark rectangle (1.25.2)
          autoHideMenuBar: true,
          backgroundColor: '#1e2025',
          webPreferences: PAGE,
        },
      };
    }
    const options: BrowserWindowConstructorOptions = {
      autoHideMenuBar: true,
      backgroundColor: kind === 'output' ? '#000000' : '#1e2025',
      webPreferences: PAGE,
    };
    if (kind === 'output') {
      const controlDisplay = screen.getDisplayMatching(win.getBounds());
      const place = placeOutput(
        outputPage(url, ORIGIN),
        features,
        displays(),
        controlDisplay ? { id: controlDisplay.id, bounds: controlDisplay.bounds } : null,
      );
      Object.assign(options, place.bounds, {
        // a fullscreen output stays above the rest on its screen and out of the taskbar
        alwaysOnTop: place.fullscreen,
        skipTaskbar: place.fullscreen,
      });
      pendingFullscreen.set(url, place.fullscreen);
    }
    return { action: 'allow', overrideBrowserWindowOptions: options };
  });

  win.webContents.on('did-create-window', (child, { url }) => {
    const kind = pageKind(url, ORIGIN);
    if (kind === 'settings') {
      settings = child;
      child.on('closed', () => {
        if (settings === child) settings = null;
        // Windows may hand the keyboard to another program when an owned window closes: the control
        // window went behind it (1.25.2, the author)
        if (!win.isDestroyed() && !win.isMinimized()) win.focus();
      });
      // the keyboard goes there: the settings' search field takes it (SettingsPanel)
      const reveal = () => {
        if (child.isDestroyed() || child.isVisible()) return;
        child.show();
        child.focus();
      };
      child.once('ready-to-show', reveal);
      child.webContents.once('did-finish-load', () => {
        reveal();
        if (!child.isDestroyed()) child.focus();
      });
      // a page that never finishes is shown all the same
      setTimeout(reveal, 3000);
      return;
    }
    if (kind !== 'output') return;
    followOutputs(child);
    // «Поступитися екраном» (1.21.0-beta.7, F1024-08): track the output's REAL html-fullscreen state,
    // so a window that left fullscreen (the F key, a screen unplugged, a reload) drops out of the set
    // and is never forced always-on-top on un-yield. The initial requestFullscreen below adds it.
    child.webContents.on('enter-html-full-screen', () => fullscreenOutputs.add(child));
    child.webContents.on('leave-html-full-screen', () => fullscreenOutputs.delete(child));
    // F1107-03: minimized, a full-screen output shows in the taskbar; restored, it leaves it again
    // and is full-screen as before (Windows may drop the page's fullscreen on the way)
    let wasFull = false;
    child.on('minimize', () => {
      wasFull = fullscreenOutputs.has(child) || child.isFullScreen();
      child.setSkipTaskbar(false);
    });
    child.on('restore', () => {
      if (!wasFull) return;
      child.setSkipTaskbar(child.isAlwaysOnTop());
      if (fullscreenOutputs.has(child)) return;
      void child.webContents
        .executeJavaScript(
          'document.fullscreenElement ? true : document.documentElement.requestFullscreen().then(() => true, () => false)',
          true,
        )
        .catch(() => false);
    });
    // reloaded into a new version (1.25.3): full screen again, as it was
    let again = false;
    child.webContents.on('did-start-navigation', (d) => {
      if (d.isMainFrame && !d.isSameDocument) again = fullscreenOutputs.has(child);
    });
    const fullAgain = () => {
      if (!again || child.isDestroyed()) return;
      void child.webContents
        .executeJavaScript(
          'document.fullscreenElement ? true : document.documentElement.requestFullscreen().then(() => true, () => false)',
          true,
        )
        .then((ok) => {
          if (ok === true) again = false; // else once more when all has loaded
        })
        .catch(() => undefined);
    };
    if (process.platform === 'darwin') {
      // a Mac's full screen is a Space, left with an animation (~0.6 s): asked for during it, the page
      // hears «full screen» but the window stays framed in the hall's sight. So after its end — not in
      // its event either, the window still counts as on its way there
      child.on('leave-full-screen', () => setTimeout(fullAgain, 0));
      child.webContents.on('did-finish-load', () => setTimeout(fullAgain, 2000));
    } else {
      // as soon as there is a page: a framed window is in the hall's sight as short as can be
      child.webContents.on('dom-ready', fullAgain);
      child.webContents.on('did-finish-load', fullAgain);
    }
    const full = pendingFullscreen.get(url) ?? false;
    pendingFullscreen.delete(url);
    if (!full) return;
    // the page's own fullscreen (not the system's): the web app sees it (document.fullscreenElement),
    // its F key and «На весь екран» work on it as in a browser — here with no click first
    child.webContents.once('did-finish-load', () => {
      void child.webContents
        .executeJavaScript(
          'document.documentElement.requestFullscreen().then(() => true, () => false)',
          true,
        )
        .catch(() => false);
    });
  });
  win.on('closed', () => {
    control = null;
    // the output windows go with the control window
    for (const w of BrowserWindow.getAllWindows()) w.close();
  });
  void win.loadURL(
    controlUrl(handoverWaits ?? handoverOf(process.argv) ?? process.env.VO_HANDOVER),
  );
  return win;
}

/**
 * Opened by «Відкрити застосунок» / «Встановити застосунок» from a browser's control window
 * (1.18.1, server desktopShell): a one-time token in `--handover=` (macOS: VO_HANDOVER) — the
 * control window loads with it, the hub puts it in charge and tells the browser's window, which
 * closes itself (handover.ts, the browser's control window).
 */
function handoverOf(argv: readonly string[]): string | undefined {
  const a = argv.find((x) => x.startsWith('--handover='));
  const t = a?.slice('--handover='.length);
  return t && /^[\w-]{8,64}$/.test(t) ? t : undefined;
}
const controlUrl = (handover: string | undefined) =>
  handover ? `${ORIGIN}/?handover=${encodeURIComponent(handover)}` : `${ORIGIN}/`;
/** the fullscreen decided for an output window between its handler and its creation */
const pendingFullscreen = new Map<string, boolean>();

// ── a new version offered at the start (the author: «при знайдені нового пропонувати при запуску») ──

const uk = () => app.getLocale().toLowerCase().startsWith('uk');
const say = (ua: string, en: string) => (uk() ? ua : en);

interface UpdateAnswer {
  current?: string;
  available?: boolean;
  enabled?: boolean;
  pinned?: boolean;
  latest?: { version?: string } | null;
  installer?: { phase?: string; received?: number; total?: number; error?: unknown } | null;
}

async function updateState(fresh = false): Promise<UpdateAnswer | null> {
  try {
    const r = await fetch(`${ORIGIN}/api/update${fresh ? '?fresh=1' : ''}`, { headers: HEADERS });
    return r.ok ? ((await r.json()) as UpdateAnswer) : null;
  } catch {
    return null;
  }
}

/**
 * At the start: a newer version on the chosen channel (Налаштування → Оновлення) is offered in a
 * dialog of the app's own — «Оновити зараз» downloads it, swaps app/ (the shell's code with it) and
 * the windows come back on the new version. Not for a version chosen to stay on (pinned), nor
 * with the checks off, nor in a repository copy (it updates by git).
 */
async function offerUpdate(win: BrowserWindow): Promise<void> {
  const u = await updateState(true);
  const version = u?.latest?.version;
  if (!u?.available || !version || u.pinned || u.enabled === false || !u.installer) return;
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'VerseOrchestrator',
    message: say(`Вийшла нова версія — ${version}`, `A new version is out — ${version}`),
    detail: say(
      `Зараз у вас ${u.current}. Оновлення займе хвилину; дані й налаштування лишаються, а попередню версію можна повернути в «Оновлення».`,
      `You have ${u.current}. The update takes a minute; your data and settings stay, and the previous version can be brought back in «Оновлення».`,
    ),
    buttons: [say('Оновити зараз', 'Update now'), say('Пізніше', 'Later')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (response === 0) await updateNow(win, version);
}

async function updateNow(win: BrowserWindow, version: string): Promise<void> {
  const post = (p: string, body?: object) =>
    fetch(`${ORIGIN}${p}`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
  const fail = (why: string) => {
    win.setProgressBar(-1);
    dialog.showErrorBox(
      'VerseOrchestrator',
      say(
        `Не вдалося оновити: ${why}\nСпробуйте ще раз у «Оновлення».`,
        `The update failed: ${why}\nTry again in «Оновлення».`,
      ),
    );
  };
  const started = await post('/api/update/download').catch(() => null);
  if (!started?.ok)
    return fail(started ? await started.text() : say('немає зв’язку', 'no connection'));
  // the download's progress on the taskbar / Dock icon
  for (let i = 0; i < 1800; i++) {
    const s = await updateState();
    const phase = s?.installer?.phase;
    if (phase === 'ready') break;
    if (phase === 'error') return fail(JSON.stringify(s?.installer?.error ?? ''));
    const { received = 0, total = 0 } = s?.installer ?? {};
    win.setProgressBar(total > 0 ? received / total : 2); // 2: «working», no share known
    await new Promise((r) => setTimeout(r, 1000));
  }
  win.setProgressBar(2);
  const restarted = await post('/api/update/restart').catch(() => null);
  if (!restarted?.ok)
    return fail(restarted ? await restarted.text() : say('немає зв’язку', 'no connection'));
  // the new version answers: the windows show it
  for (let i = 0; i < 360; i++) {
    try {
      const h = (await (await fetch(`${ORIGIN}/api/health`)).json()) as { version?: string };
      if (h.version === version) break;
    } catch {
      /* restarting */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  win.setProgressBar(-1);
  win.reload();
}

/** Back, full screen and on top, on `d` — as an output opened there would be. */
function returnOutput(w: BrowserWindow, d: Electron.Display): void {
  // its place first, then back — the one fullscreen request below is made on that screen (review)
  w.setBounds({ ...d.bounds });
  if (w.isMinimized()) w.restore();
  setAside.delete(w);
  w.showInactive();
  w.setAlwaysOnTop(true);
  w.setSkipTaskbar(true);
  void askFullscreen(w);
  // a Mac: a window just shown again may not be drawn yet, and its page's request is then lost — until
  // the window itself is full screen
  if (process.platform === 'darwin')
    for (const ms of [700, 2000, 4000])
      setTimeout(() => {
        if (w.isDestroyed() || w.isFullScreen() || displaced.has(w)) return;
        void askFullscreen(w);
      }, ms);
}

/** The page's own full screen, with no click first; whether it got it. */
function askFullscreen(w: BrowserWindow): Promise<boolean> {
  return w.webContents
    .executeJavaScript(
      'document.fullscreenElement ? true : document.documentElement.requestFullscreen().then(() => true, () => false)',
      true,
    )
    .then((ok) => ok === true)
    .catch(() => false);
}

/**
 * A screen unplugged: its fullscreen windows come back as windows on the control window's screen —
 * minimized since 1.24.0-beta.2, so they don't cover the operator; plugged back in, the same
 * windows return to it full screen, and the control window hears of it (`vo-display-back`: the
 * operator's choice — leave it, black, clear — and «Відкривати вікно показу автоматично» when
 * none had been there).
 */
function followDisplays(): void {
  /** a screen went with an output on it: the next screen to come is its return (review: not any) */
  let lost = false;
  screen.on('display-added', (_e, added) => {
    if (!lost) return;
    const main = control ? screen.getDisplayMatching(control.getBounds()) : null;
    const to = returnDisplay(
      { id: added.id, bounds: added.bounds },
      main ? { id: main.id, bounds: main.bounds } : null,
    );
    if (!to) return;
    lost = false;
    let returned = 0;
    for (const w of displaced) {
      if (w.isDestroyed()) continue;
      returnOutput(w, added);
      returned++;
    }
    displaced.clear();
    // none returned (closed meanwhile) and none open: the control window may open one
    if (returned === 0 && outputs.size > 0) return;
    if (control && !control.isDestroyed()) control.webContents.send('vo-display-back', returned);
  });
  screen.on('display-removed', () => {
    const ids = new Set(screen.getAllDisplays().map((d) => d.id));
    const main = control
      ? screen.getDisplayMatching(control.getBounds())
      : screen.getPrimaryDisplay();
    for (const w of outputs) {
      const d = screen.getDisplayMatching(w.getBounds());
      if (ids.has(d.id) && d.id !== main.id) continue;
      // full screen = it was on the screen that went (an output on the control window's screen
      // is a window): only those wait for the screen's return (review)
      const wasOnTheOther = fullscreenOutputs.has(w) || w.isFullScreen();
      void w.webContents.executeJavaScript(
        'document.fullscreenElement && document.exitFullscreen()',
        true,
      );
      w.setFullScreen(false);
      w.setAlwaysOnTop(false);
      w.setSkipTaskbar(false);
      const place = () => {
        // closed, or its screen is back already
        if (w.isDestroyed() || (wasOnTheOther && !displaced.has(w))) return;
        w.setBounds({ x: main.bounds.x + 80, y: main.bounds.y + 80, width: 960, height: 540 });
        if (!wasOnTheOther) return;
        if (process.platform !== 'darwin') return w.minimize();
        setAside.add(w);
        w.hide();
      };
      if (wasOnTheOther) {
        // out of the operator's way until its screen comes back (it has a taskbar button now); not
        // full screen any more — its 'restore' must not ask for it on the control window's screen
        fullscreenOutputs.delete(w);
        lost = true;
        displaced.add(w);
        w.once('closed', () => displaced.delete(w));
      }
      // a Mac's window leaves its full screen with an animation and gets a place of macOS's own at its
      // end (it stood over the control window): ours after it
      if (process.platform === 'darwin' && w.isFullScreen())
        w.once('leave-full-screen', () => setTimeout(place, 0));
      else place();
    }
  });
}

/** The web app's own permissions, for its own origin only: every screen, fullscreen, notices. */
function grantPermissions(): void {
  const ours = (u: string) => {
    try {
      return new URL(u).origin === ORIGIN;
    } catch {
      return false;
    }
  };
  const allowed = new Set([
    'window-management',
    'fullscreen',
    'notifications',
    'clipboard-sanitized-write',
  ]);
  session.defaultSession.setPermissionRequestHandler((wc, perm, done) =>
    done(allowed.has(perm) && ours(wc.getURL())),
  );
  session.defaultSession.setPermissionCheckHandler(
    (_wc, perm, origin) => allowed.has(perm) && ours(origin),
  );
}

/**
 * No browser menu: its keys (Ctrl+F, Ctrl+R, Ctrl+W…) reach the app's own. A Mac keeps the menu
 * bar it can't do without — the app menu (⌘Q, «Налаштування…»), Edit (copy, paste in the fields) and
 * Window (⌘M, ⌘W, the open windows). In the system's language: Electron's own labels are English.
 */
function setMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  const name = 'VerseOrchestrator';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: name,
        submenu: [
          { role: 'about', label: say(`Про ${name}`, `About ${name}`) },
          { type: 'separator' },
          {
            label: say('Налаштування…', 'Settings…'),
            accelerator: 'Cmd+,',
            // shown only: the key itself is the page's (a rebound one too)
            registerAccelerator: false,
            click: openSettings,
          },
          { type: 'separator' },
          { role: 'services', label: say('Служби', 'Services') },
          { type: 'separator' },
          { role: 'hide', label: say(`Сховати ${name}`, `Hide ${name}`) },
          { role: 'hideOthers', label: say('Сховати інші', 'Hide Others') },
          { role: 'unhide', label: say('Показати всі', 'Show All') },
          { type: 'separator' },
          { role: 'quit', label: say(`Завершити ${name}`, `Quit ${name}`) },
        ],
      },
      {
        label: say('Редагування', 'Edit'),
        submenu: [
          { role: 'undo', label: say('Скасувати', 'Undo') },
          { role: 'redo', label: say('Повторити', 'Redo') },
          { type: 'separator' },
          { role: 'cut', label: say('Вирізати', 'Cut') },
          { role: 'copy', label: say('Скопіювати', 'Copy') },
          { role: 'paste', label: say('Вставити', 'Paste') },
          { role: 'delete', label: say('Видалити', 'Delete') },
          { role: 'selectAll', label: say('Вибрати все', 'Select All') },
        ],
      },
      {
        role: 'window',
        label: say('Вікно', 'Window'),
        submenu: [
          { role: 'minimize', label: say('Згорнути', 'Minimize') },
          { role: 'zoom', label: say('Масштабувати', 'Zoom') },
          {
            label: say('Закрити вікно', 'Close Window'),
            accelerator: 'Cmd+W',
            // the control window (the show goes with it) and a full-screen output stay
            click: (_item, w) => {
              const win = w instanceof BrowserWindow ? w : null;
              if (!win || win === control || win.isFullScreen()) shell.beep();
              else win.close();
            },
          },
          { type: 'separator' },
          { role: 'front', label: say('На передній план усі', 'Bring All to Front') },
        ],
      },
    ]),
  );
}

/** «Налаштування…» of the Mac's app menu: the control window opens them (useAppSettingsOpener). */
function openSettings(): void {
  if (!control || control.isDestroyed()) return;
  void control.webContents
    .executeJavaScript(`window.dispatchEvent(new Event('vo:open-settings'))`)
    .catch(() => undefined);
}

/** The control window in front: from the Dock (macOS), or the app started again. */
function showControl(): void {
  if (!control || control.isDestroyed()) return;
  if (control.isMinimized()) control.restore();
  control.show();
  control.focus();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_e, argv) => {
    // opened again from a browser's control window: this one takes charge (the token)
    const token = handoverOf(argv);
    if (!control) {
      // still starting: its window in front, the token kept for the control window
      handoverWaits = token ?? handoverWaits;
      if (startWindow && !startWindow.isDestroyed()) startWindow.focus();
      return;
    }
    showControl();
    if (token) void control.loadURL(controlUrl(token));
  });
  app.on('window-all-closed', () => app.quit());
  // a Mac's Dock: with the output shown on the other screen macOS takes the app for visible, and the
  // minimized control window did not come back
  app.on('activate', (_e, hasVisible) => {
    if (!hasVisible || control?.isMinimized()) showControl();
  });
  // no window of the app ever leaves the app's pages (F1017-03): a file dropped where no page took
  // it would open in its place; a web link goes to the system's browser
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (e, url) => {
      if (url.startsWith(`${ORIGIN}/`) || url === ORIGIN) return;
      e.preventDefault();
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    });
  });
  app.on('before-quit', () => {
    quitting = true;
    // closed while it was getting ready: nothing answers on the port yet
    if (starting) stopLauncher();
    // the app this shell started stops with it; one it found running stays
    if (ownsApp)
      void fetch(`${ORIGIN}/__standby/shutdown`, { method: 'POST', headers: HEADERS }).catch(
        () => {},
      );
  });
  void app.whenReady().then(async () => {
    setMenu();
    grantPermissions();
    followDisplays();
    starting = true;
    const timer = setTimeout(() => (startWindow = openStart()), 1500);
    try {
      await startApp();
    } catch (e) {
      console.error(`[desktop] ${(e as Error).message}`);
      const why = whyNot();
      clearTimeout(timer);
      if (!quitting)
        dialog.showErrorBox(
          'VerseOrchestrator',
          `${say('Застосунок не запустився.', 'The app did not start.')}${why && `\n\n${why}`}\n\n${say('Журнал', 'Log')}: ${LAUNCHER_LOG()}`,
        );
      app.quit();
      return;
    }
    clearTimeout(timer);
    starting = false;
    if (quitting) return;
    control = openControl();
    // the start window goes when the control window is drawn — or can't be: it must not hold the app open
    const drop = () => {
      if (startWindow && !startWindow.isDestroyed()) startWindow.destroy();
    };
    control.once('ready-to-show', drop);
    control.once('closed', drop);
    control.webContents.once('did-fail-load', drop);
  });
}
