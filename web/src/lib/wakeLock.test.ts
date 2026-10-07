import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWakeLock, type WakeApi, type WakeDoc, type WakeSentinel } from './wakeLock';

/**
 * A page and a Screen Wake Lock with the browser's rules: a request on a hidden page is refused,
 * hiding the page releases every lock (each sentinel fires `release`), `release()` does too.
 */
function fakeBrowser(opts: { refuse?: boolean } = {}) {
  const listeners = new Set<() => void>();
  const sentinels: (WakeSentinel & { released: boolean })[] = [];
  let resolveNext: (() => void) | null = null;
  const doc: WakeDoc & { visibilityState: DocumentVisibilityState } = {
    visibilityState: 'visible',
    addEventListener: (_t, l) => void listeners.add(l),
    removeEventListener: (_t, l) => void listeners.delete(l),
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
  return {
    api,
    doc,
    listeners,
    setVisible,
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
});
