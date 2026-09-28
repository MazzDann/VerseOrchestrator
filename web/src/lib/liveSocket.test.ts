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

/** The page events connectLive listens to (pagehide, online, visibilitychange …). */
const listeners = new Map<string, () => void>();

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  listeners.clear();
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:5173' });
  vi.stubGlobal('document', { visibilityState: 'visible' });
  vi.stubGlobal('window', {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  });
});

/** The server refuses the pending connect (as a stopped one does). */
async function refuse() {
  FakeSocket.all.at(-1)!.close();
  await Promise.resolve();
}
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

  it('retries at most every 2 s and reports the loss once (1.5.29)', async () => {
    const status: boolean[] = [];
    connectLive({ onStatus: (open) => status.push(open) });
    FakeSocket.all[0].accept();
    await refuse(); // the server went away
    // attempts 0.5 s, 1 s, 2 s, 2 s after each other — no longer 4 s, 8 s … 10 s
    for (const wait of [500, 1000, 2000, 2000]) {
      const n = FakeSocket.all.length;
      vi.advanceTimersByTime(wait - 1);
      expect(FakeSocket.all).toHaveLength(n);
      vi.advanceTimersByTime(1);
      expect(FakeSocket.all).toHaveLength(n + 1);
      await refuse();
    }
    // four refused retries, one «down»: the control window's 1.5.25 warning timer isn't
    // restarted by each of them (with 2 s retries it would never run out)
    expect(status).toEqual([true, false]);
    vi.advanceTimersByTime(2000);
    FakeSocket.all.at(-1)!.accept();
    expect(status).toEqual([true, false, true]);
  });

  it('back on screen or online: tries at once, but never beside a live connect (1.5.29)', async () => {
    connectLive({});
    FakeSocket.all[0].accept();
    listeners.get('visibilitychange')!(); // connected: nothing to do
    listeners.get('online')!();
    expect(FakeSocket.all).toHaveLength(1);
    await refuse(); // down; the retry waits 0.5 s
    listeners.get('visibilitychange')!(); // the phone is unlocked
    expect(FakeSocket.all).toHaveLength(2);
    listeners.get('online')!(); // still connecting: no second socket
    vi.advanceTimersByTime(10_000); // and the cancelled retry doesn't fire either
    expect(FakeSocket.all).toHaveLength(2);
    await refuse();
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    listeners.get('visibilitychange')!(); // went to the background: wait as usual
    expect(FakeSocket.all).toHaveLength(2);
    vi.advanceTimersByTime(500); // the backoff restarted at 0.5 s after the early try
    expect(FakeSocket.all).toHaveLength(3);
  });
});
