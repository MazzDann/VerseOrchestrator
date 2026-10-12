import { spawn, type ChildProcess } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { DocUnit, ParsedDocument } from '@vo/shared';

/** Messages to and from pdfWorker.ts. */
export interface PdfAsk {
  id: number;
  file: string;
}
export interface PdfReply {
  id: number;
  units?: DocUnit[];
  error?: string;
}

/** A PDF that takes longer is given up (and its child stopped): the next one gets a new child. */
const FILE_TIMEOUT_MS = 60_000;

function startChild(): ChildProcess {
  const args = [...process.execArgv, fileURLToPath(new URL('./pdfWorker.ts', import.meta.url))];
  // from the home folder: a process sitting in app/ blocks an update's swap on Windows (EBUSY)
  return spawn(process.execPath, args, {
    cwd: os.homedir(),
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    windowsHide: true,
  });
}

/**
 * Read PDF documents one by one in a child process (1.17.0-beta.3, pdfWorker.ts): pdf.js is
 * CPU-heavy and a broken file may hang it — the server's sockets and reads go on meanwhile. Each
 * file's result: its units, or null (no text — a scanned PDF —, broken, or too slow).
 */
export async function readPdfs(
  files: { file: string; path: string }[],
  log: (msg: string) => void = () => {},
): Promise<Map<string, ParsedDocument | null>> {
  const out = new Map<string, ParsedDocument | null>();
  let child: ChildProcess | null = null;
  let next = 0;
  try {
    for (const f of files) {
      child ??= startChild();
      const c = child;
      const id = ++next;
      const started = Date.now();
      const units = await new Promise<DocUnit[] | null>((done) => {
        const finish = (v: DocUnit[] | null) => {
          clearTimeout(timer);
          c.off('message', onMessage);
          c.off('exit', onExit);
          done(v);
        };
        const onMessage = (m: PdfReply) => {
          if (m.id !== id) return;
          if (m.error) log(`documents: ${f.file} — ${m.error}`);
          finish(m.units ?? null);
        };
        const onExit = () => finish(null);
        const timer = setTimeout(() => {
          log(`documents: ${f.file} — no answer in ${FILE_TIMEOUT_MS / 1000} s, given up`);
          c.kill();
          finish(null);
        }, FILE_TIMEOUT_MS);
        c.on('message', onMessage);
        c.once('exit', onExit);
        c.send({ id, file: f.path } satisfies PdfAsk, (err) => {
          if (err) finish(null);
        });
      });
      // a child that died or was stopped: a new one for the next file
      if (c.exitCode !== null || c.signalCode !== null || c.killed) child = null;
      out.set(f.file, units && units.length > 0 ? { units } : null);
      log(`documents: ${f.file} — PDF read in ${Date.now() - started} ms`);
    }
  } finally {
    if (child?.connected) child.disconnect();
  }
  return out;
}
