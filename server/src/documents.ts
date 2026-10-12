import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import {
  documentsDir,
  refreshLibraryDocuments,
  type DocumentsRefresh,
} from '@vo/shared/documents-node';

/**
 * Documents (1.17.0-beta.1): the folder modules/documents is watched — a file put there by hand
 * (or dropped into the app, which writes it there) reaches the library on its own, a second or
 * two later; «Пересканувати» does the same at once. Every change tells the control windows.
 */
export function createDocuments(d: {
  modulesDir: () => string;
  libraryPath: string;
  /** the server's read connection: closed after a write, so the next read sees it */
  closeDb: () => void;
  rebuilding: () => boolean;
  notify: () => void;
  log: (msg: string) => void;
}) {
  const dir = () => documentsDir(d.modulesDir());
  let timer: NodeJS.Timeout | null = null;
  let watcher: fs.FSWatcher | null = null;
  let watched = '';

  /** Bring the library in line with the folder; null with no library or during a rebuild. */
  function refresh(): DocumentsRefresh | null {
    if (!fs.existsSync(d.libraryPath) || d.rebuilding()) return null;
    const started = Date.now();
    const r = refreshLibraryDocuments(d.libraryPath, dir(), d.log);
    if (r.changed) {
      d.closeDb();
      d.notify();
      d.log(
        `documents: ${r.read} read, ${r.removed} removed, ${r.documents} in the library (${Date.now() - started} ms)`,
      );
    }
    return r;
  }

  const later = () => {
    if (timer) clearTimeout(timer);
    // a copy in progress fires many events: read once it has been quiet for a moment
    timer = setTimeout(() => {
      timer = null;
      try {
        refresh();
      } catch (err) {
        d.log(`documents: ${(err as Error).message}`);
      }
    }, 1500);
    timer.unref();
  };

  /** Watch the folder (made if missing, so there is a place to put files into). */
  function watch(): void {
    const at = dir();
    if (watcher && watched === at) return;
    watcher?.close();
    watcher = null;
    try {
      fs.mkdirSync(at, { recursive: true });
      watcher = fs.watch(at, { recursive: true }, (_e, name) => {
        // the trash and the .part of a write in progress are no news
        if (name && /(^|[\\/])\./.test(String(name))) return;
        later();
      });
      watcher.on('error', () => {
        watcher?.close();
        watcher = null;
      });
      watched = at;
    } catch (err) {
      d.log(`documents: can't watch ${at} — ${(err as Error).message}`);
    }
  }

  function stop(): void {
    watcher?.close();
    watcher = null;
    if (timer) clearTimeout(timer);
  }

  return { dir, refresh, watch, stop };
}

/** Show a folder in the system's file manager (from the home folder: never a cwd inside app/). */
export function openFolder(dir: string): boolean {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['explorer.exe', [dir]]
      : process.platform === 'darwin'
        ? ['open', [dir]]
        : ['xdg-open', [dir]];
  try {
    const child = spawn(cmd, args, { cwd: os.homedir(), detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
