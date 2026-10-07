import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWakeLock, type WakeApi, type WakeDoc, type WakeSentinel } from './wakeLock';

/**
 * A page and a Screen Wake Lock with the browser's rules: a request on a hidden page is refused,
 * hiding the page releases every lock (each sentinel fires `release`), `release()` does too.
 */
function fakeBrowser(opts: { refuse?: boolean; needsGesture?: boolean } = {}) {
  const byType = new Map<string, Set<() => void>>();
  const on = (t: string) => byType.get(t) ?? byType.set(t, new Set()).get(t)!;
  const listeners = on('visibilitychange');
  const sentinels: (WakeSentinel & { released: boolean })[] = [];
  let resolveNext: (() => void) | null = null;
  // Safari: a request needs a click or a key just before it (transient activation)
  let gesture = false;
  const doc: WakeDoc & { visibilityState: DocumentVisibilityState } = {
    visibilityState: 'visible',
    addEventListener: (t, l) => void on(t).add(l),
    removeEventListener: (t, l) => void on(t).delete(l),
  };
  const makeSentinel = () => {
    const onRelease: (() => void)[] = [];
    const s = {
      released: false,
      release: async () => {
        if (s.released) return;
        s.released = true;
        onRelease.forEach((l) => l());
      },
      addEventListener: (_t: 'release', l: () => void) => void onRelease.push(l),
    };
    sentinels.push(s);
    return s;
  };
  let requests = 0;
  let hold = false;
  const api: WakeApi = {
    request: () => {
      requests++;
      if (opts.refuse) {
        return Promise.reject(
          Object.assign(new Error('Battery saver'), { name: 'NotAllowedError' }),
        );
      }
      if (doc.visibilityState !== 'visible') {
        return Promise.reject(Object.assign(new Error('hidden'), { name: 'NotAllowedError' }));
      }
      if (opts.needsGesture && !gesture) {
        return Promise.reject(
          Object.assign(new Error('requires user activation'), { name: 'NotAllowedError' }),
        );
      }
      if (!hold) return Promise.resolve(makeSentinel());
      return new Promise((resolve) => {
        resolveNext = () => resolve(makeSentinel());
      });
    },
  };
  const setVisible = (visible: boolean) => {
    doc.visibilityState = visible ? 'visible' : 'hidden';
    if (!visible) for (const s of sentinels) void s.release();
    for (const l of listeners) l();
  };
  /** A click (or a key) in the page: listeners run inside the gesture, as in a browser. */
  const gestureIn = (type: 'pointerdown' | 'keydown') => {
    gesture = true;
    for (const l of on(type)) l();
    gesture = false;
  };
  return {
    api,
    doc,
    listeners,
    setVisible,
    gestureIn,
    listening: (type: string) => on(type).size,
    /** Sentinels the browser has granted and not released yet. */
    live: () => sentinels.filter((s) => !s.released).length,
    requests: () => requests,
    /** Requests wait until `grant()` (a slow browser). */
    slow: () => {
      hold = true;
    },
    grant: () => resolveNext?.(),
  };
}

const settle = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('keeping the displays awake during a show (Mac check of 1.9.0)', () => {
  it('holds a lock while the page is visible', async () => {
    const b = fakeBrowser();
    const lock = createWakeLock(b);
    await lock.start();
    expect(lock.held()).toBe(true);
    expect(b.live()).toBe(1);
  });

  it('waits for a hidden page to show before asking', async () => {
    const b = fakeBrowser();
    b.doc.visibilityState = 'hidden';
    const lock = createWakeLock(b);
    await lock.start();
    expect(b.requests()).toBe(0);
    b.setVisible(true);
    await settle();
    expect(lock.held()).toBe(true);
  });

  it('asks again after the browser lets it go on hide → show', async () => {
    const b = fakeBrowser();
    const lock = createWakeLock(b);
    await lock.start();
    b.setVisible(false);
    await settle();
    expect(lock.held()).toBe(false);
    expect(b.requests()).toBe(1); // no request while hidden
    b.setVisible(true);
    await settle();
    expect(lock.held()).toBe(true);
    expect(b.requests()).toBe(2);
    expect(b.live()).toBe(1);
  });

  it('lets it go on stop and stops listening', async () => {
    const b = fakeBrowser();
    const lock = createWakeLock(b);
    await lock.start();
    lock.stop();
    await settle();
    expect(lock.held()).toBe(false);
    expect(b.live()).toBe(0);
    expect(b.listeners.size).toBe(0);
    b.setVisible(false);
    b.setVisible(true);
    await settle();
    expect(b.requests()).toBe(1);
  });

  it('never holds two sentinels — repeated shows and starts while a request is out', async () => {
    const b = fakeBrowser();
    b.slow();
    const lock = createWakeLock(b);
    void lock.start();
    void lock.start();
    b.setVisible(true);
    b.setVisible(true);
    expect(b.requests()).toBe(1);
    b.grant();
    await settle();
    b.setVisible(true);
    await lock.start();
    expect(b.requests()).toBe(1);
    expect(b.live()).toBe(1);
    expect(b.listeners.size).toBe(1);
  });

  it('a lock granted after stop is let go at once', async () => {
    const b = fakeBrowser();
    b.slow();
    const lock = createWakeLock(b);
    void lock.start();
    lock.stop();
    b.grant();
    await settle();
    expect(lock.held()).toBe(false);
    expect(b.live()).toBe(0);
  });

  it('no API (Firefox < 126, Safari < 16.4, plain http): nothing happens, nothing throws', async () => {
    const lock = createWakeLock({ api: undefined, doc: fakeBrowser().doc });
    await expect(lock.start()).resolves.toBeUndefined();
    expect(lock.held()).toBe(false);
    expect(() => lock.stop()).not.toThrow();
  });

  it('a refusal (battery saver) or a throwing browser: quietly no lock, and one try per show', async () => {
    const b = fakeBrowser({ refuse: true });
    const lock = createWakeLock(b);
    await expect(lock.start()).resolves.toBeUndefined();
    expect(lock.held()).toBe(false);
    expect(console.debug).toHaveBeenCalledTimes(1);
    await settle();
    expect(b.requests()).toBe(1); // no retry loop
    b.setVisible(false);
    b.setVisible(true);
    await settle();
    expect(b.requests()).toBe(2);

    const throwing: WakeApi = {
      request: () => {
        throw new TypeError('wakeLock.request is not a function');
      },
    };
    const lock2 = createWakeLock({ api: throwing, doc: b.doc });
    await expect(lock2.start()).resolves.toBeUndefined();
    expect(lock2.held()).toBe(false);
  });

  it('Safari: refused without a gesture — the next click or key in «Показ» asks again and holds it', async () => {
    const b = fakeBrowser({ needsGesture: true });
    const lock = createWakeLock(b);
    await lock.start();
    expect(lock.held()).toBe(false);
    expect(b.requests()).toBe(1);
    b.gestureIn('pointerdown');
    await settle();
    expect(lock.held()).toBe(true);
    expect(b.requests()).toBe(2);
    // held: keys and clicks (F for full screen, Esc) ask nothing more
    b.gestureIn('keydown');
    b.gestureIn('pointerdown');
    await settle();
    expect(b.requests()).toBe(2);
    expect(b.live()).toBe(1);
    // let go on hide; on show it is refused again (no gesture) — a key brings it back
    b.setVisible(false);
    b.setVisible(true);
    await settle();
    expect(lock.held()).toBe(false);
    b.gestureIn('keydown');
    await settle();
    expect(lock.held()).toBe(true);
    expect(b.live()).toBe(1);
  });

  it('a gesture never asks when nothing was refused, and stop() stops listening to gestures', async () => {
    const b = fakeBrowser();
    const lock = createWakeLock(b);
    await lock.start();
    b.gestureIn('keydown');
    await settle();
    expect(b.requests()).toBe(1);
    lock.stop();
    expect(b.listening('pointerdown')).toBe(0);
    expect(b.listening('keydown')).toBe(0);
    const refused = fakeBrowser({ refuse: true });
    const lock2 = createWakeLock(refused);
    await lock2.start();
    lock2.stop();
    refused.gestureIn('pointerdown');
    await settle();
    expect(refused.requests()).toBe(1);
  });
});
