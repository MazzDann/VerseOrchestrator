/**
 * Windows «Peek» and the output windows (F1005-05): a pointer resting on a taskbar thumbnail hides
 * every other window on every screen — the projector showed the desktop. The server keeps the
 * output windows out of it (server/src/peekGuard.ts), finding their browser windows by the titles
 * lib/outputs.ts gives them; an output window asks after it opens, moves, resizes or changes full
 * screen (a tab dragged out is a new window of the browser), at most once per `delayMs` of quiet:
 * a window dragged across a screen asks once, when it stops.
 */
export interface PeekGuardPoke {
  /** something changed: ask (after a quiet moment) */
  poke(): void;
  /** the window goes away: ask no more */
  stop(): void;
}

type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (t: unknown) => void;
};

const browserTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
};

/** The app's own request — loaded when first needed, so a page that never asks never loads it. */
const askServer = (): Promise<void> => import('../api').then(({ api }) => api.peekGuard());

export function createPeekGuardPoke(
  request: () => Promise<void> = askServer,
  delayMs = 800,
  timers: Timers = browserTimers,
): PeekGuardPoke {
  let timer: unknown = null;
  let stopped = false;
  return {
    poke() {
      if (stopped) return;
      if (timer !== null) timers.clear(timer);
      timer = timers.set(() => {
        timer = null;
        void request().catch(() => {
          /* best-effort: the server may be older or absent */
        });
      }, delayMs);
    },
    stop() {
      stopped = true;
      if (timer !== null) timers.clear(timer);
      timer = null;
    },
  };
}
