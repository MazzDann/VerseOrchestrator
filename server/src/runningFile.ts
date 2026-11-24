/**
 * Which address the app of this data folder runs at (1.26.0-beta.1): `<data>/running.json`, written by the
 * waiter that holds the address. Started again on another port, the same folder's app was run twice — two
 * servers on the same data, and the second one's app/ held against an update (2026-11-23: EBUSY). The
 * start file and the desktop app look here first and open the one that runs.
 *
 * Only node: imports, no TS-only syntax (plain Node runs it: standby.ts, launcher.ts).
 */
import fs from 'node:fs';
import path from 'node:path';

export interface Running {
  port: number;
  pid: number;
  /** the copy's code folder */
  root: string;
}

const fileOf = (dataDir: string) => path.join(dataDir, 'running.json');

export function readRunning(dataDir: string): Running | null {
  try {
    const r = JSON.parse(fs.readFileSync(fileOf(dataDir), 'utf8')) as Partial<Running> | null;
    return Number.isInteger(r?.port) && Number.isInteger(r?.pid) && typeof r?.root === 'string'
      ? { port: r.port!, pid: r.pid!, root: r.root }
      : null;
  } catch {
    return null;
  }
}

export function writeRunning(dataDir: string, r: Running): void {
  try {
    fs.writeFileSync(fileOf(dataDir), JSON.stringify(r));
  } catch {
    /* a full or locked disk: no second start is found out, the rest works */
  }
}

/** This waiter's own note goes with it; one another waiter wrote since stays. */
export function clearRunning(dataDir: string, pid: number, port: number): void {
  const r = readRunning(dataDir);
  if (!r || r.pid !== pid || r.port !== port) return;
  try {
    fs.rmSync(fileOf(dataDir), { force: true });
  } catch {
    /* stale: nothing answers there, and it is taken for nothing */
  }
}

const same = (a: string, b: string, platform: string = process.platform) => {
  const norm = (s: string) =>
    platform === 'linux' ? path.resolve(s) : path.resolve(s).toLowerCase();
  return norm(a) === norm(b);
};

/**
 * The port this data folder's app already answers at — another than `port` — or null. Asked, not believed: a
 * note left by a crash names a port where nothing, or another copy's waiter, answers.
 */
export async function runningElsewhere(
  dataDir: string,
  root: string,
  port: number,
): Promise<number | null> {
  const r = readRunning(dataDir);
  if (!r || r.port === port || !same(r.root, root)) return null;
  try {
    const res = await fetch(`http://127.0.0.1:${r.port}/__standby`, {
      signal: AbortSignal.timeout(800),
    });
    const s = (res.ok ? await res.json() : null) as { root?: unknown } | null;
    return typeof s?.root === 'string' && same(s.root, root) ? r.port : null;
  } catch {
    return null;
  }
}
