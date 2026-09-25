import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { attachLiveHub, dropRemote, getLive, publishLive, viewerCount, WS_PATH } from './live';
import { createPairing, DEFAULT_ALLOWED, findByToken, revokePairing } from './remote';

let server: Server;
let base: string;
/** Every socket a test opened, so teardown can't hang on one left open. */
const open: WebSocket[] = [];

beforeAll(async () => {
  server = createServer();
  attachLiveHub(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  for (const ws of open) ws.terminate();
  return new Promise<void>((r) => server.close(() => r()));
});

/** Open a socket and collect its frames. */
function viewer(path = WS_PATH) {
  const ws = new WebSocket(base + path);
  open.push(ws);
  const frames: { type: string; version: number; slide: unknown }[] = [];
  const next = () =>
    new Promise<(typeof frames)[number]>((resolve, reject) => {
      ws.once('message', (d) => resolve(JSON.parse(String(d))));
      ws.once('error', reject);
    });
  ws.on('message', (d) => frames.push(JSON.parse(String(d))));
  return { ws, frames, next };
}

describe('live hub', () => {
  it('sends the current slide on connect', async () => {
    publishLive({ reference: 'Ів 3:16' });
    const v = viewer();
    const first = await v.next();
    expect(first).toEqual({ type: 'slide', ...getLive() });
    v.ws.close();
  });

  it('pushes every publish to all open viewers', async () => {
    const a = viewer();
    const b = viewer();
    await Promise.all([a.next(), b.next()]);
    expect(viewerCount()).toBeGreaterThanOrEqual(2);

    const pa = a.next();
    const pb = b.next();
    const version = publishLive({ reference: 'Пс 23:1' });
    const [fa, fb] = await Promise.all([pa, pb]);
    for (const f of [fa, fb]) {
      expect(f.version).toBe(version);
      expect(f.slide).toEqual({ reference: 'Пс 23:1' });
    }
    a.ws.close();
    b.ws.close();
  });

  it('refuses upgrades on other paths', async () => {
    const ws = new WebSocket(base + '/api/other');
    const outcome = await new Promise<string>((resolve) => {
      ws.once('open', () => resolve('open'));
      ws.once('error', () => resolve('error'));
    });
    expect(outcome).toBe('error');
  });
});

describe('speaker remote over the hub', () => {
  /** Socket that sends a hello on open and exposes a frame waiter filtered by type. */
  function client(hello: object, headers: Record<string, string> = {}) {
    const ws = new WebSocket(base + WS_PATH, { headers });
    const frames: Record<string, unknown>[] = [];
    const waiters: { type: string; resolve: (f: Record<string, unknown>) => void }[] = [];
    open.push(ws);
    ws.on('message', (d) => {
      const f = JSON.parse(String(d));
      const i = waiters.findIndex((w) => w.type === f.type);
      // A frame goes either to a waiting `next` or into the buffer — never both.
      if (i >= 0) waiters.splice(i, 1)[0].resolve(f);
      else frames.push(f);
    });
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', ...hello })));
    const next = (type: string) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const seen = frames.find((f) => f.type === type);
        if (seen) {
          frames.splice(frames.indexOf(seen), 1);
          resolve(seen);
        } else waiters.push({ type, resolve });
      });
    return { ws, next };
  }
  const origin = () => ({ origin: base.replace('ws:', 'http:') });

  it('forwards allowed commands from a paired remote to the control socket', async () => {
    const p = createPairing('Доповідач');
    const control = client({ role: 'control' }, origin());
    await control.next('welcome');
    const remote = client({ role: 'remote', token: p.token });
    const welcome = await remote.next('welcome');
    expect(welcome).toMatchObject({ role: 'remote', name: 'Доповідач', allowed: DEFAULT_ALLOWED });

    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'next' }));
    expect(await control.next('command')).toEqual({
      type: 'command',
      cmd: 'next',
      from: 'Доповідач',
    });
    expect(await remote.next('ack')).toMatchObject({ cmd: 'next', ok: true });

    // 'black' is not in the default scope
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'black' }));
    expect(await remote.next('ack')).toMatchObject({ cmd: 'black', ok: false });

    control.ws.close();
    remote.ws.close();
  });

  it('rejects a bad token and a control hello without same-origin', async () => {
    const bad = client({ role: 'remote', token: 'x'.repeat(24) });
    expect(await bad.next('denied')).toMatchObject({ type: 'denied' });
    const ctl = client({ role: 'control' }); // no Origin header
    expect(await ctl.next('denied')).toMatchObject({ type: 'denied' });
    ctl.ws.close();
  });

  it('a viewer cannot send commands', async () => {
    const v = client({ role: 'viewer' });
    await v.next('slide');
    v.ws.send(JSON.stringify({ type: 'command', cmd: 'next' }));
    expect(await v.next('ack')).toMatchObject({ ok: false });
    v.ws.close();
  });

  it('revoking a pairing disconnects its remote', async () => {
    const p = createPairing('Тимчасовий');
    const remote = client({ role: 'remote', token: p.token });
    await remote.next('welcome');
    const closed = new Promise<number>((r) => remote.ws.once('close', (code) => r(code)));
    revokePairing(p.id);
    dropRemote(p.id);
    expect(await remote.next('revoked')).toMatchObject({ type: 'revoked' });
    expect(await closed).toBe(4001);
    expect(findByToken(p.token)).toBeNull();
  });
});

describe('screen relay (control → remotes only)', () => {
  it('relays the control screen to remotes but not to viewers', async () => {
    const origin = { origin: base.replace('ws:', 'http:') };
    const collect = (ws: WebSocket) => {
      const got: Record<string, unknown>[] = [];
      ws.on('message', (d) => got.push(JSON.parse(String(d))));
      return got;
    };
    const p = createPairing('Екран');
    const control = new WebSocket(base + WS_PATH, { headers: origin });
    const remote = new WebSocket(base + WS_PATH);
    const viewer = new WebSocket(base + WS_PATH);
    open.push(control, remote, viewer);
    const rGot = collect(remote);
    const vGot = collect(viewer);
    const cGot = collect(control);
    await Promise.all([control, remote, viewer].map((w) => new Promise((r) => w.once('open', r))));
    control.send(JSON.stringify({ type: 'hello', role: 'control' }));
    remote.send(JSON.stringify({ type: 'hello', role: 'remote', token: p.token }));
    await new Promise((r) => setTimeout(r, 100));
    expect(cGot.some((f) => f.type === 'welcome')).toBe(true);
    control.send(JSON.stringify({ type: 'screen', slide: { reference: 'Ів 1:1' } }));
    await new Promise((r) => setTimeout(r, 100));
    expect(rGot.filter((f) => f.type === 'screen').at(-1)).toEqual({
      type: 'screen',
      slide: { reference: 'Ів 1:1' },
    });
    expect(vGot.some((f) => f.type === 'screen')).toBe(false);
  });
});
