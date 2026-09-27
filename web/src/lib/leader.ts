import { useEffect, useRef, useState } from 'react';

/**
 * One control window in charge (1.3.4). Two control windows used to both publish their own
 * selection to the outputs (they fought) and both apply every remote command. Now they
 * elect a LEADER with the Web Locks API: each asks for one lock; the holder leads, the
 * others wait in the lock's queue — and when the leader closes or crashes the browser
 * hands the lock to the next one, no heartbeat needed. «Взяти керування» steals the lock:
 * the old leader's hold is broken and it goes back to waiting.
 *
 * Web Locks need a secure context (localhost / HTTPS) — the control window is local-only
 * anyway; without them a window simply leads (the old behaviour).
 */

export type LeaderState = 'leader' | 'standby';

/** The part of navigator.locks we use (a fake in tests). */
export interface Locks {
  request(
    name: string,
    options: { steal?: boolean; signal?: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<unknown>;
}

export const LEADER_LOCK = 'vo-control-leader';

export function createElection(locks: Locks | null, onChange: (s: LeaderState) => void) {
  let stopped = false;
  let queued: AbortController | null = null;
  let release: (() => void) | null = null;

  const set = (s: LeaderState) => {
    if (!stopped) onChange(s);
  };

  function wait(steal: boolean): void {
    if (stopped || !locks) return;
    const ctrl = steal ? null : new AbortController();
    queued = ctrl;
    locks
      .request(LEADER_LOCK, steal ? { steal: true } : { signal: ctrl!.signal }, () => {
        if (stopped) return Promise.resolve();
        queued = null;
        set('leader');
        // Hold it until we stop (or someone steals it — then this promise just never resolves).
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => {
        // Stolen (AbortError after grant) or our own abort before grant.
        if (stopped || (ctrl && ctrl.signal.aborted)) return;
        release = null;
        set('standby');
        wait(false); // back in the queue: lead again when the other window closes
      });
  }

  if (!locks) {
    onChange('leader');
  } else {
    onChange('standby');
    wait(false);
  }

  return {
    /** Lead now, taking over from whichever window leads. */
    takeOver(): void {
      if (!locks || stopped) return;
      queued?.abort(); // leave the queue first, or we'd be granted a second time later
      queued = null;
      wait(true);
    },
    stop(): void {
      stopped = true;
      queued?.abort();
      release?.();
    },
  };
}

const browserLocks = (): Locks | null =>
  typeof navigator !== 'undefined' && navigator.locks
    ? (navigator.locks as unknown as Locks)
    : null;

/** For the control window: am I the one in charge? */
export function useControlLeader(): { state: LeaderState; takeOver: () => void } {
  const [state, setState] = useState<LeaderState>(browserLocks() ? 'standby' : 'leader');
  const election = useRef<ReturnType<typeof createElection> | null>(null);
  useEffect(() => {
    const e = createElection(browserLocks(), setState);
    election.current = e;
    return () => e.stop();
  }, []);
  return { state, takeOver: () => election.current?.takeOver() };
}
