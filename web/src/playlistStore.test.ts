import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewSeqItem, usePlaylist as UsePlaylist } from './playlistStore';

// The store takes `window.localStorage` as it is created, on import: stub it first.
const local = new Map<string, string>();
let usePlaylist: typeof UsePlaylist;

beforeAll(async () => {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => void local.set(k, v),
      removeItem: (k: string) => void local.delete(k),
    },
  });
  ({ usePlaylist } = await import('./playlistStore'));
});

const text = (title: string): NewSeqItem => ({ kind: 'text', label: title, title, body: title });
const state = () => usePlaylist.getState();

beforeEach(() => {
  usePlaylist.setState({ items: [], currentId: null, saved: [], cleared: null });
  for (const t of ['Ів 3:16', 'Рим 12:1-2', 'Оголошення']) state().add(text(t));
  state().setCurrent(state().items[1].id);
});

describe('«Очистити показ» → «Скасувати» (1.8.0)', () => {
  it('brings back the same items, in order, with the one on screen', () => {
    const before = state().items;
    state().clear();
    expect(state().items).toEqual([]);
    expect(state().cleared?.items).toHaveLength(3);
    state().undoClear();
    expect(state().items).toEqual(before);
    expect(state().currentId).toBe(before[1].id);
    expect(state().cleared).toBeNull();
  });

  it('is forgotten once something new goes in', () => {
    state().clear();
    state().add(text('Пс 23'));
    expect(state().cleared).toBeNull();
    state().undoClear();
    expect(state().items.map((i) => i.label)).toEqual(['Пс 23']);
  });

  it('is forgotten when a program opens', () => {
    state().saveProgram('Зустріч');
    state().clear();
    state().loadProgram('Зустріч');
    expect(state().cleared).toBeNull();
    expect(state().items).toHaveLength(3);
  });

  it('an empty list clears nothing and keeps the earlier undo', () => {
    state().clear();
    state().clear();
    expect(state().cleared?.items).toHaveLength(3);
  });

  it('is not saved: a reload offers no undo', () => {
    state().clear();
    const saved = JSON.parse(local.get('vo:playlist') ?? '{}');
    expect(saved.state).not.toHaveProperty('cleared');
    expect(saved.state.items).toEqual([]);
  });
});
