import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { attachLiveHub, getLive, publishLive, viewerCount, WS_PATH } from './live';

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer();
  attachLiveHub(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

/** Open a socket and collect its frames. */
function viewer(path = WS_PATH) {
  const ws = new WebSocket(base + path);
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
