import { afterEach, describe, expect, it, vi } from 'vitest';

/** A localStorage of our own: the stores write to it, the watch reads it. */
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

describe('changes made while the server is awaited are stamped (1.12.5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('a kept change is stamped; a set that keeps nothing new is not (review)', async () => {
    const storage = memoryStorage();
    // zustand's persist writes to window.localStorage
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('window', { localStorage: storage, location: { hostname: 'localhost' } });
    const { watchLocalEdits } = await import('./uiState');
    const { usePlaylist } = await import('../playlistStore');
    const at = () =>
      JSON.parse(localStorage.getItem('vo:ui-state-at') ?? '{}') as Record<string, number>;
    usePlaylist.getState().add({ kind: 'text', title: 'Оголошення', text: 'Раз' } as never);
    watchLocalEdits();
    // the running order's current item isn't kept: no stamp
    usePlaylist.getState().setCurrent(usePlaylist.getState().items[0]?.id ?? null);
    await Promise.resolve();
    expect(at()['vo:playlist']).toBeUndefined();
    // a new item is kept: stamped
    usePlaylist.getState().add({ kind: 'text', title: 'Друге', text: 'Два' } as never);
    await Promise.resolve();
    expect(at()['vo:playlist']).toBeGreaterThan(0);
  });
});
