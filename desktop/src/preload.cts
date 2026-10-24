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
  // «Поступитися екраном» for a video (1.21.0-beta.7, F1024-08): an output window asks the shell to
  // drop its always-on-top (on = true) so the operator's own player can come forward, or restore it.
  outputYield: (on: boolean): void => {
    ipcRenderer.send('vo-output-yield', on === true);
  },
});
