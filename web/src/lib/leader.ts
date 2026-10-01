import { useEffect, useRef, useState } from 'react';

/**
 * One control window in charge (0.4.4). Two control windows used to both publish their own
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
  /** Who holds what (Web Locks' `query`); absent in an older browser */
  query?(): Promise<{ held?: readonly { name?: string }[] }>;
}

export const LEADER_LOCK = 'vo-control-leader';

export function createElection(locks: Locks | null, onChange: (s: LeaderState) => void) {
  let stopped = false;
  let queued: AbortController | null = null;
  let release: (() => void) | null = null;
  /** Which of this window's requests holds the lock now (0: none) — one hold at a time. */
  let holding = 0;
  let requests = 0;

  const set = (s: LeaderState) => {
    if (!stopped) onChange(s);
  };

  function wait(steal: boolean): void {
    if (stopped || !locks) return;
    const id = ++requests;
    const ctrl = steal ? null : new AbortController();
    queued = ctrl;
    locks
      .request(LEADER_LOCK, steal ? { steal: true } : { signal: ctrl!.signal }, () => {
        if (stopped) return Promise.resolve();
        // a request of ours still in the queue would be granted a second time later
        if (queued !== ctrl) queued?.abort();
        queued = null;
        holding = id;
        set('leader');
        // Hold it until we stop (or someone steals it — then this promise just never resolves).
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      })
      .catch(() => {
        // Stolen (AbortError after grant) or our own abort before grant.
        if (holding === id) {
          holding = 0;
          release = null;
        }
        if (stopped || (ctrl && ctrl.signal.aborted)) return;
        // stolen by this window's own later request: it leads, nothing to wait for
        if (holding !== 0) return;
        set('standby');
        wait(false); // back in the queue: lead again when the other window closes
      });
  }

  /** Lead now, taking over from whichever window leads; nothing while this one holds the lock. */
  function takeOver(): void {
    if (!locks || stopped || holding !== 0) return;
    queued?.abort(); // leave the queue first, or we'd be granted a second time later
    queued = null;
    wait(true);
  }

  if (!locks) {
    onChange('leader');
  } else {
    onChange('standby');
    wait(false);
  }

  return {
    takeOver,
    /**
     * Lead for a handover (lib/handover.ts): take over only when another window of this browser
     * holds the lock. A free lock is this window's own request's to take — stealing it could
     * break this window's own hold as it comes (leader → standby → leader). Without `query`, as
     * «Взяти керування».
     */
    async claim(): Promise<void> {
      if (!locks || stopped || holding !== 0) return;
      let held = true;
      if (locks.query) {
        try {
          const state = await locks.query();
          held = (state.held ?? []).some((l) => l.name === LEADER_LOCK);
        } catch {
          /* can't tell: as «Взяти керування» */
        }
      }
      if (held) takeOver();
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
export function useControlLeader(): {
  state: LeaderState;
  takeOver: () => void;
  claim: () => Promise<void>;
} {
  const [state, setState] = useState<LeaderState>(browserLocks() ? 'standby' : 'leader');
  const election = useRef<ReturnType<typeof createElection> | null>(null);
  useEffect(() => {
    const e = createElection(browserLocks(), setState);
    election.current = e;
    return () => e.stop();
  }, []);
  return {
    state,
    takeOver: () => election.current?.takeOver(),
    claim: async () => election.current?.claim(),
  };
}
