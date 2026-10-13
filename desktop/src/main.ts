import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  powerSaveBlocker,
  screen,
  session,
  shell,
  type BrowserWindowConstructorOptions,
  type Rectangle,
} from 'electron';
import { featureRect, outputPage, pageKind, placeOutput, type Display } from './displays.js';

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

/** Every window's page settings: isolated, sandboxed, sound without a click first. */
const PAGE = {
  contextIsolation: true,
  sandbox: true,
  preload: PRELOAD,
  autoplayPolicy: 'no-user-gesture-required' as const,
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
/**
 * The app on the port was started by this shell: it stops at quit — even after an update, when
 * the swap started a new waiter of its own (server/src/swap.ts) and `launcher` is gone.
 */
let ownsApp = false;

/** The app on PORT: the one already running, or the launcher started now (and waited for). */
async function startApp(): Promise<void> {
  if (await answers()) return;
  ownsApp = true;
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
    { cwd: os.homedir(), stdio: 'inherit', windowsHide: true },
  );
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
          ...(f.width ? { width: f.width, height: f.height } : { width: 560, height: 820 }),
          ...(f.x !== undefined ? { x: f.x, y: f.y } : {}),
          parent: win, // above the control window always, minimized with it
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
      });
      // the keyboard goes there: the settings' search field takes it (SettingsPanel)
      child.once('ready-to-show', () => child.focus());
      child.webContents.once('did-finish-load', () => child.focus());
      return;
    }
    if (kind !== 'output') return;
    followOutputs(child);
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
  void win.loadURL(`${ORIGIN}/`);
  return win;
}
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

/** A screen unplugged: its fullscreen windows come back as windows on the control window's screen. */
function followDisplays(): void {
  screen.on('display-removed', () => {
    const ids = new Set(screen.getAllDisplays().map((d) => d.id));
    const main = control
      ? screen.getDisplayMatching(control.getBounds())
      : screen.getPrimaryDisplay();
    for (const w of outputs) {
      const d = screen.getDisplayMatching(w.getBounds());
      if (ids.has(d.id) && d.id !== main.id) continue;
      void w.webContents.executeJavaScript(
        'document.fullscreenElement && document.exitFullscreen()',
        true,
      );
      w.setFullScreen(false);
      w.setAlwaysOnTop(false);
      w.setSkipTaskbar(false);
      w.setBounds({ x: main.bounds.x + 80, y: main.bounds.y + 80, width: 960, height: 540 });
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
 * bar it can't do without — the app menu (⌘Q) and Edit (copy, paste in the fields).
 */
function setMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (!control) return;
    if (control.isMinimized()) control.restore();
    control.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
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
    try {
      await startApp();
    } catch (e) {
      console.error(`[desktop] ${(e as Error).message}`);
      app.quit();
      return;
    }
    control = openControl();
  });
}
