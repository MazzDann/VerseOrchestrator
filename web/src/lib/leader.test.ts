import { describe, expect, it } from 'vitest';
import { createElection, type LeaderState, type Locks } from './leader';

/**
 * A lock manager with Web Locks semantics for one exclusive lock: a free lock is granted,
 * others queue (a signal can withdraw a queued request); `steal` breaks the current hold
 * (its request rejects with AbortError) and is granted at once; when the holder's callback
 * promise settles, the next queued request is granted.
 */
function fakeLocks(): Locks {
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
  return {
    request(_name, options, cb) {
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

  it('without Web Locks a window simply leads', () => {
    const states: LeaderState[] = [];
    createElection(null, (s) => states.push(s));
    expect(states).toEqual(['leader']);
  });
});
