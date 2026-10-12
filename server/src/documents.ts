import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import {
  documentPath,
  documentsDir,
  pendingDocuments,
  refreshLibraryDocuments,
  type DocumentFile,
  type DocumentsRefresh,
  type PreRead,
} from '@vo/shared/documents-node';
import { readPdfs, type PdfResult } from './pdfReader.js';

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

  /**
   * PDFs that gave nothing (scanned, broken, too slow), by their size and time: not read again on
   * every change in the folder — only when the file itself changes (1.17.0-beta.3).
   */
  const unreadable = new Map<string, string>();
  const stamp = (f: DocumentFile) => `${f.size}:${f.mtime}`;

  async function refreshNow(): Promise<DocumentsRefresh | null> {
    if (!fs.existsSync(d.libraryPath) || d.rebuilding()) return null;
    const started = Date.now();
    const at = dir();
    // PDFs first, apart in a child process (pdfReader.ts); the rest is read in the write below
    const pdfs = pendingDocuments(d.libraryPath, at, 'pdf').filter(
      (f) => unreadable.get(f.file) !== stamp(f),
    );
    const read = pdfs.length
      ? await readPdfs(
          pdfs.map((f) => ({ file: f.file, path: documentPath(at, f.file) ?? '' })),
          d.log,
        )
      : new Map<string, PdfResult>();
    // each reading with the file's size and time it was read at: a file saved again meanwhile
    // is left for the next refresh; a child that failed is tried again then too
    const pre = new Map<string, PreRead>();
    for (const f of pdfs) {
      const r = read.get(f.file);
      if (!r) continue;
      if (r.final && !r.doc) unreadable.set(f.file, stamp(f));
      else unreadable.delete(f.file);
      if (r.final || r.doc) pre.set(f.file, { doc: r.doc, size: f.size, mtime: f.mtime });
    }
    // a rebuild that began while the PDFs were read rewrites the library itself
    if (d.rebuilding()) return null;
    const r = refreshLibraryDocuments(d.libraryPath, at, d.log, pre);
    if (r.changed) {
      d.closeDb();
      d.notify();
      d.log(
        `documents: ${r.read} read, ${r.removed} removed, ${r.documents} in the library (${Date.now() - started} ms)`,
      );
    }
    return r;
  }

  /** Bring the library in line with the folder (one refresh at a time); null with no library or during a rebuild. */
  let queue: Promise<unknown> = Promise.resolve();
  function refresh(): Promise<DocumentsRefresh | null> {
    const run = queue.then(refreshNow, refreshNow);
    queue = run.catch(() => null);
    return run;
  }

  const later = () => {
    if (timer) clearTimeout(timer);
    // a copy in progress fires many events: read once it has been quiet for a moment
    timer = setTimeout(() => {
      timer = null;
      refresh().catch((err: Error) => d.log(`documents: ${err.message}`));
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
