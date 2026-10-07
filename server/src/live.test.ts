import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import {
  announceShutdown,
  attachLiveHub,
  browserOf,
  controlWindows,
  controlWindowsRoute,
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
import { handovers } from './handover';

let server: Server;
let base: string;
/** Every socket a test opened, so teardown can't hang on one left open. */
const open: WebSocket[] = [];

beforeAll(async () => {
  // the launcher's question (index.ts serves it the same way)
  server = createServer((req, res) =>
    req.url === '/api/control-windows' ? controlWindowsRoute(req, res) : res.writeHead(404).end(),
  );
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

/** Real User-Agents (2026): what each browser sends with its socket's upgrade request. */
const UA = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  edgeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0',
  // Brave and Arc send Chrome's own
  braveMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
  arcMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  firefoxMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:156.0) Gecko/20100101 Firefox/156.0',
  firefox140Win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
  safariMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Safari/605.1.15',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  chromeWin:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
};

/** Wait until `ok()` holds (a closed socket leaves the server a moment later). */
async function until(ok: () => boolean, ms = 2000): Promise<void> {
  for (const end = Date.now() + ms; !ok(); ) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
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

  it('tells any socket its clock — once a second at most (1.7.3)', async () => {
    const v = viewer();
    await v.next(); // the slide
    const t = Date.now() - 60_000; // a phone a minute behind
    const answer = new Promise<Record<string, unknown>>((resolve) =>
      v.ws.on('message', (d) => {
        const f = JSON.parse(String(d));
        if (f.type === 'clock') resolve(f);
      }),
    );
    v.ws.send(JSON.stringify({ type: 'clock', t }));
    const f = await answer;
    expect(f.t).toBe(t);
    expect(Math.abs((f.now as number) - Date.now())).toBeLessThan(1000);
    // asked again at once: no answer (a socket can't flood the hub)
    v.ws.send(JSON.stringify({ type: 'clock', t }));
    v.ws.send(JSON.stringify({ type: 'clock', t: 'not a time' }));
    await new Promise((r) => setTimeout(r, 200));
    expect(v.frames.filter((x) => x.type === 'clock')).toHaveLength(1);
    v.ws.close();
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

describe('«Вимкнути повністю» (0.7.1)', () => {
  it('tells every page the app is going, not just gone', async () => {
    const a = viewer();
    await a.next(); // the slide it gets on connect
    const b = viewer();
    await b.next();
    const frames = Promise.all([a.next(), b.next()]);
    announceShutdown();
    expect((await frames).map((f) => f.type)).toEqual(['shutdown', 'shutdown']);
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

  it('two control windows (two browsers): one in charge, take-control, failover', async () => {
    const p = createPairing('Два вікна');
    const a = client({ role: 'control' }, origin());
    await a.next('welcome');
    expect(await a.next('hub')).toMatchObject({ active: true });
    const b = client({ role: 'control' }, origin());
    await b.next('welcome');
    expect(await b.next('hub')).toMatchObject({ active: false });
    const remote = client({ role: 'remote', token: p.token });
    await remote.next('welcome');

    // a command goes to the window in charge only
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'next', id: 'w1' }));
    const toA = await a.next('command');
    a.ws.send(JSON.stringify({ type: 'result', id: toA.id, ok: true }));
    expect(await remote.next('ack')).toMatchObject({ id: 'w1', ok: true });
    // the other one's screen doesn't reach the remote
    b.ws.send(JSON.stringify({ type: 'screen', screen: { reference: 'від B' } }));
    a.ws.send(JSON.stringify({ type: 'screen', screen: { reference: 'від A' } }));
    await new Promise((r) => setTimeout(r, 80));
    const screens = remote.frames.filter((f) => f.type === 'screen');
    expect(screens.at(-1)).toMatchObject({ screen: { reference: 'від A' } });
    expect(screens.some((f) => JSON.stringify(f).includes('від B'))).toBe(false);

    // B takes over
    b.ws.send(JSON.stringify({ type: 'take-control' }));
    expect(await a.next('hub')).toMatchObject({ active: false });
    expect(await b.next('hub')).toMatchObject({ active: true });
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'next', id: 'w2' }));
    const toB = await b.next('command');
    b.ws.send(JSON.stringify({ type: 'result', id: toB.id, ok: true }));
    expect(await remote.next('ack')).toMatchObject({ id: 'w2', ok: true });

    // B closes: A takes charge again by itself
    b.ws.close();
    expect(await a.next('hub')).toMatchObject({ active: true });
    remote.ws.send(JSON.stringify({ type: 'command', cmd: 'prev', id: 'w3' }));
    expect(await a.next('command')).toMatchObject({ cmd: 'prev' });
    await new Promise((r) => setTimeout(r, 50));
    expect(a.frames.filter((f) => f.type === 'command')).toEqual([]); // nothing went astray
    a.ws.close();
    remote.ws.close();
  });

  it('tells the launcher the browser of the control window in charge', async () => {
    // the sockets of the tests above close on the server's side a moment later
    await until(() => controlWindows().open === 0);
    expect(controlWindows()).toEqual({ open: 0, active: null });
    const firefox = client({ role: 'control' }, { ...origin(), 'user-agent': UA.firefoxMac });
    expect(await firefox.next('hub')).toMatchObject({ active: true });
    expect(controlWindows()).toEqual({ open: 1, active: { browser: 'firefox' } });
    // the user's test (2026-10-01): Firefox first, then a Chrome tab on standby
    const chrome = client({ role: 'control' }, { ...origin(), 'user-agent': UA.chromeMac });
    expect(await chrome.next('hub')).toMatchObject({ active: false });
    expect(controlWindows()).toEqual({ open: 2, active: { browser: 'firefox' } });
    // … as GET /api/control-windows answers the launcher
    const asked = await fetch(`${base.replace('ws:', 'http:')}/api/control-windows`);
    expect(asked.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await asked.json()).toEqual({ open: 2, active: { browser: 'firefox' } });
    chrome.ws.send(JSON.stringify({ type: 'take-control' }));
    expect(await chrome.next('hub')).toMatchObject({ active: true });
    expect(await firefox.next('hub')).toMatchObject({ active: false });
    expect(controlWindows()).toEqual({ open: 2, active: { browser: 'chromium' } });
    // the one in charge closes: the other takes over, and the answer follows
    chrome.ws.close();
    expect(await firefox.next('hub')).toMatchObject({ active: true });
    expect(controlWindows()).toEqual({ open: 1, active: { browser: 'firefox' } });
    firefox.ws.close();
    await until(() => controlWindows().open === 0);
    expect(controlWindows()).toEqual({ open: 0, active: null });
    // no User-Agent at all (a script, not a browser): the launcher asks every browser
    const bare = client({ role: 'control' }, origin());
    await bare.next('hub');
    expect(controlWindows()).toEqual({ open: 1, active: { browser: 'other' } });
    bare.ws.close();
    await until(() => controlWindows().open === 0);
  });

  it('«Відкрити в … зараз»: a window with a good token takes charge, the others hear where', async () => {
    await until(() => controlWindows().open === 0);
    const old = client({ role: 'control' }, { ...origin(), 'user-agent': UA.safariMac });
    expect(await old.next('hub')).toMatchObject({ active: true });
    const token = handovers.issue({ id: 'zen', name: 'Zen' });
    const zen = client(
      { role: 'control', handover: token },
      { ...origin(), 'user-agent': UA.firefoxMac },
    );
    expect(await zen.next('handover')).toEqual({ type: 'handover', browser: 'zen' });
    expect(await zen.next('hub')).toEqual({ type: 'hub', active: true });
    expect(await old.next('hub')).toEqual({ type: 'hub', active: false, movedTo: 'Zen' });
    expect(controlWindows()).toEqual({ open: 2, active: { browser: 'firefox' } });
    expect(handovers.peek(token)).toBeNull(); // used up
    // the same token again (a reconnect, a copied address): an ordinary control window
    const again = client({ role: 'control', handover: token }, origin());
    expect(await again.next('hub')).toEqual({ type: 'hub', active: false });
    await new Promise((r) => setTimeout(r, 50));
    expect(again.frames.some((f) => f.type === 'handover')).toBe(false);
    // «Слухати тут» in the old one: an ordinary take-over, no word of a move
    old.ws.send(JSON.stringify({ type: 'take-control' }));
    expect(await old.next('hub')).toEqual({ type: 'hub', active: true });
    expect(await zen.next('hub')).toEqual({ type: 'hub', active: false });
    // a wrong token changes nothing either
    const wrong = client({ role: 'control', handover: 'not-a-token-not-a-token' }, origin());
    expect(await wrong.next('hub')).toEqual({ type: 'hub', active: false });
    expect(controlWindows().active).toEqual({ browser: 'safari' });
    // a good token on a socket without the page's origin: refused before it is looked at
    const far = handovers.issue({ id: 'zen', name: 'Zen' });
    const foreign = client({ role: 'control', handover: far }, { 'user-agent': UA.firefoxMac });
    expect(await foreign.next('denied')).toMatchObject({ type: 'denied' });
    expect(handovers.peek(far)).not.toBeNull();
    handovers.revoke(far);
    for (const c of [old, zen, again, wrong, foreign]) c.ws.close();
    await until(() => controlWindows().open === 0);
  });

  it('the running order goes to remotes allowed «Послідовність»; items and queue need it', async () => {
    const withList = createPairing('Зі списком', [...DEFAULT_ALLOWED, 'show', 'playlist']);
    const without = createPairing('Без списку', [...DEFAULT_ALLOWED, 'show', 'pick']);
    const control = client({ role: 'control' }, origin());
    await control.next('welcome');
    const r1 = client({ role: 'remote', token: withList.token });
    await r1.next('welcome');
    expect((await r1.next('playlist')).playlist).toBeNull(); // at connect: nothing shared yet
    const r2 = client({ role: 'remote', token: without.token });
    await r2.next('welcome');
    const playlist = { items: [{ id: 'a1', kind: 'text', label: 'Оголошення' }], currentId: null };
    control.ws.send(JSON.stringify({ type: 'playlist', playlist }));
    expect((await r1.next('playlist')).playlist).toEqual(playlist);
    await new Promise((r) => setTimeout(r, 60));
    expect(r2.frames.some((f) => f.type === 'playlist')).toBe(false);

    // an item: forwarded with its id; the remote without «Послідовність» is refused
    r1.ws.send(JSON.stringify({ type: 'command', cmd: 'show', id: 'i1', item: 'a1' }));
    const cmd = await control.next('command');
    expect(cmd).toMatchObject({ cmd: 'show', item: 'a1' });
    control.ws.send(JSON.stringify({ type: 'result', id: cmd.id, ok: true }));
    expect(await r1.next('ack')).toMatchObject({ id: 'i1', ok: true });
    r2.ws.send(JSON.stringify({ type: 'command', cmd: 'pick', id: 'i2', item: 'a1' }));
    expect(await r2.next('ack')).toMatchObject({
      ok: false,
      reason: 'Послідовність пульту не дозволено',
    });
    // queue: «Послідовність» AND the right to choose that kind
    const passage = { translationIds: [17], bookNumber: 500, chapter: 3, verses: [16] };
    r1.ws.send(JSON.stringify({ type: 'command', cmd: 'queue', id: 'q1', passage }));
    expect(await r1.next('ack')).toMatchObject({
      ok: false,
      reason: 'Вибір віршів пульту не дозволено',
    });
    r2.ws.send(JSON.stringify({ type: 'command', cmd: 'queue', id: 'q2', passage }));
    expect(await r2.next('ack')).toMatchObject({
      ok: false,
      reason: 'Послідовність пульту не дозволено',
    });
    // granting it later sends the list at once
    notifyAllowed(
      without.id,
      setPairingAllowed(without.id, [...DEFAULT_ALLOWED, 'pick', 'playlist'])!.allowed,
    );
    expect((await r2.next('playlist')).playlist).toEqual(playlist);
    control.ws.close();
    r1.ws.close();
    r2.ws.close();
  });

  it('a desk (another computer) hears whole slides; a phone keeps the summaries (1.9.0-beta.10)', async () => {
    const pd = createPairing('Ноутбук', undefined, 'desk');
    const pp = createPairing('Телефон');
    const control = client({ role: 'control' }, origin());
    await control.next('welcome');
    const desk = client({ role: 'remote', token: pd.token, desk: true });
    expect(await desk.next('welcome')).toMatchObject({ kind: 'desk' });
    // on connect: what the hub has (nothing yet in this run, or the last test's)
    expect(await desk.next('slides')).toMatchObject({ type: 'slides' });
    // a phone's link saying `desk: true` keeps the summaries (review of 1.9.0-beta.10)
    const phone = client({ role: 'remote', token: pp.token, desk: true });
    expect(await phone.next('welcome')).toMatchObject({ kind: 'phone' });
    const live = { lines: [{ text: 'Бо так полюбив Бог світ' }], reference: 'Ів 3:16' };
    const next = { lines: [{ text: 'Бо не послав Бог Сина' }], reference: 'Ів 3:17' };
    control.ws.send(JSON.stringify({ type: 'slides', live, next }));
    expect(await desk.next('slides')).toEqual({ type: 'slides', live, next });
    // a desk that connects later gets them at once
    const late = client({ role: 'remote', token: pd.token, desk: true });
    await late.next('welcome');
    expect(await late.next('slides')).toEqual({ type: 'slides', live, next });
    await new Promise((r) => setTimeout(r, 60));
    expect(phone.frames.some((f) => f.type === 'slides')).toBe(false);
    // a remote can't feed them, nor can a control window not in charge
    desk.ws.send(JSON.stringify({ type: 'slides', live: next, next: live }));
    const second = client({ role: 'control' }, origin());
    await second.next('welcome');
    second.ws.send(JSON.stringify({ type: 'slides', live: null, next: null }));
    await new Promise((r) => setTimeout(r, 60));
    expect(desk.frames.some((f) => f.type === 'slides')).toBe(false);
    for (const c of [control, second, desk, late, phone]) c.ws.close();
    await until(() => controlWindows().open === 0);
  });

  it('«Заставка» and «Відлік» need their own permission; a countdown says what to do', async () => {
    const p = createPairing('Ноутбук помічника', [...DEFAULT_ALLOWED, 'cover'], 'desk');
    const control = client({ role: 'control' }, origin());
    await control.next('welcome');
    const desk = client({ role: 'remote', token: p.token, desk: true });
    await desk.next('welcome');
    desk.ws.send(JSON.stringify({ type: 'command', cmd: 'cover', id: 'c1' }));
    const cover = await control.next('command');
    expect(cover).toMatchObject({ cmd: 'cover', from: 'Ноутбук помічника' });
    control.ws.send(JSON.stringify({ type: 'result', id: cover.id, ok: true }));
    expect(await desk.next('ack')).toMatchObject({ id: 'c1', ok: true });
    desk.ws.send(
      JSON.stringify({ type: 'command', cmd: 'countdown', id: 't1', countdown: { op: 'start' } }),
    );
    expect(await desk.next('ack')).toMatchObject({
      id: 't1',
      ok: false,
      reason: 'Ця дія пульту не дозволена',
    });
    notifyAllowed(p.id, setPairingAllowed(p.id, [...DEFAULT_ALLOWED, 'countdown'])!.allowed);
    expect(await desk.next('allowed')).toMatchObject({
      allowed: [...DEFAULT_ALLOWED, 'countdown'],
    });
    desk.ws.send(
      JSON.stringify({ type: 'command', cmd: 'countdown', id: 't2', countdown: { op: 'nope' } }),
    );
    expect(await desk.next('ack')).toMatchObject({ id: 't2', reason: 'Неправильний відлік' });
    desk.ws.send(
      JSON.stringify({
        type: 'command',
        cmd: 'countdown',
        id: 't3',
        countdown: { op: 'start', seconds: 450, extra: 'x' },
      }),
    );
    const cmd = await control.next('command');
    expect(cmd).toMatchObject({ cmd: 'countdown', countdown: { op: 'start', seconds: 450 } });
    expect(cmd.countdown).toEqual({ op: 'start', seconds: 450 });
    control.ws.send(JSON.stringify({ type: 'result', id: cmd.id, ok: true }));
    expect(await desk.next('ack')).toMatchObject({ id: 't3', ok: true });
    control.ws.close();
    desk.ws.close();
    await until(() => controlWindows().open === 0);
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

describe('the browser of a control socket (the launcher brings it forward on a Mac)', () => {
  it('tells browsers apart by their User-Agent', () => {
    expect(browserOf(UA.chromeMac)).toBe('chromium');
    expect(browserOf(UA.braveMac)).toBe('chromium');
    expect(browserOf(UA.arcMac)).toBe('chromium');
    expect(browserOf(UA.chromeWin)).toBe('chromium');
    expect(browserOf(UA.edgeMac)).toBe('edge'); // Chrome's words + «Edg/»
    expect(browserOf(UA.firefoxMac)).toBe('firefox');
    expect(browserOf(UA.firefox140Win)).toBe('firefox');
    expect(browserOf(UA.safariMac)).toBe('safari'); // «Safari/» without «Chrome/»
    expect(browserOf(UA.safariIos)).toBe('safari');
    for (const other of [undefined, '', 'curl/8.7.1', 'node'])
      expect(browserOf(other)).toBe('other');
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
      preview: { reference: 'Ів 1:5' }, // what «На екран» would show (0.6.0)
    });
    expect(vGot.some((f) => f.type === 'screen')).toBe(false);
    // The control socket is told how many audience viewers are connected (the viewer
    // socket here; control/remote sockets don't count).
    expect(cGot.filter((f) => f.type === 'viewers').at(-1)).toMatchObject({ type: 'viewers' });
    expect(
      (cGot.filter((f) => f.type === 'viewers').at(-1) as { count: number }).count,
    ).toBeGreaterThanOrEqual(1);
    // one control window leads the hub (0.6.8): close this one before the next test's
    await Promise.all(
      [control, remote, viewer].map((w) => new Promise((r) => (w.once('close', r), w.close()))),
    );
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
    await new Promise((r) => (control.once('close', r), control.close()));
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
