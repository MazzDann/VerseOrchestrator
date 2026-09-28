/**
 * Standby waiter (1.4.1). A small process that holds the app's address (default :4747, on
 * every interface so phones reach it) and uses next to no memory until someone opens it:
 *   - the first visit starts the real app (the server of 1.4.0, which also serves the UI)
 *     on a free loopback port — a page load meanwhile gets «Запуск…» that refreshes
 *     itself, API calls and WebSocket upgrades simply wait for it;
 *   - then everything is forwarded: HTTP and WebSocket tunnels, with the visitor's address
 *     APPENDED to X-Forwarded-For (the server trusts the last hop — access.ts — so a phone
 *     can't pose as the operator's machine);
 *   - when nothing has used it for a while (no requests, no open sockets — an open control
 *     window or phone keeps a socket, so a live show never stops) the app is stopped and
 *     the address waits again;
 *   - turned off (Налаштування → Застосунок, 1.4.2): it exits once the app has stopped;
 *     port changed: it relaunches itself — the old one closes, a fresh one reads the port.
 *
 * Control (the app talks to it — only from this machine, with the X-VO-Control header,
 * which a web page elsewhere can't send without a CORS preflight):
 *   GET /__standby            status (state, app port, …)
 *   POST /__standby/retire    exit once the app has stopped;  /resume  cancels that
 *   POST /__standby/relaunch  stop the app, close, start a fresh waiter (new port)
 *
 * Only node: imports, no TS-only syntax — Node runs this file as it is
 * (`node server/src/standby.ts`, type stripping); tsx is loaded only for the app itself.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RunningApp {
  port: number;
  stop(): Promise<void>;
  onExit(cb: () => void): void;
}

export type StandbyState = 'waiting' | 'starting' | 'running' | 'stopping';

export interface StandbyOptions {
  port: number;
  host: string;
  /** stop the app after this long without requests or open sockets */
  idleMs: number;
  /** …or this long once switched off (retiring): quick, but never under an open page */
  retireIdleMs?: number;
  /** start the real app; `progress` feeds the «Запуск…» page */
  startApp: (progress: (msg: string) => void) => Promise<RunningApp>;
  log?: (msg: string) => void;
  now?: () => number;
  /** how often idleness is checked */
  checkMs?: number;
  /** called when a retired waiter has shut down (the CLI exits) */
  onRetired?: () => void;
  /** called after a relaunch request closed this waiter (the CLI starts a fresh one) */
  onRelaunch?: () => void;
}

export const CONTROL_HEADER = 'x-vo-control';

const ownAddress = (addr: string | undefined) => {
  const ip = (addr ?? '').replace(/^::ffff:/, '');
  return ip === '::1' || ip.startsWith('127.');
};

function startingPage(message: string): string {
  const safe = message.replace(/[<>&]/g, '');
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta http-equiv="refresh" content="1"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Запуск…</title></head><body style="margin:0;height:100vh;display:grid;place-items:center;background:#1e2025;color:#e4e2dd;font:16px Inter,system-ui,sans-serif"><div style="text-align:center"><div style="font-weight:600">VerseOrchestrator запускається…</div><div style="opacity:.6;margin-top:6px">${safe}</div></div></body></html>`;
}

export function createStandby(o: StandbyOptions) {
  const now = o.now ?? Date.now;
  const log = o.log ?? (() => undefined);
  let state: StandbyState = 'waiting';
  let app: RunningApp | null = null;
  let starting: Promise<RunningApp> | null = null;
  let progress = '';
  let lastError = '';
  let lastActivity = now();
  let inflight = 0;
  let retiring = false;
  let relaunching = false;
  const tunnels = new Set<net.Socket>();

  const touch = () => {
    lastActivity = now();
  };

  function ensureApp(): Promise<RunningApp> {
    if (app) return Promise.resolve(app);
    starting ??= (async () => {
      state = 'starting';
      lastError = '';
      log('starting the app');
      try {
        const a = await o.startApp((m) => {
          progress = m;
        });
        app = a;
        state = 'running';
        touch();
        log(`app running on :${a.port}`);
        a.onExit(() => {
          if (app !== a) return;
          app = null;
          state = 'waiting';
          log('app exited');
          if (retiring) void shutdown();
        });
        return a;
      } catch (err) {
        state = 'waiting';
        lastError = (err as Error).message;
        log(`start failed: ${lastError}`);
        throw err;
      } finally {
        starting = null;
        progress = '';
      }
    })();
    return starting;
  }

  const forwardedFor = (req: http.IncomingMessage) => {
    const prior = req.headers['x-forwarded-for'];
    const me = req.socket.remoteAddress ?? '';
    return prior ? `${Array.isArray(prior) ? prior.join(', ') : prior}, ${me}` : me;
  };

  function proxy(req: http.IncomingMessage, res: http.ServerResponse, a: RunningApp): void {
    inflight++;
    res.once('close', () => {
      inflight--;
      touch();
    });
    const up = http.request(
      {
        host: '127.0.0.1',
        port: a.port,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, 'x-forwarded-for': forwardedFor(req) },
      },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    up.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Застосунок не відповідає');
    });
    req.pipe(up);
  }

  function tunnel(req: http.IncomingMessage, socket: net.Socket, head: Buffer, a: RunningApp) {
    const up = net.connect(a.port, '127.0.0.1');
    tunnels.add(socket);
    const close = () => {
      if (!tunnels.delete(socket)) return;
      touch();
      up.destroy();
      socket.destroy();
    };
    up.on('connect', () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        if (req.rawHeaders[i].toLowerCase() !== 'x-forwarded-for')
          lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }
      lines.push(`X-Forwarded-For: ${forwardedFor(req)}`);
      up.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    for (const s of [up, socket]) {
      s.on('error', close);
      s.on('close', close);
    }
  }

  const status = () => ({
    state,
    appPort: app?.port ?? null,
    progress,
    lastError,
    openSockets: tunnels.size,
    idleForMs: now() - lastActivity,
    retiring,
    /** the waiter's own memory (the app is a separate process) */
    rssBytes: process.memoryUsage().rss,
  });

  function control(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    if (!req.url?.startsWith('/__standby') || !ownAddress(req.socket.remoteAddress)) return false;
    const reply = (code: number, body: object) => {
      res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/__standby') {
      reply(200, status());
      return true;
    }
    if (req.method !== 'POST' || req.headers[CONTROL_HEADER] !== '1') {
      reply(403, { error: 'control requests need POST + X-VO-Control' });
      return true;
    }
    const action = req.url.slice('/__standby/'.length);
    if (action === 'retire' || action === 'resume') {
      api.retire(action === 'retire');
      reply(200, status());
    } else if (action === 'relaunch') {
      reply(200, { relaunching: true });
      relaunching = true;
      void shutdown();
    } else reply(404, { error: 'unknown action' });
    return true;
  }

  const server = http.createServer((req, res) => {
    // status checks (the settings panel polls them) are not use of the app
    if (control(req, res)) return;
    touch();
    if (app) return proxy(req, res, app);
    const starting = ensureApp();
    if (req.method === 'GET' && /text\/html/.test(req.headers.accept ?? '')) {
      starting.catch(() => undefined);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(startingPage(lastError ? `Не вдалося: ${lastError}` : progress || 'Хвилинку'));
      return;
    }
    starting.then(
      (a) => proxy(req, res, a),
      (err: Error) => {
        res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '5' });
        res.end(`Застосунок не запустився: ${err.message}`);
      },
    );
  });

  server.on('upgrade', (req, socket: net.Socket, head: Buffer) => {
    touch();
    ensureApp().then(
      (a) => tunnel(req, socket, head, a),
      () => socket.destroy(),
    );
  });

  async function stopApp(why: string): Promise<void> {
    const a = app;
    if (!a) return;
    app = null;
    state = 'stopping';
    log(`stopping the app (${why})`);
    await a.stop();
    state = 'waiting';
  }

  const idle = setInterval(() => {
    if (state !== 'running' || inflight > 0 || tunnels.size > 0) return;
    const limit = retiring ? Math.min(o.idleMs, o.retireIdleMs ?? 30_000) : o.idleMs;
    if (now() - lastActivity < limit) return;
    void stopApp('idle').then(() => {
      if (retiring) void shutdown();
    });
  }, o.checkMs ?? 10_000);

  let closed = false;
  async function shutdown(): Promise<void> {
    if (closed) return;
    closed = true;
    clearInterval(idle);
    for (const s of tunnels) s.destroy();
    await stopApp('shutdown');
    await new Promise<void>((r) => {
      server.close(() => r());
      server.closeAllConnections?.(); // keep-alive sockets would hold close() open
    });
    log(relaunching ? 'waiter closed — relaunching' : 'waiter closed');
    if (relaunching) o.onRelaunch?.();
    else o.onRetired?.();
  }

  const api = {
    /** Start the app now instead of on the first visit (the launcher, 1.6.0). */
    start: () => ensureApp(),
    listen: () =>
      new Promise<number>((resolve, reject) => {
        server.once('error', reject);
        server.listen(o.port, o.host, () => resolve((server.address() as net.AddressInfo).port));
      }),
    status,
    /** Turned off: exit as soon as the app isn't running (at once if it's waiting). */
    retire(on = true): void {
      retiring = on;
      if (on && !app && !starting) void shutdown();
    },
    close: shutdown,
  };
  return api;
}

// ---------------------------------------------------------------------------------------
// The real app and the command line (`npm run standby`, or the autostart entry, 1.4.2).

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Run a command (npm …) to the end; `inherit`: its output goes straight to this console. */
export function run(
  cmd: string,
  args: string[],
  cwd: string,
  log: (m: string) => void,
  opts: { inherit?: boolean } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    // one command line: a shell is needed for npm(.cmd) on Windows, and Node deprecates
    // separate args with a shell (DEP0190) — ours are fixed words, nothing to escape
    const child = spawn([cmd, ...args].join(' '), {
      cwd,
      shell: true,
      windowsHide: true,
      stdio: opts.inherit ? 'inherit' : 'pipe',
    });
    child.stdout?.on('data', (d) => log(String(d).trim()));
    child.stderr?.on('data', (d) => log(String(d).trim()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')}: код ${code}`)),
    );
  });
}

export type WaiterStatus = { state: string; retiring?: boolean } & Record<string, unknown>;

/** The waiter answering on this port of this machine, if any (its status). */
export async function waiterAt(port: number): Promise<WaiterStatus | null> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/__standby`, {
      signal: AbortSignal.timeout(800),
    });
    return r.ok ? ((await r.json()) as WaiterStatus) : null;
  } catch {
    return null;
  }
}

/** Nothing listens on this port yet (on every interface — where the waiter listens). */
export function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, '0.0.0.0', () => probe.close(() => resolve(true)));
  });
}

/** The UI build to serve is missing, or was made for another version of the code. */
export function needsBuild(root: string): boolean {
  const dist = path.join(root, 'web', 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) return true;
  try {
    const built = fs.readFileSync(path.join(dist, '.vo-version'), 'utf8').trim();
    const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
    return built !== version;
  } catch {
    return false; // built by hand (no stamp): serve it as it is
  }
}

/** Build the UI (web/dist) and stamp it with the code's version (read by needsBuild). */
export async function buildUi(
  root: string,
  log: (m: string) => void,
  opts: { inherit?: boolean } = {},
): Promise<void> {
  await run('npm', ['run', 'build', '--workspace', '@vo/web'], root, log, opts);
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  fs.writeFileSync(path.join(root, 'web', 'dist', '.vo-version'), version);
}

/** Start the app of 1.4.0 (tsx-loaded server, any free loopback port) — building the UI first if needed. */
export function appProcess(root: string, log: (m: string) => void) {
  return async (progress: (m: string) => void): Promise<RunningApp> => {
    if (needsBuild(root)) {
      progress('Перший запуск після оновлення: готую інтерфейс (до хвилини)…');
      await buildUi(root, log);
    }
    progress('Запускаю сервер…');
    // fork() by hand (spawn + an IPC channel) — fork's options don't take windowsHide:
    // a detached waiter has no console, so Windows would give the app a new, VISIBLE one,
    // and closing that window kills the app (exit 0xC000013A).
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', path.join(root, 'server', 'src', 'index.ts')],
      {
        cwd: root,
        env: { ...process.env, PORT: '0', HOST: '127.0.0.1', VO_STANDBY: '1' },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        windowsHide: true,
      },
    );
    child.stdout?.on('data', (d) => log(`[app] ${String(d).trim()}`));
    child.stderr?.on('data', (d) => log(`[app] ${String(d).trim()}`));
    child.once('exit', (code, signal) =>
      log(`[app] exit code ${code}${signal ? ` (${signal})` : ''}`),
    );
    const port = await new Promise<number>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('сервер не запустився за 60 с')), 60_000);
      child.on('message', (m: { type?: string; port?: number }) => {
        if (m?.type === 'ready' && typeof m.port === 'number') {
          clearTimeout(t);
          resolve(m.port);
        }
      });
      child.once('exit', (code) => {
        clearTimeout(t);
        reject(new Error(`сервер завершився з кодом ${code}`));
      });
    });
    return {
      port,
      onExit: (cb) => child.once('exit', cb),
      stop: () =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) return resolve();
          child.once('exit', () => resolve());
          child.kill();
          setTimeout(() => child.kill('SIGKILL'), 5000).unref();
        }),
    };
  };
}

export interface StandbySettings {
  port: number;
  idleMinutes: number;
}

export const DEFAULT_STANDBY: StandbySettings = { port: 4747, idleMinutes: 15 };

/** data/settings.json → standby (the server's options file — serverSettings.ts). */
export function readStandbySettings(dataDir: string): StandbySettings {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
    const s = raw?.standby ?? {};
    const port = Number(s.port);
    const idle = Number(s.idleMinutes);
    return {
      port: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : DEFAULT_STANDBY.port,
      idleMinutes: idle >= 1 && idle <= 24 * 60 ? idle : DEFAULT_STANDBY.idleMinutes,
    };
  } catch {
    return DEFAULT_STANDBY;
  }
}

async function main(): Promise<void> {
  const dataDir = process.env.VO_DATA_DIR ?? path.join(repoRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const logFile = path.join(dataDir, 'standby.log');
  try {
    if (fs.statSync(logFile).size > 1_000_000) fs.renameSync(logFile, `${logFile}.old`);
  } catch {
    /* no log yet */
  }
  const log = (m: string) => {
    const line = `${new Date().toISOString()} ${m}\n`;
    // sync: the last lines before process.exit (retire, relaunch) must not be lost
    try {
      fs.appendFileSync(logFile, line);
    } catch {
      /* a full or locked disk must not stop the waiter */
    }
    if (process.stdout.isTTY) process.stdout.write(line);
  };
  const settings = readStandbySettings(dataDir);
  const standby = createStandby({
    port: settings.port,
    host: '0.0.0.0',
    idleMs: settings.idleMinutes * 60_000,
    startApp: appProcess(repoRoot, log),
    log,
    onRetired: () => process.exit(0),
    // A fresh waiter reads the (new) port; this one has already closed its own.
    onRelaunch: () => {
      spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url)], {
        cwd: repoRoot,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
      process.exit(0);
    },
  });
  try {
    const port = await standby.listen();
    log(`waiting on :${port} (stops the app after ${settings.idleMinutes} min idle)`);
  } catch (err) {
    // Already served (another waiter, or the app itself): nothing to do.
    log(`not started: ${(err as Error).message}`);
    process.exit(0);
  }
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => void standby.close().then(() => process.exit(0)));
  }
}

const invokedDirectly =
  !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) void main();
