import { describe, expect, it } from 'vitest';
import { createElection, type LeaderState, type Locks } from './leader';

/**
 * A lock manager with Web Locks semantics for one exclusive lock: a free lock is granted,
 * others queue (a signal can withdraw a queued request); `steal` breaks the current hold
 * (its request rejects with AbortError) and is granted at once; when the holder's callback
 * promise settles, the next queued request is granted.
 */
function fakeLocks(): Locks & { requests: string[] } {
  type Entry = {
    cb: () => Promise<void>;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  };
  let holder: Entry | null = null;
  const queue: Entry[] = [];
  const abort = () => Object.assign(new Error('aborted'), { name: 'AbortError' });
  const grant = (e: Entry) => {
    holder = e;
    void e.cb().then(() => {
      if (holder !== e) return; // stolen meanwhile
      holder = null;
      e.resolve(undefined);
      const n = queue.shift();
      if (n) grant(n);
    });
  };
  const requests: string[] = [];
  return {
    requests,
    query: async () => ({ held: holder ? [{ name: 'vo-control-leader' }] : [] }),
    request(_name, options, cb) {
      requests.push(options.steal ? 'steal' : 'wait');
      return new Promise((resolve, reject) => {
        const e: Entry = { cb, resolve, reject };
        if (options.steal) {
          if (holder) holder.reject(abort());
          grant(e);
        } else if (!holder) grant(e);
        else {
          queue.push(e);
          options.signal?.addEventListener('abort', () => {
            const i = queue.indexOf(e);
            if (i >= 0) {
              queue.splice(i, 1);
              reject(abort());
            }
          });
        }
      });
    },
  };
}

const tick = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('control window leader election', () => {
  it('the first window leads, the second waits and takes over when the first closes', async () => {
    const locks = fakeLocks();
    const a: LeaderState[] = [];
    const b: LeaderState[] = [];
    const first = createElection(locks, (s) => a.push(s));
    await tick();
    const second = createElection(locks, (s) => b.push(s));
    await tick();
    expect(a.at(-1)).toBe('leader');
    expect(b.at(-1)).toBe('standby');
    first.stop(); // the leading window closed
    await tick();
    expect(b.at(-1)).toBe('leader');
    second.stop();
  });

  it('«Взяти керування» swaps the roles, and the old leader waits to lead again', async () => {
    const locks = fakeLocks();
    let a: LeaderState = 'standby';
    let b: LeaderState = 'standby';
    const first = createElection(locks, (s) => (a = s));
    await tick();
    const second = createElection(locks, (s) => (b = s));
    await tick();
    second.takeOver();
    await tick();
    expect([a, b]).toEqual(['standby', 'leader']);
    second.stop(); // the new leader closes → the first one leads again
    await tick();
    expect(a).toBe('leader');
    first.stop();
  });

  it('taking over does not leave a second request in the queue', async () => {
    const locks = fakeLocks();
    let a: LeaderState = 'standby';
    let b: LeaderState = 'standby';
    const first = createElection(locks, (s) => (a = s));
    await tick();
    const second = createElection(locks, (s) => (b = s));
    await tick();
    second.takeOver();
    await tick();
    first.takeOver(); // and back
    await tick();
    expect([a, b]).toEqual(['leader', 'standby']);
    first.stop();
    await tick();
    expect(b).toBe('leader'); // granted once from the queue, not twice
    second.stop();
  });

  it('«Взяти керування» in the window that leads already changes nothing', async () => {
    const locks = fakeLocks();
    const states: LeaderState[] = [];
    const only = createElection(locks, (s) => states.push(s));
    await tick();
    only.takeOver(); // e.g. a handover answered just as the window's own lock came
    await tick();
    expect(states).toEqual(['standby', 'leader']); // no leader → standby → leader flip
    expect(locks.requests).toEqual(['wait']); // nothing stolen from itself
    only.stop();
  });

  it('a handover claims the lock only from another window holding it', async () => {
    // a fresh browser: nobody else holds it — the window's own request is enough
    const fresh = fakeLocks();
    const queued = fakeLocks();
    let s: LeaderState = 'standby';
    const alone = createElection(fresh, (x) => (s = x));
    await alone.claim();
    await tick();
    expect(s).toBe('leader');
    expect(fresh.requests).toEqual(['wait']);
    alone.stop();
    // another window of this browser leads: take over from it
    let a: LeaderState = 'standby';
    let b: LeaderState = 'standby';
    const first = createElection(queued, (x) => (a = x));
    await tick();
    const second = createElection(queued, (x) => (b = x));
    await tick();
    await second.claim();
    await tick();
    expect([a, b]).toEqual(['standby', 'leader']);
    expect(queued.requests).toEqual(['wait', 'wait', 'steal', 'wait']); // the first one queues again
    second.stop();
    await tick();
    expect(a).toBe('leader');
    first.stop();
  });

  it('a claim without Locks.query takes over as «Взяти керування» does', async () => {
    const locks = fakeLocks();
    const noQuery: Locks = { request: locks.request };
    let a: LeaderState = 'standby';
    let b: LeaderState = 'standby';
    const first = createElection(noQuery, (x) => (a = x));
    await tick();
    const second = createElection(noQuery, (x) => (b = x));
    await tick();
    await second.claim();
    await tick();
    expect([a, b]).toEqual(['standby', 'leader']);
    first.stop();
    second.stop();
  });

  it('without Web Locks a window simply leads', () => {
    const states: LeaderState[] = [];
    createElection(null, (s) => states.push(s));
    expect(states).toEqual(['leader']);
  });
});
