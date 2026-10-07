import { useEffect } from 'react';

/**
 * Keep the displays awake while a show is on (Mac check of 1.9.0): nothing did, so one verse on
 * screen longer than the computer's display-sleep time and the projector fed by «Показ» went dark
 * mid-show (on a Mac on battery, after a few minutes). An open, visible output window holds a
 * Screen Wake Lock (`navigator.wakeLock.request('screen')`).
 *
 * The browser lets the lock go whenever the page is hidden (minimised, another tab, covered on
 * Windows), so the page asks again each time it is visible. No API (Firefox < 126, Safari < 16.4,
 * plain http on a LAN IP — a secure-context API) or a refusal (battery saver, NotAllowedError):
 * nothing happens on the wall, the displays just follow the system's own settings as before.
 */

/** The part of `WakeLockSentinel` used here (a fake one in tests). */
export interface WakeSentinel {
  readonly released?: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

export interface WakeApi {
  request(type: 'screen'): Promise<WakeSentinel>;
}

export interface WakeDoc {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface WakeLockController {
  /** Hold the lock from now on: asks while the page is visible, again after each hide → show. */
  start(): Promise<void>;
  /** Let it go and stop asking. */
  stop(): void;
  /** A lock is held now. */
  held(): boolean;
}

export function createWakeLock({
  api,
  doc,
}: {
  api: WakeApi | undefined;
  doc: WakeDoc;
}): WakeLockController {
  let active = false;
  let sentinel: WakeSentinel | null = null;
  let pending: Promise<void> | null = null;

  const holding = () => !!sentinel && !sentinel.released;

  const acquire = (): Promise<void> => {
    if (!active || !api || doc.visibilityState !== 'visible') return Promise.resolve();
    if (pending) return pending; // one request at a time — never two sentinels
    if (holding()) return Promise.resolve();
    sentinel = null;
    // The constructor turns a throw into a rejection: whatever the browser does, the wall stays.
    pending = new Promise<WakeSentinel>((resolve) => resolve(api.request('screen')))
      .then(
        (s) => {
          if (!active) {
            void s.release().catch(() => undefined); // stopped while asking
            return;
          }
          sentinel = s;
          s.addEventListener('release', () => {
            if (sentinel === s) sentinel = null;
          });
        },
        (err: unknown) => console.debug('[wake lock] not granted:', err),
      )
      .finally(() => {
        pending = null;
      });
    return pending;
  };

  const onVisibility = () => void acquire();

  return {
    start() {
      if (!active) {
        active = true;
        doc.addEventListener('visibilitychange', onVisibility);
      }
      return acquire();
    },
    stop() {
      active = false;
      doc.removeEventListener('visibilitychange', onVisibility);
      const s = sentinel;
      sentinel = null;
      s?.release().catch(() => undefined);
    },
    held: holding,
  };
}

/** Keep the displays awake while this page is open and `active` (an output window: a show). */
export function useWakeLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    const api: WakeApi | undefined = 'wakeLock' in navigator ? navigator.wakeLock : undefined;
    const lock = createWakeLock({ api, doc: document });
    void lock.start();
    return () => lock.stop();
  }, [active]);
}
