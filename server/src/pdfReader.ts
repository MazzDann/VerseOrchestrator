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
 * A PDF's reading: its document (null: no text — a scanned PDF —, broken, or too slow), and whether
 * that is the file's own answer (`final`) or the child failed (spawn refused, crashed): then the
 * next refresh tries again.
 */
export interface PdfResult {
  doc: ParsedDocument | null;
  final: boolean;
}

/**
 * Read PDF documents one by one in a child process (1.17.0-beta.3, pdfWorker.ts): pdf.js is
 * CPU-heavy and a broken file may hang it — the server's sockets and reads go on meanwhile.
 */
export async function readPdfs(
  files: { file: string; path: string }[],
  log: (msg: string) => void = () => {},
): Promise<Map<string, PdfResult>> {
  const out = new Map<string, PdfResult>();
  let child: ChildProcess | null = null;
  let next = 0;
  try {
    for (const f of files) {
      child ??= startChild();
      const c = child;
      const id = ++next;
      const started = Date.now();
      const r = await new Promise<{ units: DocUnit[] | null; final: boolean }>((done) => {
        const finish = (units: DocUnit[] | null, final: boolean) => {
          clearTimeout(timer);
          c.off('message', onMessage);
          c.off('exit', onExit);
          c.off('error', onError);
          done({ units, final });
        };
        const onMessage = (m: PdfReply) => {
          if (m.id !== id) return;
          if (m.error) log(`documents: ${f.file} — ${m.error}`);
          finish(m.units ?? null, true);
        };
        const onExit = () => finish(null, false);
        // a spawn refused (an antivirus, no memory): no 'exit' may follow, and an unheard 'error'
        // would bring the server down
        const onError = (e: Error) => {
          log(`documents: ${f.file} — the PDF reader failed: ${e.message}`);
          finish(null, false);
        };
        const timer = setTimeout(() => {
          log(`documents: ${f.file} — no answer in ${FILE_TIMEOUT_MS / 1000} s, given up`);
          c.kill();
          finish(null, true);
        }, FILE_TIMEOUT_MS);
        c.on('message', onMessage);
        c.once('exit', onExit);
        c.on('error', onError);
        try {
          c.send({ id, file: f.path } satisfies PdfAsk, (err) => {
            if (err) finish(null, false);
          });
        } catch {
          finish(null, false);
        }
      });
      // a child that died or was stopped: a new one for the next file
      if (c.exitCode !== null || c.signalCode !== null || c.killed || !c.connected) {
        c.on('error', () => {}); // a late error of a child left behind is no news
        child = null;
      }
      out.set(f.file, {
        doc: r.units && r.units.length > 0 ? { units: r.units } : null,
        final: r.final,
      });
      log(`documents: ${f.file} — PDF read in ${Date.now() - started} ms`);
    }
  } finally {
    if (child?.connected) child.disconnect();
  }
  return out;
}
