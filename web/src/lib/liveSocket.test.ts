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

  it('a hello given as a function is asked at every connect (a handover token goes once)', async () => {
    let n = 0;
    connectLive({ hello: () => ({ role: 'control', ...(n++ === 0 ? { handover: 'tok' } : {}) }) });
    FakeSocket.all[0].accept();
    expect(FakeSocket.all[0].sent).toEqual([
      JSON.stringify({ type: 'hello', role: 'control', handover: 'tok' }),
    ]);
    await refuse();
    vi.advanceTimersByTime(500);
    FakeSocket.all[1].accept();
    expect(FakeSocket.all[1].sent).toEqual([JSON.stringify({ type: 'hello', role: 'control' })]);
  });

  it('a stopped connection says nothing more (0.6.25)', async () => {
    const status: boolean[] = [];
    const c = connectLive({ hello: { role: 'control' }, onStatus: (open) => status.push(open) });
    FakeSocket.all[0].accept();
    c.stop();
    await Promise.resolve();
    vi.advanceTimersByTime(20_000);
    expect(status).toEqual([true]); // no «lost» after stop — the Mac test's stuck warning
    expect(FakeSocket.all).toHaveLength(1); // and no reconnect
  });

  it('retries at most every 2 s and reports the loss once (0.6.29)', async () => {
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
    // four refused retries, one «down»: the control window's 0.6.25 warning timer isn't
    // restarted by each of them (with 2 s retries it would never run out)
    expect(status).toEqual([true, false]);
    vi.advanceTimersByTime(2000);
    FakeSocket.all.at(-1)!.accept();
    expect(status).toEqual([true, false, true]);
  });

  it('back on screen or online: tries at once, but never beside a live connect (0.6.29)', async () => {
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

  it('the app was updated under the page: reloads into the new version, once (1.0.0)', () => {
    const reload = vi.fn();
    const store = new Map<string, string>();
    vi.stubGlobal('__APP_VERSION__', '1.0.0');
    vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:5173', reload });
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    const live = connectLive({});
    const ws = FakeSocket.all.at(-1)!;
    ws.accept();
    const frame = (f: object) => ws.onmessage?.({ data: JSON.stringify(f) });
    frame({ type: 'app', version: '1.0.0' });
    expect(reload).not.toHaveBeenCalled();
    frame({ type: 'app', version: '1.0.1' });
    expect(reload).toHaveBeenCalledTimes(1);
    frame({ type: 'app', version: '1.0.1' }); // the reload brought the old page back: stay
    expect(reload).toHaveBeenCalledTimes(1);
    live.stop();
  });

  it('a copy of the repository restarted with new code: reloads into the new build, once (1.6.0)', () => {
    const reload = vi.fn();
    const store = new Map<string, string>();
    vi.stubGlobal('__APP_VERSION__', '1.5.0');
    vi.stubGlobal('__APP_BUILD__', '1.5.0+aaa');
    vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:4747', reload });
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    });
    const live = connectLive({});
    const ws = FakeSocket.all.at(-1)!;
    ws.accept();
    const frame = (f: object) => ws.onmessage?.({ data: JSON.stringify(f) });
    frame({ type: 'app', version: '1.5.0', build: '1.5.0+aaa' });
    frame({ type: 'app', version: '1.5.0' }); // a server that sends no build (npm run dev)
    expect(reload).not.toHaveBeenCalled();
    frame({ type: 'app', version: '1.5.0', build: '1.5.0+bbb' });
    expect(reload).toHaveBeenCalledTimes(1);
    frame({ type: 'app', version: '1.5.0', build: '1.5.0+bbb' }); // the same old page came back
    expect(reload).toHaveBeenCalledTimes(1);
    live.stop();
  });
});
