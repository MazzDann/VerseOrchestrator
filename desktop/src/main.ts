import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, screen, session, shell } from 'electron';
import { outputPage, placeOutput, type Display } from './displays.js';

/**
 * VerseOrchestrator as a desktop app (feat/desktop, the user's ask 2026-10-13: the dependence on
 * browsers «починає муляти»). Electron brings its own Chromium, so the same engine everywhere; the
 * app itself is unchanged — the launcher (server/src/launcher.ts) runs it as always, with the
 * standby waiter phones reach, and this shell shows its pages in its own windows:
 *   - the control window;
 *   - output windows on the screen the web app picks, fullscreen at once on another screen — no
 *     click, no permission prompt, no popup blocker (displays.ts);
 *   - the Window Management API granted, so the web app sees every screen.
 * A running app on the port (this clone's own, say) is used as it is and left running at quit.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
/** the repository (dev) or the release's app/ folder: where server/src/launcher.ts is */
const appRoot = process.env.VO_APP_ROOT ?? path.resolve(here, '..', '..');
const PORT = Number(process.env.VO_PORT ?? 4747);
const ORIGIN = `http://localhost:${PORT}`;
const HEADERS = { 'X-VO-Control': '1' };

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

/** The app on PORT: the one already running, or the launcher started now (and waited for). */
async function startApp(): Promise<void> {
  if (await answers()) return;
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

let control: BrowserWindow | null = null;

function openControl(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    backgroundColor: '#1e2025',
    autoHideMenuBar: true,
    title: 'VerseOrchestrator',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });
  win.webContents.setWindowOpenHandler(({ url, features }) => {
    const page = outputPage(url, ORIGIN);
    if (!url.startsWith(ORIGIN)) {
      // the guide on GitHub, a link in a message: the system's browser
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    const controlDisplay = screen.getDisplayMatching(win.getBounds());
    const place = placeOutput(
      page,
      features,
      displays(),
      controlDisplay ? { id: controlDisplay.id, bounds: controlDisplay.bounds } : null,
    );
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        ...place.bounds,
        autoHideMenuBar: true,
        backgroundColor: page ? '#000000' : '#1e2025',
        fullscreen: place.fullscreen,
        // an output window covers its whole screen and stays above the rest there
        alwaysOnTop: place.fullscreen,
        webPreferences: { contextIsolation: true, sandbox: true },
      },
    };
  });
  win.webContents.on('did-create-window', (child, { url }) => {
    const page = outputPage(url, ORIGIN);
    if (!page) return;
    // Windows sizes a frameless fullscreen by the display it starts on: set it again there
    if (child.isFullScreen()) {
      const d = screen.getDisplayMatching(child.getBounds());
      child.setFullScreen(false);
      child.setBounds(d.bounds);
      child.setFullScreen(true);
    }
  });
  win.on('closed', () => {
    control = null;
    // the output windows go with the control window
    for (const w of BrowserWindow.getAllWindows()) w.close();
  });
  void win.loadURL(`${ORIGIN}/`);
  return win;
}

/** A screen unplugged: its fullscreen windows come back as windows on the control window's screen. */
function followDisplays(): void {
  screen.on('display-removed', () => {
    const ids = new Set(screen.getAllDisplays().map((d) => d.id));
    const main = control
      ? screen.getDisplayMatching(control.getBounds())
      : screen.getPrimaryDisplay();
    for (const w of BrowserWindow.getAllWindows()) {
      if (w === control) continue;
      const d = screen.getDisplayMatching(w.getBounds());
      if (ids.has(d.id) && d.id !== main.id) continue;
      w.setFullScreen(false);
      w.setAlwaysOnTop(false);
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
    if (launcher)
      void fetch(`${ORIGIN}/__standby/shutdown`, { method: 'POST', headers: HEADERS }).catch(
        () => {},
      );
  });
  void app.whenReady().then(async () => {
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
