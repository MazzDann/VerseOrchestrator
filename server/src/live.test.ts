import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  attachLiveHub,
  dropRemote,
  getLive,
  notifyAllowed,
  pauseLive,
  publishLive,
  setCommandTimeout,
  viewerCount,
  WS_PATH,
} from './live';
import {
  createPairing,
  DEFAULT_ALLOWED,
  findByToken,
  revokePairing,
  setPairingAllowed,
} from './remote';

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
    return { ws, next, frames };
  }
  const origin = () => ({ origin: base.replace('ws:', 'http:') });

  it('forwards allowed commands from a paired remote to the control socket', async () => {
    const p = createPairing('Доповідач');
    const control = client({ role: 'control' }, origin());
    await control.next('welcome');
    const remote = client({ role: 'remote', token: p.token });
    const welcome = await remote.next('welcome');
    expect(welcome).toMatchObject({ role: 'remote', name: 'Доповідач', allowed: DEFAULT_ALLOWED });

    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'next', id: 'a1' }));
    const cmd = await control.next('command');
    expect(cmd).toMatchObject({ type: 'command', cmd: 'next', from: 'Доповідач' });
    expect(String(cmd.id)).toMatch(/:a1$/); // scoped to the pairing
    // the ack waits for the control window's real outcome
    control.ws.send(JSON.stringify({ type: 'result', id: cmd.id, ok: true }));
    expect(await remote.next('ack')).toMatchObject({ id: 'a1', cmd: 'next', ok: true });

    // 'black' is not in the default scope
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'black' }));
    expect(await remote.next('ack')).toMatchObject({ cmd: 'black', ok: false });

    control.ws.close();
    remote.ws.close();
  });

  it('a retried command id is applied once; the retry gets the same answer', async () => {
    const p = createPairing('Повтор');
    const control = client({ role: 'control' }, origin());
    await control.next('welcome');
    const remote = client({ role: 'remote', token: p.token });
    await remote.next('welcome');
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'next', id: 'r1' }));
    const cmd = await control.next('command');
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'next', id: 'r1' })); // resent while pending
    control.ws.send(
      JSON.stringify({ type: 'result', id: cmd.id, ok: false, reason: 'Це останній вірш' }),
    );
    expect(await remote.next('ack')).toMatchObject({
      id: 'r1',
      ok: false,
      reason: 'Це останній вірш',
    });
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'next', id: 'r1' })); // resent after the answer
    expect(await remote.next('ack')).toMatchObject({
      id: 'r1',
      ok: false,
      reason: 'Це останній вірш',
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(control.frames.filter((f) => f.type === 'command')).toEqual([]); // forwarded once
    control.ws.close();
    remote.ws.close();
  });

  it('tells the remote when the control window does not answer', async () => {
    setCommandTimeout(60);
    const p = createPairing('Тиша');
    const control = client({ role: 'control' }, origin());
    await control.next('welcome');
    const remote = client({ role: 'remote', token: p.token });
    await remote.next('welcome');
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'prev', id: 't1' }));
    await control.next('command'); // received, never answered (e.g. an older control page)
    expect(await remote.next('ack')).toMatchObject({
      id: 't1',
      ok: false,
      reason: 'Вікно керування не відповіло',
    });
    setCommandTimeout(2500);
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

  it('«На екран» is off until the operator allows it; the open remote learns at once', async () => {
    const p = createPairing('Сцена');
    const control = client({ role: 'control' }, origin());
    await control.next('welcome');
    const remote = client({ role: 'remote', token: p.token });
    expect((await remote.next('welcome')).allowed).not.toContain('show');
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'show', id: 's1' }));
    expect(await remote.next('ack')).toMatchObject({ cmd: 'show', ok: false });

    const updated = setPairingAllowed(p.id, [...DEFAULT_ALLOWED, 'show', 'bogus']);
    expect(updated?.allowed).toEqual([...DEFAULT_ALLOWED, 'show']);
    notifyAllowed(p.id, updated!.allowed);
    expect(await remote.next('allowed')).toMatchObject({ allowed: [...DEFAULT_ALLOWED, 'show'] });
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'show', id: 's2' }));
    const cmd = await control.next('command');
    expect(cmd).toMatchObject({ cmd: 'show', from: 'Сцена' });
    control.ws.send(JSON.stringify({ type: 'result', id: cmd.id, ok: true }));
    expect(await remote.next('ack')).toMatchObject({ id: 's2', cmd: 'show', ok: true });
    expect(setPairingAllowed('nope', ['show'])).toBeNull();
    control.ws.close();
    remote.ws.close();
  });

  it('a phone-chosen passage (pick / show + passage) needs «Вибір віршів» and a sane passage', async () => {
    const p = createPairing('Курсор', [...DEFAULT_ALLOWED, 'show']);
    const control = client({ role: 'control' }, origin());
    await control.next('welcome');
    const remote = client({ role: 'remote', token: p.token });
    await remote.next('welcome');
    const passage = { translationIds: [17], bookNumber: 500, chapter: 3, verses: [16] };
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'pick', id: 'p1', passage }));
    expect(await remote.next('ack')).toMatchObject({ cmd: 'pick', ok: false });
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'show', id: 'p2', passage }));
    expect(await remote.next('ack')).toMatchObject({
      cmd: 'show',
      ok: false,
      reason: 'Вибір віршів пульту не дозволено',
    });

    setPairingAllowed(p.id, [...DEFAULT_ALLOWED, 'show', 'pick']);
    const bad = { ...passage, verses: [-1] };
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'pick', id: 'p3', passage: bad }));
    expect(await remote.next('ack')).toMatchObject({ ok: false, reason: 'Неправильний уривок' });
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'pick', id: 'p4' }));
    expect(await remote.next('ack')).toMatchObject({ ok: false, reason: 'Не вибрано вірш' });

    remote.ws.send(
      JSON.stringify({
        type: 'command',
        cmd: 'show',
        id: 'p5',
        passage: { ...passage, verses: [17, 16, 16] },
      }),
    );
    const cmd = await control.next('command');
    // forwarded with the passage, verses de-duplicated and sorted
    expect(cmd).toMatchObject({ cmd: 'show', passage: { ...passage, verses: [16, 17] } });
    control.ws.send(JSON.stringify({ type: 'result', id: cmd.id, ok: true }));
    expect(await remote.next('ack')).toMatchObject({ id: 'p5', ok: true });
    control.ws.close();
    remote.ws.close();
  });

  it('songs are a permission of their own, per remote (sane ids, not a command)', async () => {
    const p = createPairing('Пісня', [...DEFAULT_ALLOWED, 'show', 'pick']);
    const control = client({ role: 'control' }, origin());
    await control.next('welcome');
    const remote = client({ role: 'remote', token: p.token });
    await remote.next('welcome');
    // verses allowed, songs not: a stanza is refused
    remote.ws.send(
      JSON.stringify({ type: 'command', cmd: 'pick', id: 'g0', song: { songId: 13, stanza: 1 } }),
    );
    expect(await remote.next('ack')).toMatchObject({
      ok: false,
      reason: 'Пісні пульту не дозволено',
    });
    setPairingAllowed(p.id, [...DEFAULT_ALLOWED, 'show', 'songs']); // songs only now
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'songs', id: 'g00' }));
    expect(await remote.next('ack')).toMatchObject({
      ok: false,
      reason: 'Ця дія пульту не дозволена',
    });
    remote.ws.send(
      JSON.stringify({
        type: 'command',
        cmd: 'pick',
        id: 'g01',
        passage: { translationIds: [17], bookNumber: 500, chapter: 3, verses: [16] },
      }),
    );
    expect(await remote.next('ack')).toMatchObject({
      ok: false,
      reason: 'Вибір віршів пульту не дозволено',
    });
    remote.ws.send(
      JSON.stringify({ type: 'command', cmd: 'pick', id: 'g1', song: { songId: 13, stanza: -1 } }),
    );
    expect(await remote.next('ack')).toMatchObject({ ok: false, reason: 'Неправильна строфа' });
    remote.ws.send(
      JSON.stringify({ type: 'command', cmd: 'show', id: 'g2', song: { songId: 13, stanza: 2 } }),
    );
    const cmd = await control.next('command');
    expect(cmd).toMatchObject({ cmd: 'show', song: { songId: 13, stanza: 2 } });
    expect(cmd.passage).toBeUndefined();
    control.ws.send(JSON.stringify({ type: 'result', id: cmd.id, ok: true }));
    expect(await remote.next('ack')).toMatchObject({ id: 'g2', ok: true });
    control.ws.close();
    remote.ws.close();
  });

  it('the operator suggests a passage / stanza to one remote — only if it may choose that', async () => {
    const p = createPairing('Підказка', [...DEFAULT_ALLOWED, 'pick']);
    const other = createPairing('Інший', [...DEFAULT_ALLOWED, 'pick']);
    const control = client({ role: 'control' }, origin());
    await control.next('welcome');
    const remote = client({ role: 'remote', token: p.token });
    await remote.next('welcome');
    const bystander = client({ role: 'remote', token: other.token });
    await bystander.next('welcome');
    const passage = { translationIds: [17], bookNumber: 500, chapter: 3, verses: [16] };
    control.ws.send(
      JSON.stringify({ type: 'suggest', to: p.id, passage, reference: 'Ів 3:16', text: 'Так бо…' }),
    );
    expect(await remote.next('suggest')).toMatchObject({
      passage,
      reference: 'Ів 3:16',
      text: 'Так бо…',
    });
    expect(await control.next('suggested')).toMatchObject({ to: p.id, delivered: 1 });
    // a stanza needs «Пісні», which this remote hasn't got
    control.ws.send(JSON.stringify({ type: 'suggest', to: p.id, song: { songId: 13, stanza: 0 } }));
    expect(await control.next('suggested')).toMatchObject({
      delivered: 0,
      reason: 'Цьому пульту не дозволено пісні',
    });
    // a remote can't suggest
    remote.ws.send(JSON.stringify({ type: 'suggest', to: other.id, passage }));
    await new Promise((r) => setTimeout(r, 80));
    expect(bystander.frames.some((f) => f.type === 'suggest')).toBe(false);
    control.ws.close();
    remote.ws.close();
    bystander.ws.close();
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
    control.send(
      JSON.stringify({
        type: 'screen',
        screen: { reference: 'Ів 1:1' },
        next: { reference: 'Ів 1:2' },
        preview: { reference: 'Ів 1:5' },
      }),
    );
    await new Promise((r) => setTimeout(r, 100));
    expect(rGot.filter((f) => f.type === 'screen').at(-1)).toEqual({
      type: 'screen',
      screen: { reference: 'Ів 1:1' },
      next: { reference: 'Ів 1:2' },
      preview: { reference: 'Ів 1:5' }, // what «На екран» would show (1.5.0)
    });
    expect(vGot.some((f) => f.type === 'screen')).toBe(false);
    // The control socket is told how many audience viewers are connected (the viewer
    // socket here; control/remote sockets don't count).
    expect(cGot.filter((f) => f.type === 'viewers').at(-1)).toMatchObject({ type: 'viewers' });
    expect(
      (cGot.filter((f) => f.type === 'viewers').at(-1) as { count: number }).count,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe('frame size', () => {
  it('accepts a large control frame (long passage) without dropping the socket', async () => {
    const origin = { origin: base.replace('ws:', 'http:') };
    const control = new WebSocket(base + WS_PATH, { headers: origin });
    open.push(control);
    await new Promise((r) => control.once('open', r));
    control.send(JSON.stringify({ type: 'hello', role: 'control' }));
    const big = 'слово '.repeat(8000); // ~100 KB in UTF-8
    control.send(JSON.stringify({ type: 'screen', screen: { text: big }, next: null }));
    await new Promise((r) => setTimeout(r, 150));
    expect(control.readyState).toBe(WebSocket.OPEN);
  });
});

describe('follow-along publish / pause', () => {
  it('starts paused, un-pauses on publish, and pause clears the slide', async () => {
    // (earlier tests published, so reset to the documented start state first)
    pauseLive();
    expect(getLive()).toMatchObject({ paused: true, slide: null });
    publishLive({ reference: 'Ів 3:16' });
    expect(getLive()).toMatchObject({ paused: false, slide: { reference: 'Ів 3:16' } });

    const v = viewer();
    await v.next();
    const frame = v.next();
    pauseLive();
    expect(await frame).toMatchObject({ type: 'slide', paused: true, slide: null });
    v.ws.close();
  });

  it('control socket can publish and pause; a viewer cannot', async () => {
    const origin = { origin: base.replace('ws:', 'http:') };
    const control = new WebSocket(base + WS_PATH, { headers: origin });
    const intruder = new WebSocket(base + WS_PATH);
    open.push(control, intruder);
    await Promise.all([control, intruder].map((w) => new Promise((r) => w.once('open', r))));
    intruder.send(JSON.stringify({ type: 'publish', slide: { reference: 'spoof' } }));
    await new Promise((r) => setTimeout(r, 80));
    expect(getLive().slide).not.toEqual({ reference: 'spoof' });

    control.send(JSON.stringify({ type: 'hello', role: 'control' }));
    await new Promise((r) => setTimeout(r, 80));
    control.send(JSON.stringify({ type: 'publish', slide: { reference: 'Пс 23:1' } }));
    await new Promise((r) => setTimeout(r, 80));
    expect(getLive()).toMatchObject({ paused: false, slide: { reference: 'Пс 23:1' } });
    control.send(JSON.stringify({ type: 'publish', paused: true }));
    await new Promise((r) => setTimeout(r, 80));
    expect(getLive()).toMatchObject({ paused: true, slide: null });
  });
});
