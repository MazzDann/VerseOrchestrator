/**
 * What the pages learn about the desktop shell (sandboxed preload: CommonJS, no Node). The web app
 * reads `window.voDesktop` to leave out what only a browser needs (lib/desktop.ts): the browser
 * choice, the notices about tabs, popups and fullscreen clicks.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('voDesktop', {
  shell: 'electron',
  version: process.versions.electron ?? '',
  platform: process.platform,
  // 1.25.3: said by the running shell itself — after an update this file is new, the shell may be old
  reloadKeepsFullscreen: process.argv.includes('--vo-reload-fullscreen'),
  // «Поступитися екраном» for a video (1.21.0-beta.7, F1024-08): an output window asks the shell to
  // drop its always-on-top (on = true) so the operator's own player can come forward, or restore it.
  outputYield: (on: boolean): void => {
    ipcRenderer.send('vo-output-yield', on === true);
  },
  // F1107-03: a minimized output window asks to come back (something new on screen: asked = false,
  // «Вікно показу»: true)
  outputRestore: (asked?: boolean): void => {
    ipcRenderer.send('vo-output-restore', asked);
  },
  // 1.26.0-beta.1: the settings window is hidden at its close, not gone — shown again at a place
  ...(process.argv.includes('--vo-keeps-settings')
    ? {
        showSettings: (box: unknown): Promise<boolean> =>
          ipcRenderer.invoke('vo-show-settings', box) as Promise<boolean>,
      }
    : {}),
  // 1.24.0-beta.2: a 2nd screen plugged back in — the shell returned `n` output windows to it; the
  // control window does the operator's choice (leave it, black, clear) or opens one when none was
  onDisplayBack: (cb: (n: number) => void): (() => void) => {
    const h = (_e: unknown, n: unknown) => cb(typeof n === 'number' ? n : 0);
    ipcRenderer.on('vo-display-back', h);
    return () => {
      ipcRenderer.removeListener('vo-display-back', h);
    };
  },
});
