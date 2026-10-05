/**
 * The update swap (1.0.0): runs on its own, from `<data>/updates/`, with a copy of Node there —
 * nothing inside `app/` may be in use while it is renamed (Windows refuses to rename a folder a
 * running program sits in).
 *
 *  1. wait until the old app and its waiter have exited (the pids in the plan);
 *  2. `app` → `app.previous`, `app.next` → `app` (the paths the desktop shortcut and autostart
 *     point at stay the same);
 *  3. start the new version's waiter on the same port and ask it for its version; once it
 *     answers, the release's top files (the start file, «ЯК ЗАПУСТИТИ.txt») are replaced too;
 *  4. if it doesn't answer as the new version within 90 s: stop it, put the old `app` back,
 *     start that one, and say why (`result.json`, which the app shows in «Оновлення»).
 *
 * «Повернути попередню версію» (1.4.0) goes the same way: the server turns `app.previous`
 * into `app.next` first, and the plan says `kind: 'rollback'`. To a version before 1.4.0,
 * which has no such button (`keepAsNext`, 1.4.1) — back, or picked in the dropdown (1.6.2) — the
 * version left becomes that one's `app.next` once it answers: its «Оновлення» then offers it
 * again with no download, as long as it is GitHub's latest.
 *
 * The new version runs in the background, as with «Запуск за адресою» (the console window of
 * the start file has closed with the old version).
 *
 * Self-contained on purpose — it is copied out of `app/` to run: only node: imports, no TS-only
 * syntax (plain Node strips the types).
 *
 *   node swap.mts plan.json    (the server copies it to <data>/updates/swap.mts)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** A dictionary key, translated where it is shown (the app reads result.json). */
const N_ = (uk: string): string => uk;

export interface SwapPlan {
  top: string;
  /** the old app and its waiter */
  pids: number[];
  port: number;
  from: string;
  to: string;
  /** the release's files next to `app/` (installer.ts put them here) */
  topFiles?: string;
  /** where to write how it went */
  result: string;
  log: string;
  /**
   * a new version, or back to the one before (1.4.0) — the app words its result by it; an older
   * version picked in the dropdown comes as 'rollback' too (1.6.2)
   */
  kind?: 'update' | 'rollback';
  /**
   * to a version that can't go back itself (before 1.4.0): the version left stays as
   * `app.next`, ready for that one's «Перезапустити й оновити» (1.4.1)
   */
  keepAsNext?: boolean;
  /**
   * the pin this swap decides (1.6.3, updates.ts pinForSwap; null: none) — it takes effect in
   * the version swapped in, once the swap went well (the result carries it there)
   */
  pin?: { version: string; skip: string } | null;
}

export interface SwapResult {
  ok: boolean;
  from: string;
  to: string;
  at: number;
  /** a dictionary key when not ok */
  error?: string;
  kind?: 'update' | 'rollback';
  /** the plan's pin (1.6.3) */
  pin?: { version: string; skip: string } | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** Rename, retrying a few seconds: a scanner or an indexer may hold a file for a moment. */
async function renameRetry(from: string, to: string): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (e) {
      // nothing there: no point waiting
      if (i >= 40 || (e as NodeJS.ErrnoException).code === 'ENOENT') throw e;
      await sleep(250);
    }
  }
}

/** `app` → `app.previous`, `app.next` → `app`; on a failure halfway the old `app` goes back. */
export async function swapFolders(top: string): Promise<void> {
  const app = path.join(top, 'app');
  const next = path.join(top, 'app.next');
  const previous = path.join(top, 'app.previous');
  fs.rmSync(previous, { recursive: true, force: true });
  await renameRetry(app, previous);
  try {
    await renameRetry(next, app);
  } catch (e) {
    await renameRetry(previous, app);
    throw e;
  }
}

/** After a rollback: the version left (`app.previous`) waits as `app.next`, like a downloaded update. */
export async function previousAsNext(top: string): Promise<void> {
  await renameRetry(path.join(top, 'app.previous'), path.join(top, 'app.next'));
}

/** The new `app` failed: keep it as `app.failed`, put the previous one back. */
export async function rollbackFolders(top: string): Promise<void> {
  const failed = path.join(top, 'app.failed');
  fs.rmSync(failed, { recursive: true, force: true });
  await renameRetry(path.join(top, 'app'), failed);
  await renameRetry(path.join(top, 'app.previous'), path.join(top, 'app'));
}

/** The release's top files replace the old ones (folders — data/, modules/ — are left alone). */
export function copyTopFiles(from: string, top: string): void {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const src = path.join(from, e.name);
    fs.copyFileSync(src, path.join(top, e.name));
    // the start file stays runnable
    if (process.platform !== 'win32') fs.chmodSync(path.join(top, e.name), fs.statSync(src).mode);
  }
}

/** The environment the old app had, without what its waiter gave it as the waiter's child. */
function waiterEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of ['PORT', 'HOST', 'VO_STANDBY', 'VO_STANDBY_PORT']) delete env[k];
  return env;
}

/** Start `top/app`'s waiter on `port`, in the background like autostart does. */
function startWaiter(top: string, port: number) {
  const app = path.join(top, 'app');
  const node =
    process.platform === 'win32'
      ? path.join(app, 'node', 'node.exe')
      : path.join(app, 'node', 'bin', 'node');
  const child = spawn(
    node,
    ['--disable-warning=ExperimentalWarning', path.join(app, 'server', 'src', 'standby.ts')],
    {
      cwd: app,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...waiterEnv(), VO_STANDBY_LISTEN: String(port) },
    },
  );
  child.unref();
  return child;
}

/** Does the app on `port` answer as version `version` within `ms`? (the first request starts it) */
export async function answersAs(port: number, version: string, ms: number): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(1000)) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok && ((await res.json()) as { version?: string }).version === version) return true;
    } catch {
      /* still starting */
    }
  }
  return false;
}

/** Ask the waiter on `port` to stop its app and close (as «Вимкнути повністю» does), then make sure. */
async function stopWaiter(port: number, pid: number | undefined): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${port}/__standby/shutdown`, {
      method: 'POST',
      headers: { 'x-vo-control': '1' },
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* not listening */
  }
  for (const end = Date.now() + 15_000; pid && alive(pid) && Date.now() < end; ) await sleep(250);
  try {
    if (pid && alive(pid)) process.kill(pid);
  } catch {
    /* gone meanwhile */
  }
}

export async function runSwap(plan: SwapPlan, waitMs = 90_000): Promise<SwapResult> {
  const log = (m: string) => {
    try {
      fs.appendFileSync(plan.log, `${new Date().toISOString()} ${m}\n`);
    } catch {
      /* the log must not stop the swap */
    }
  };
  const done = (r: Omit<SwapResult, 'from' | 'to' | 'at'>): SwapResult => {
    const result = {
      ...r,
      from: plan.from,
      to: plan.to,
      at: Date.now(),
      ...(plan.kind ? { kind: plan.kind } : {}),
      ...(plan.pin !== undefined ? { pin: plan.pin } : {}),
    };
    fs.writeFileSync(plan.result, JSON.stringify(result));
    log(`done: ${JSON.stringify(result)}`);
    return result;
  };
  log(`swap ${plan.from} -> ${plan.to} in ${plan.top}`);

  // 1. the old app and its waiter leave (they were told to); after 30 s they are made to
  for (const end = Date.now() + 30_000; plan.pids.some(alive) && Date.now() < end; )
    await sleep(250);
  for (const pid of plan.pids.filter(alive)) {
    log(`still running: ${pid} — stopping it`);
    try {
      process.kill(pid);
    } catch {
      /* gone meanwhile */
    }
  }
  await sleep(1000);

  // 2. the folders
  try {
    await swapFolders(plan.top);
  } catch (e) {
    log(`swap failed: ${(e as Error).message}`);
    // a program still in app/ (Windows won't rename a folder in use): say what to close (1.8.8)
    const held = ['EBUSY', 'EPERM', 'EACCES'].includes((e as NodeJS.ErrnoException).code ?? '');
    if (held)
      log(
        'app/ is in use by another program: a browser the app started before 1.8.8, an Explorer window or a terminal inside app/ — close it and try again',
      );
    startWaiter(plan.top, plan.port);
    return done({
      ok: false,
      error: held
        ? N_(
            'Не вдалося замінити папку app/: її тримає інша програма — браузер, який відкрив застосунок, вікно Провідника чи термінал у цій папці. Закрийте її й спробуйте ще раз. Працює попередня версія',
          )
        : N_('Не вдалося замінити папку app/ — працює попередня версія'),
    });
  }

  // 3. the new version
  const waiter = startWaiter(plan.top, plan.port);
  if (await answersAs(plan.port, plan.to, waitMs)) {
    if (plan.topFiles) {
      try {
        copyTopFiles(plan.topFiles, plan.top);
      } catch (e) {
        log(`top files not replaced: ${(e as Error).message}`);
      }
    }
    if (plan.keepAsNext) {
      try {
        await previousAsNext(plan.top);
        log(`${plan.from} waits in app.next`);
      } catch (e) {
        log(`${plan.from} stays in app.previous: ${(e as Error).message}`);
      }
    }
    return done({ ok: true });
  }

  // 4. back to the old one
  log('the new version did not answer — rolling back');
  await stopWaiter(plan.port, waiter.pid);
  await sleep(1000);
  try {
    await rollbackFolders(plan.top);
  } catch (e) {
    log(`rollback failed: ${(e as Error).message}`);
  }
  startWaiter(plan.top, plan.port);
  return done({
    ok: false,
    error:
      plan.kind === 'rollback'
        ? N_('Попередня версія не запустилася — працює та, що була')
        : N_('Нова версія не запустилася — повернуто попередню'),
  });
}

const invokedDirectly = !!process.argv[1] && path.basename(process.argv[1]).startsWith('swap');
if (invokedDirectly && process.argv[2]) {
  const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as SwapPlan;
  void runSwap(plan).then(() => process.exit(0));
}
