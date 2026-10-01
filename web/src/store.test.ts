import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { useStore as UseStore } from './store';

// The store persists to `window.localStorage` from the moment it is created: stub it first.
const local = new Map<string, string>();
let useStore: typeof UseStore;

beforeAll(async () => {
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => void local.set(k, v),
      removeItem: (k: string) => void local.delete(k),
    },
  });
  ({ useStore } = await import('./store'));
});

const state = () => useStore.getState();

beforeEach(() => {
  useStore.setState({
    selectedTranslationIds: [1],
    bookNumber: null,
    chapter: null,
    selectedVerses: [],
    live: false,
  });
});

describe('openBook (a book picked in the control window)', () => {
  it('opens the book at its first chapter with nothing selected', () => {
    state().openBook(710); // 3 John
    expect(state()).toMatchObject({ bookNumber: 710, chapter: 1, selectedVerses: [] });
  });

  it('leaves the verse on screen alone: nothing selected, live-follow has nothing to push', () => {
    useStore.setState({ bookNumber: 500, chapter: 3, selectedVerses: [16], live: true });
    state().openBook(10);
    expect(state()).toMatchObject({ bookNumber: 10, chapter: 1, selectedVerses: [], live: false });
  });

  it('keeps the open book where it is: its chapter and selection', () => {
    useStore.setState({ bookNumber: 500, chapter: 5, selectedVerses: [2, 3], live: true });
    const before = state();
    state().openBook(500, [1, 2, 3, 4, 5]);
    expect(state()).toBe(before);
  });

  it('opens at the first chapter of a loaded list', () => {
    state().openBook(10, [2, 3]);
    expect(state().chapter).toBe(2);
  });

  it('selectBook still leaves the chapter to the caller (jumps, the running order)', () => {
    useStore.setState({ bookNumber: 500, chapter: 5 });
    state().selectBook(10);
    expect(state()).toMatchObject({ bookNumber: 10, chapter: null });
  });
});
