import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import { CONTROL_HEADER, createStandby, type RunningApp } from './standby';

/** A stand-in for the real app: echoes what it saw (path, X-Forwarded-For) and WebSocket frames. */
function fakeApp() {
  let started = 0;
  let stopped = 0;
  const exits: (() => void)[] = [];
  let server: http.Server | null = null;
  const start = async (): Promise<RunningApp> => {
    started++;
    server = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ path: req.url, xff: req.headers['x-forwarded-for'] ?? null }));
    });
    const wss = new WebSocketServer({ server });
    wss.on('connection', (ws, req) => {
      ws.send(`xff=${req.headers['x-forwarded-for']}`);
      ws.on('message', (d) => ws.send(`echo:${d}`));
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const s = server;
    return {
      port: (s.address() as AddressInfo).port,
      onExit: (cb) => exits.push(cb),
      stop: async () => {
        stopped++;
        for (const c of wss.clients) c.terminate();
        await new Promise<void>((r) => s.close(() => r()));
      },
    };
  };
  return {
    start,
    crash: () => exits.splice(0).forEach((cb) => cb()),
    get started() {
      return started;
    },
    get stopped() {
      return stopped;
    },
  };
}

const opened: { close(): Promise<void> }[] = [];
afterEach(async () => {
  for (const s of opened.splice(0)) await s.close();
});

async function waiter(opts: Partial<Parameters<typeof createStandby>[0]> = {}) {
  const app = fakeApp();
  const events: string[] = [];
  const s = createStandby({
    port: 0,
    host: '127.0.0.1',
    idleMs: 60_000,
    startApp: app.start,
    onRetired: () => events.push('retired'),
    onRelaunch: () => events.push('relaunched'),
    ...opts,
  });
  opened.push(s);
  const port = await s.listen();
  const url = (p: string) => `http://127.0.0.1:${port}${p}`;
  return { s, app, port, url, events };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('standby waiter', () => {
  it('a page load while waiting gets «Запуск…» and starts the app; then everything is forwarded', async () => {
    const { app, url } = await waiter();
    const first = await fetch(url('/'), { headers: { accept: 'text/html' } });
    expect(await first.text()).toContain('запускається');
    await sleep(50);
    expect(app.started).toBe(1);
    const second = await fetch(url('/presenter'), { headers: { accept: 'text/html' } });
    // forwarded, with the visitor's address appended for the server's access check
    expect(await second.json()).toEqual({ path: '/presenter', xff: '127.0.0.1' });
    expect(app.started).toBe(1);
  });

  it('an API call waits for the start instead of failing', async () => {
    const { app, url } = await waiter();
    const r = await fetch(url('/api/health'));
    expect(await r.json()).toMatchObject({ path: '/api/health' });
    expect(app.started).toBe(1);
  });

  it('keeps a forged X-Forwarded-For from winning: the real address goes last', async () => {
    const { url } = await waiter();
    await fetch(url('/'));
    const r = await fetch(url('/x'), { headers: { 'x-forwarded-for': '10.0.0.9' } });
    expect(((await r.json()) as { xff: string }).xff).toBe('10.0.0.9, 127.0.0.1');
  });

  it('tunnels WebSockets (the live hub) and marks them with the visitor address', async () => {
    const { port } = await waiter();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
    const frames: string[] = [];
    ws.on('message', (d) => frames.push(String(d)));
    await new Promise((r) => ws.once('open', r));
    ws.send('hi');
    await sleep(100);
    expect(frames).toEqual(['xff=127.0.0.1', 'echo:hi']);
    ws.close();
  });

  it('stops the app when idle, never while a socket is open, and starts it again on the next visit', async () => {
    const { app, port, url } = await waiter({ idleMs: 60, checkMs: 20 });
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`); // an open control window / phone
    await new Promise((r) => ws.once('open', r));
    await sleep(200);
    expect(app.stopped).toBe(0);
    ws.close();
    await sleep(250);
    expect(app.stopped).toBe(1);
    await fetch(url('/api/health'));
    expect(app.started).toBe(2);
  });

  it('start(): the launcher starts the app before anyone visits (1.6.0)', async () => {
    const { s, app, url } = await waiter();
    const [a, b] = await Promise.all([s.start(), s.start()]); // one app, however often asked
    expect(a.port).toBe(b.port);
    expect(app.started).toBe(1);
    expect(await (await fetch(url('/__standby'))).json()).toMatchObject({ state: 'running' });
    // the first page load is the app itself, not «Запуск…»
    const r = await fetch(url('/'), { headers: { accept: 'text/html' } });
    expect(await r.json()).toMatchObject({ path: '/' });
  });

  it('restarts the app on the next visit after it crashed', async () => {
    const { app, url } = await waiter();
    await fetch(url('/api/a'));
    app.crash();
    await fetch(url('/api/b'));
    expect(app.started).toBe(2);
  });

  it('control: status, header required, retire and relaunch', async () => {
    const { app, url, events } = await waiter();
    expect(await (await fetch(url('/__standby'))).json()).toMatchObject({ state: 'waiting' });
    // a web page can't send the header without a preflight — plain POSTs are refused
    expect((await fetch(url('/__standby/retire'), { method: 'POST' })).status).toBe(403);
    await fetch(url('/api/x')); // app running
    const post = (a: string) =>
      fetch(url(`/__standby/${a}`), { method: 'POST', headers: { [CONTROL_HEADER]: '1' } });
    expect(await (await post('relaunch')).json()).toEqual({ relaunching: true });
    await sleep(100);
    expect(app.stopped).toBe(1);
    expect(events).toEqual(['relaunched']);
  });

  it('retire while waiting exits at once; retire while running waits for the app to stop', async () => {
    const a = await waiter();
    a.s.retire();
    await sleep(50);
    expect(a.events).toEqual(['retired']);

    const b = await waiter({ idleMs: 60, checkMs: 20 });
    await fetch(b.url('/api/x'));
    // The settings panel keeps polling; once the waiter has closed the polls are refused —
    // at once on macOS/Linux, so they must not surface as unhandled rejections.
    const poll = setInterval(() => void fetch(b.url('/__standby')).catch(() => undefined), 10);
    setTimeout(() => clearInterval(poll), 400);
    b.s.retire();
    await sleep(20);
    expect(b.events).toEqual([]); // the app is still in use
    await sleep(250); // …until it goes idle
    expect(b.events).toEqual(['retired']);

    // switched off: a much shorter idle than the everyday one
    const c = await waiter({ idleMs: 60_000, retireIdleMs: 60, checkMs: 20 });
    await fetch(c.url('/api/x'));
    await sleep(150);
    expect(c.app.stopped).toBe(0); // everyday idle: still running
    c.s.retire();
    await sleep(250);
    expect(c.events).toEqual(['retired']);
  });
});
