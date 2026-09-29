import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browserDataBytes, clearBrowserData, listenForForget } from './browserData';

/** A Storage-like map (the part the app uses). */
function fakeStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    clear: () => m.clear(),
    map: m,
  };
}

/** BroadcastChannel between the "windows" of one test. */
class FakeChannel {
  static all: FakeChannel[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(public name: string) {
    FakeChannel.all.push(this);
  }
  postMessage(data: unknown) {
    for (const c of FakeChannel.all)
      if (c !== this && c.name === this.name) c.onmessage?.({ data });
  }
  close() {}
}

let local: ReturnType<typeof fakeStorage>;
const deletedCaches: string[] = [];
const deletedDbs: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  FakeChannel.all = [];
  deletedCaches.length = 0;
  deletedDbs.length = 0;
  local = fakeStorage({ 'vo:settings': '{"state":{}}', 'vo:playlist': '[]' });
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', fakeStorage({ tab: '1' }));
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  vi.stubGlobal('Storage', class {});
  vi.stubGlobal('navigator', { storage: { estimate: async () => ({ usage: 1_000_000 }) } });
  vi.stubGlobal('caches', {
    keys: async () => ['vo-segments-v1', 'vo-segments-v2'],
    delete: async (k: string) => void deletedCaches.push(k),
  });
  vi.stubGlobal('indexedDB', {
    databases: async () => [{ name: '/pglite/vo' }, { name: undefined }],
    deleteDatabase: (name: string) => {
      deletedDbs.push(name);
      const r: { onblocked?: () => void } = {};
      // the PGlite worker still holds it open: the deletion waits for the page to close
      queueMicrotask(() => r.onblocked?.());
      return r;
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('browser data («Вимкнути повністю», 0.7.1)', () => {
  it('says roughly how much this address keeps', async () => {
    const localBytes = ('vo:settings{"state":{}}'.length + 'vo:playlist[]'.length) * 2;
    expect(await browserDataBytes()).toBe(1_000_000 + localBytes);
  });

  it('forgets it all, and the other windows stop writing it back', async () => {
    listenForForget(); // "another window" of the same address
    const other = FakeChannel.all[0];
    let stoppedThere = false;
    other.onmessage = () => {
      stoppedThere = true;
    };
    await clearBrowserData();
    expect(stoppedThere).toBe(true);
    expect(local.map.size).toBe(0);
    expect(deletedCaches).toEqual(['vo-segments-v1', 'vo-segments-v2']);
    expect(deletedDbs).toEqual(['/pglite/vo']); // a blocked deletion doesn't hang the shutdown
    // a store in this window re-saving afterwards writes nothing
    (
      Storage as unknown as { prototype: { setItem: (k: string, v: string) => void } }
    ).prototype.setItem('vo:settings', '{}');
    local.setItem('late', 'write from a window that had not heard yet');
    vi.advanceTimersByTime(500);
    expect(local.map.size).toBe(0);
  });
});
