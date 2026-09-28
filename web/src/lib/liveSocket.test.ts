import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectLive } from './liveSocket';

/** A socket the test opens and closes by hand; like a real one, close() reports later. */
class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.());
  }
  accept() {
    this.readyState = 1;
    this.onopen?.();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:5173' });
  vi.stubGlobal('window', {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('connectLive', () => {
  it('says hello on connect, reports a lost socket and reconnects', async () => {
    const status: boolean[] = [];
    connectLive({ hello: { role: 'control' }, onStatus: (open) => status.push(open) });
    const first = FakeSocket.all[0];
    expect(first.url).toBe('ws://localhost:5173/api/ws');
    first.accept();
    expect(first.sent).toEqual([JSON.stringify({ type: 'hello', role: 'control' })]);
    first.close(); // the server went away
    await Promise.resolve();
    expect(status).toEqual([true, false]);
    vi.advanceTimersByTime(500);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it('a stopped connection says nothing more (1.5.25)', async () => {
    const status: boolean[] = [];
    const c = connectLive({ hello: { role: 'control' }, onStatus: (open) => status.push(open) });
    FakeSocket.all[0].accept();
    c.stop();
    await Promise.resolve();
    vi.advanceTimersByTime(20_000);
    expect(status).toEqual([true]); // no «lost» after stop — the Mac test's stuck warning
    expect(FakeSocket.all).toHaveLength(1); // and no reconnect
  });
});
