/**
 * A new desktop shell put in place (1.26.0-beta.3). An update brings app/ while the shell may be showing it, so
 * a new Electron waits beside as `shell.next/` (installer.ts, swap.ts) and takes the place of `shell/` when
 * nothing runs from it: after the desktop app's quit, or before its next start — VerseOrchestrator.exe
 * (Windows) and start.sh (Linux) run this first when there is something to do.
 *
 * The one before stays as `shell.previous/` until the new one has opened a window (desktop/src/main.ts tells:
 * `shellOpened`). One that was started twice and never opened goes back: `shell.failed/` keeps its name
 * only, so the same one is not downloaded again.
 *
 *   node shellSwap.ts <top> [pid]     pid: wait for this program to end first
 *
 * Only node: imports and no TS-only syntax (plain Node runs it); it never throws out.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SHELL = 'shell';
export const SHELL_NEXT = 'shell.next';
export const SHELL_PREVIOUS = 'shell.previous';
export const SHELL_FAILED = 'shell.failed';
/** In a shell's folder: which one it is ({hash}); in shell.next it is written last — whole. */
export const SHELL_ID = '.vo-shell.json';
/** In shell/ while it has not opened yet: {starts, at}. */
export const SHELL_TRIAL = '.vo-trial.json';

/** A second start this soon is the first one still opening. */
const OPENING_MS = 60_000;
/** Another one of these at work: its lock is not older than this. */
const LOCK_MS = 60_000;

/** `busy`: in use, or a rename refused; `locked`: another one of these is at it. */
export type Placed = 'placed' | 'back' | 'trial' | 'nothing' | 'busy' | 'locked';

const read = (file: string): Record<string, unknown> | null => {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return j && typeof j === 'object' && !Array.isArray(j) ? j : null;
  } catch {
    return null;
  }
};
const write = (file: string, value: unknown) => fs.writeFileSync(file, JSON.stringify(value));
const drop = (dir: string) => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** A rename tried again for a moment: an antivirus may hold a file. Nothing there: thrown at once. */
function move(from: string, to: string, tries: number): void {
  for (let i = 1; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      if (i >= tries || (e as NodeJS.ErrnoException).code === 'ENOENT') throw e;
      pause(250);
    }
  }
}

/** The hash a shell folder says it is, or null. */
export const shellId = (dir: string): string | null => {
  const hash = read(path.join(dir, SHELL_ID))?.hash;
  return typeof hash === 'string' && hash ? hash : null;
};

/** The shell that waits to be put in place (whole), or null. */
export const waitingShell = (top: string): string | null => shellId(path.join(top, SHELL_NEXT));

/** Is there anything for `placeShell` to do? */
export const shellWork = (top: string): boolean =>
  waitingShell(top) !== null ||
  fs.existsSync(path.join(top, SHELL, SHELL_TRIAL)) ||
  (!fs.existsSync(path.join(top, SHELL)) && fs.existsSync(path.join(top, SHELL_PREVIOUS)));

/** Does a program of shell/ run? Linux would rename it from under it (Windows refuses by itself). */
function runsFrom(dir: string): boolean {
  if (process.platform !== 'linux') return false;
  const inside = path.resolve(dir) + path.sep;
  try {
    return fs
      .readdirSync('/proc')
      .filter((p) => /^\d+$/.test(p))
      .some((p) => {
        try {
          return fs.readlinkSync(`/proc/${p}/exe`).startsWith(inside);
        } catch {
          return false; // another user's, or gone
        }
      });
  } catch {
    return false;
  }
}

/**
 * Put the waiting shell in place, or the one before back. `starting`: the desktop app is about to be started
 * (counted), not just closed.
 */
export function placeShell(
  top: string,
  o: { starting?: boolean; now?: number; tries?: number; log?: (m: string) => void } = {},
): Placed {
  const now = o.now ?? Date.now();
  const tries = o.tries ?? 8;
  const log = o.log ?? (() => {});
  const at = (d: string) => path.join(top, d);
  const lock = at('shell.lock');
  const first = { starts: o.starting ? 1 : 0, at: now };
  try {
    fs.mkdirSync(lock);
  } catch {
    try {
      if (now - fs.statSync(lock).mtimeMs < LOCK_MS) return 'locked';
      // a cut-short one's: taken by one alone (a rename), then made anew
      fs.renameSync(lock, `${lock}.${process.pid}`);
      fs.rmdirSync(`${lock}.${process.pid}`);
      fs.mkdirSync(lock);
    } catch {
      return 'locked';
    }
  }
  try {
    // cut short between the two renames: the new one whole takes the place, else the one before
    if (!fs.existsSync(at(SHELL))) {
      const from = waitingShell(top) ? SHELL_NEXT : SHELL_PREVIOUS;
      if (!fs.existsSync(at(from))) return 'nothing';
      if (from === SHELL_NEXT) write(path.join(at(SHELL_NEXT), SHELL_TRIAL), first);
      move(at(from), at(SHELL), tries);
      return from === SHELL_NEXT ? 'placed' : 'back';
    }
    if (runsFrom(at(SHELL))) return 'busy';
    const trialFile = path.join(at(SHELL), SHELL_TRIAL);
    const trial = fs.existsSync(trialFile) ? (read(trialFile) ?? {}) : null;
    if (trial) {
      if (!o.starting) return 'nothing';
      const starts = Number(trial.starts) || 0;
      // (a clock set back is no time passed, nor a wait for ever)
      if (starts > 0 && Math.abs(now - (Number(trial.at) || 0)) < OPENING_MS) return 'trial';
      if (starts < 2 || !fs.existsSync(at(SHELL_PREVIOUS))) {
        write(trialFile, { starts: starts + 1, at: now });
        return 'trial';
      }
      const hash = shellId(at(SHELL));
      drop(at(SHELL_FAILED));
      move(at(SHELL), at(SHELL_FAILED), tries);
      try {
        move(at(SHELL_PREVIOUS), at(SHELL), tries);
      } catch (e) {
        move(at(SHELL_FAILED), at(SHELL), tries);
        throw e;
      }
      log(`the new shell did not open twice: the one before is back (${hash})`);
      // its name only: the same one is not taken again
      try {
        drop(at(SHELL_FAILED));
        fs.mkdirSync(at(SHELL_FAILED));
        if (hash) write(path.join(at(SHELL_FAILED), SHELL_ID), { hash });
      } catch {
        /* held for a moment: it stays whole, its name in it */
      }
      return 'back';
    }
    if (!waitingShell(top)) return 'nothing';
    // on trial before it stands there: a power cut in between must not leave it trusted
    write(path.join(at(SHELL_NEXT), SHELL_TRIAL), first);
    drop(at(SHELL_PREVIOUS));
    move(at(SHELL), at(SHELL_PREVIOUS), tries); // in use (Windows): thrown, nothing changed
    try {
      move(at(SHELL_NEXT), at(SHELL), tries);
    } catch (e) {
      move(at(SHELL_PREVIOUS), at(SHELL), tries);
      throw e;
    }
    log(`a new shell in place (${shellId(at(SHELL))})`);
    return 'placed';
  } catch (e) {
    log(`the shell stays as it is: ${(e as Error).message}`);
    return 'busy';
  } finally {
    try {
      fs.rmdirSync(lock);
    } catch {
      /* gone */
    }
  }
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

const invokedDirectly =
  !!process.argv[1] && path.basename(process.argv[1]).startsWith('shellSwap.');
if (invokedDirectly && process.argv[2]) {
  const top = path.resolve(process.argv[2]);
  const pid = Number(process.argv[3]) || 0;
  for (const end = Date.now() + 30_000; pid && alive(pid) && Date.now() < end; ) pause(250);
  // Chromium's own processes leave a moment after the program
  if (pid) pause(500);
  const o = {
    starting: !pid,
    tries: pid ? 20 : 4,
    log: (m: string) => {
      try {
        const dir = path.join(top, 'data');
        if (fs.existsSync(dir))
          fs.appendFileSync(path.join(dir, 'shell.log'), `${new Date().toISOString()} ${m}\n`);
      } catch {
        /* the log must not stop it */
      }
    },
  };
  // another one at it is waited for (a start that finds no shell/ for that moment would open a browser);
  // after a quit, the programs of it that are still going
  for (const end = Date.now() + 10_000; ; pause(250)) {
    const r = placeShell(top, o);
    const again = r === 'locked' || (r === 'busy' && !!pid && process.platform === 'linux');
    if (!again || Date.now() > end) break;
  }
}
