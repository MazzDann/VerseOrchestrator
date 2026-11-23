import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { LibraryError, N_, type Vars } from '@vo/shared';
import { childExecArgv } from './pdfReader.js';

/** Messages to and from textModuleWorker.ts. */
export interface TextCheckAsk {
  file: string;
}
export type TextCheckReply = { skipped: string[] } | { key: string; vars?: Vars; error?: string };

/** What a text module read whole says: the books the library has no number for. */
export interface TextModule {
  skipped: string[];
}

/** A whole Bible takes about a second; longer than this is no Bible. */
const TIMEOUT_MS = 60_000;

/**
 * A dropped file read as a module in a text format, in a child process; a LibraryError says why it
 * can't be (no verses, a broken archive).
 */
export async function checkTextModule(
  file: string,
  execArgv: readonly string[] = process.execArgv,
): Promise<TextModule> {
  // from the home folder: a process sitting in app/ blocks an update's swap on Windows (EBUSY)
  const child = spawn(
    process.execPath,
    [...childExecArgv(execArgv), fileURLToPath(new URL('./textModuleWorker.ts', import.meta.url))],
    { cwd: os.homedir(), stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true },
  );
  const r = await new Promise<TextCheckReply>((done) => {
    const timer = setTimeout(() => {
      child.kill();
      done({ key: '', error: 'no answer' });
    }, TIMEOUT_MS);
    const finish = (m: TextCheckReply) => {
      clearTimeout(timer);
      done(m);
    };
    child.on('message', (m) => finish(m as TextCheckReply));
    child.once('exit', () => finish({ key: '', error: 'the reader stopped' }));
    child.on('error', (e) => finish({ key: '', error: e.message }));
    child.send({ file } satisfies TextCheckAsk, (err) => {
      if (err) finish({ key: '', error: err.message });
    });
  });
  if ('skipped' in r) return { skipped: r.skipped };
  if (r.key) throw new LibraryError(400, r.key, r.vars);
  throw new LibraryError(500, N_('Не вдалося прочитати модуль: {error}'), { error: r.error ?? '' });
}
