import fs from 'node:fs';
import path from 'node:path';

/**
 * Back to the previous version when this one does not start (1.26.0-beta.4): the update's own check only sees the
 * start right after it — files may be lost later (an antivirus, a disk). What an update left in
 * `app.previous/` takes the place of `app/`, as «Повернути версію» does, with no server to do it: nothing
 * of app/ runs now. Only node: imports (main.ts, and Electron's stub when main.ts itself won't load).
 */

/** server/src/layout.ts */
const MARKER = '.vo-portable';

export interface Rescue {
  top: string;
  /** the version that does not start ('' when its package.json is gone) */
  from: string;
  /** the one to go back to */
  to: string;
}

/** server/src/installer.ts HELPER_MAX_MS */
const SWAP_MAX_MS = 10 * 60 * 1000;

const versionIn = (dir: string): string => {
  try {
    const v = (
      JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
        version?: unknown;
      }
    ).version;
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
};

/** What to go back to beside `appRoot` (…/app of a release), or null. */
export function rescueFor(appRoot: string): Rescue | null {
  if (path.basename(appRoot) !== 'app') return null;
  const top = path.dirname(appRoot);
  if (swapping(top)) return null;
  const previous = path.join(top, 'app.previous');
  // a swap cut short had set the one before aside (server/src/swap.ts)
  const older = path.join(top, 'app.previous.old');
  try {
    if (!fs.existsSync(previous) && fs.existsSync(older)) fs.renameSync(older, previous);
  } catch {
    /* held: none to go back to now */
  }
  const to = versionIn(previous);
  const whole =
    to !== '' &&
    fs.existsSync(path.join(previous, MARKER)) &&
    fs.existsSync(path.join(previous, 'server', 'src', 'launcher.ts'));
  return whole ? { top, from: versionIn(appRoot), to } : null;
}

const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** A rename tried again for a moment (Windows: an antivirus, a program just ended). */
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

/** The data folder of a release (its marker says where; VO_DATA_DIR wins). */
function dataOf(top: string): string {
  if (process.env.VO_DATA_DIR) return process.env.VO_DATA_DIR;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(top, 'app', MARKER), 'utf8')) as {
      data?: unknown;
    };
    if (typeof m.data === 'string') return path.resolve(top, 'app', m.data);
  } catch {
    /* the usual place */
  }
  return path.join(top, 'data');
}

/** A swap helper may still be at it (it puts the version before back by itself): minutes at most. */
function swapping(top: string): boolean {
  const updates = path.join(dataOf(top), 'updates');
  try {
    const plan = fs.statSync(path.join(updates, 'plan.json'));
    return (
      !fs.existsSync(path.join(updates, 'result.json')) && Date.now() - plan.mtimeMs < SWAP_MAX_MS
    );
  } catch {
    return false;
  }
}

/**
 * Put the previous version in place; the one left becomes `app.previous/`. Throws — with everything as it
 * was — when a folder can't be renamed.
 */
export function bringPrevious(r: Rescue, tries = 20): void {
  const app = path.join(r.top, 'app');
  const previous = path.join(r.top, 'app.previous');
  const aside = path.join(r.top, 'app.failed');
  // gone altogether (a swap cut short by the power): the previous one simply takes its place
  const there = fs.existsSync(app);
  if (there) {
    fs.rmSync(aside, { recursive: true, force: true, maxRetries: 3 });
    move(app, aside, tries);
  }
  try {
    move(previous, app, tries);
  } catch (e) {
    try {
      if (there) move(aside, app, tries);
    } catch {
      /* app.failed holds it: the next start offers the previous one again */
    }
    throw e;
  }
  if (there)
    try {
      move(aside, previous, tries);
    } catch {
      /* it stays as app.failed */
    }
  // the app says «Повернуто версію …» and keeps quiet about the one left (server/src/swap.ts SwapResult)
  try {
    const updates = path.join(dataOf(r.top), 'updates');
    fs.mkdirSync(updates, { recursive: true });
    fs.writeFileSync(
      path.join(updates, 'result.json'),
      JSON.stringify({
        ok: true,
        from: r.from,
        to: r.to,
        at: Date.now(),
        kind: 'rollback',
        ...(r.from ? { pin: { version: r.to, skip: r.from } } : {}),
      }),
    );
  } catch {
    /* it only doesn't say so */
  }
}
