/**
 * What the pages learn about the desktop shell (sandboxed preload: CommonJS, no Node). The web app
 * reads `window.voDesktop` to leave out what only a browser needs (lib/desktop.ts): the browser
 * choice, the notices about tabs, popups and fullscreen clicks.
 */
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('voDesktop', {
  shell: 'electron',
  version: process.versions.electron ?? '',
  platform: process.platform,
});
