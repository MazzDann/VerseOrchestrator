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
  usePlaylist.setState({
    items: [],
    currentId: null,
    saved: [],
    cleared: null,
    deleted: null,
    replaced: null,
  });
  for (const t of ['Ів 3:16', 'Рим 12:1-2', 'Оголошення']) state().add(text(t));
  state().setCurrent(state().items[1].id);
});

describe('«Очистити показ» → «Скасувати» (0.9.0)', () => {
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

describe('«Видалити програму» → «Скасувати» (0.9.1)', () => {
  const names = () => state().saved.map((p) => p.name);

  beforeEach(() => {
    for (const n of ['Лекція', 'Зустріч', 'Вечір']) state().saveProgram(n); // newest first
  });

  it('puts the program back where it stood, with its items', () => {
    const before = state().saved;
    state().deleteProgram('Зустріч');
    expect(names()).toEqual(['Вечір', 'Лекція']);
    expect(state().deleted?.index).toBe(1);
    state().undoDelete();
    expect(state().saved).toEqual(before);
    expect(state().deleted).toBeNull();
  });

  it('only the last deletion can be undone', () => {
    state().deleteProgram('Зустріч');
    state().deleteProgram('Лекція');
    state().undoDelete();
    expect(names()).toEqual(['Вечір', 'Лекція']);
  });

  it('is forgotten once a program is saved', () => {
    state().deleteProgram('Зустріч');
    state().saveProgram('Нова');
    expect(state().deleted).toBeNull();
    state().undoDelete();
    expect(names()).toEqual(['Нова', 'Вечір', 'Лекція']);
  });

  it('is not saved: a reload offers no undo', () => {
    state().deleteProgram('Зустріч');
    const saved = JSON.parse(local.get('vo:playlist') ?? '{}');
    expect(saved.state).not.toHaveProperty('deleted');
    expect(saved.state.saved.map((p: { name: string }) => p.name)).toEqual(['Вечір', 'Лекція']);
  });
});

describe('opening a program → «Скасувати» (0.9.3)', () => {
  const labels = () => state().items.map((i) => i.label);

  beforeEach(() => {
    state().saveProgram('Зустріч'); // the three items of the outer beforeEach
    state().clear();
    state().add(text('Пс 23'));
    state().add(text('Мт 5:1-12'));
    state().setCurrent(state().items[0].id);
  });

  it('brings back the list the program replaced, with the one on screen', () => {
    const before = state().items;
    state().loadProgram('Зустріч');
    expect(labels()).toEqual(['Ів 3:16', 'Рим 12:1-2', 'Оголошення']);
    expect(state().replaced?.program).toBe('Зустріч');
    state().undoLoad();
    expect(state().items).toEqual(before);
    expect(state().currentId).toBe(before[0].id);
    expect(state().replaced).toBeNull();
  });

  it('an empty list loses nothing: no undo', () => {
    state().clear();
    state().loadProgram('Зустріч');
    expect(state().replaced).toBeNull();
  });

  it('is forgotten once the new list changes', () => {
    for (const change of [
      () => state().add(text('Ів 1:1')),
      () => state().removeItem(state().items[0].id),
      () => state().move(state().items[0].id, 1),
      () => state().reorder(0, 2),
      () => state().clear(),
    ]) {
      state().loadProgram('Зустріч');
      change();
      expect(state().replaced).toBeNull();
    }
  });

  it('stays while items are shown from it, and is not saved', () => {
    state().loadProgram('Зустріч');
    state().setCurrent(state().items[1].id);
    expect(state().replaced?.items).toHaveLength(2);
    const saved = JSON.parse(local.get('vo:playlist') ?? '{}');
    expect(saved.state).not.toHaveProperty('replaced');
  });
});

describe('a song whose id changed (0.10.0)', () => {
  it('the running order and the saved programs take the new id', () => {
    state().add({ kind: 'song', label: '№12 Слава', songId: 3, faithful: true });
    state().add({ kind: 'song', label: '№13 Інша', songId: 3, faithful: true });
    state().saveProgram('Зустріч');
    state().relinkSong(3, '№12 Слава', 9001);
    const ids = (list: { kind: string; songId?: number; label: string }[]) =>
      list.filter((i) => i.kind === 'song').map((i) => `${i.label}:${i.songId}`);
    expect(ids(state().items)).toEqual(['№12 Слава:9001', '№13 Інша:3']);
    expect(ids(state().saved[0].items)).toEqual(['№12 Слава:9001', '№13 Інша:3']);
  });
});

describe('an item of a newer version (1.9.1)', () => {
  const cover = {
    kind: 'later', // a kind no version knows yet (1.10 made «cover» a real one)
    id: 'c1',
    label: 'Ласкаво просимо',
    text: 'Ласкаво просимо',
    image: null,
  };
  const stored = (items: unknown[], saved: unknown[] = []) =>
    JSON.stringify({ state: { items, saved }, version: 1 });
  const load = async (value: string) => {
    local.set('vo:playlist', value);
    await usePlaylist.persist.rehydrate();
  };
  const [psalm, notice] = [text('Пс 23'), text('Оголошення')].map((t, i) => ({
    ...t,
    id: `t${i}`,
  }));

  it('is kept whole in the list and in the programs, and saved back as it came', async () => {
    await load(stored([psalm, cover, notice], [{ name: 'Неділя', items: [cover] }]));
    expect(state().items.map((it) => it.kind)).toEqual(['text', 'foreign', 'text']);
    expect(state().items[1]).toMatchObject({ id: 'c1', label: 'Ласкаво просимо' });
    expect(state().saved[0].items[0].kind).toBe('foreign');
    state().move('t0', 1); // any change writes the list
    const back = JSON.parse(local.get('vo:playlist')!).state;
    expect(back.items[0]).toEqual(cover);
    expect(back.saved[0].items[0]).toEqual(cover);
  });

  it('a program opened gives it a fresh id, the rest of it unchanged', async () => {
    await load(stored([], [{ name: 'Неділя', items: [cover, notice] }]));
    state().loadProgram('Неділя');
    const back = JSON.parse(local.get('vo:playlist')!).state.items[0];
    expect(back).toEqual({ ...cover, id: state().items[0].id });
    expect(back.id).not.toBe('c1');
  });

  it('a list saved under a later format version still loads; a program keeps its other fields', async () => {
    const program = { name: 'Неділя', items: [cover], startsAt: '10:00' };
    await load(JSON.stringify({ state: { items: [psalm, cover], saved: [program] }, version: 2 }));
    expect(state().items.map((it) => it.kind)).toEqual(['text', 'foreign']);
    state().move('t0', 1);
    const back = JSON.parse(local.get('vo:playlist')!).state;
    expect(back.items[0]).toEqual(cover);
    expect(back.saved[0]).toEqual(program);
  });

  it('what is not an item is dropped; a list missing keeps what there is', async () => {
    await load(stored([null, 7, 'x', [], psalm]));
    expect(state().items.map((it) => it.id)).toEqual(['t0']);
    await load(JSON.stringify({ state: {}, version: 1 }));
    expect(state().items.map((it) => it.id)).toEqual(['t0']);
  });

  it('steps pass over it; nothing to step to says so', async () => {
    const { stepIndex } = await import('./playlistStore');
    await load(stored([psalm, cover, notice]));
    const items = state().items;
    expect(stepIndex(items, 't0', 1)).toBe(2);
    expect(stepIndex(items, 't1', -1)).toBe(0);
    expect(stepIndex(items, 't1', 1)).toBeNull();
    expect(stepIndex(items, null, 1)).toBe(0);
    await load(stored([cover]));
    expect(stepIndex(state().items, null, 1)).toBeNull();
    expect(stepIndex(state().items, null, -1)).toBeNull();
  });
});

describe('«Відлік» / «Заставка» items from a hand-edited file (1.10.0-beta.3 review)', () => {
  it('get safe fields: words, a length, a zero, a picture or none', async () => {
    const { fromStored } = await import('./playlistStore');
    expect(fromStored({ kind: 'countdown', id: 'c', seconds: 'x', atZero: 'later' })).toMatchObject(
      {
        caption: '',
        label: '',
        seconds: 300,
        atZero: 'stop',
      },
    );
    expect(fromStored({ kind: 'cover', id: 'v', image: { src: 1 } })).toMatchObject({
      text: '',
      image: null,
    });
  });
});

describe('«Цикл оголошень» (1.10.0-beta.4)', () => {
  it('gathers texts where the first stood, takes one out after it, scatters back', () => {
    const ids = state().items.map((i) => i.id); // three texts from beforeEach
    state().gatherLoop([ids[2], ids[0]], 'Цикл');
    const loop = state().items[0];
    expect(state().items).toHaveLength(2);
    expect(loop.kind).toBe('loop');
    if (loop.kind !== 'loop') return;
    expect(loop.items.map((x) => x.id)).toEqual([ids[0], ids[2]]);
    state().takeOutOfLoop(loop.id, ids[0]);
    expect(state().items.map((i) => i.id)).toEqual([loop.id, ids[0], ids[1]]);
    state().scatterLoop(loop.id);
    expect(state().items.map((i) => i.id)).toEqual([ids[2], ids[0], ids[1]]);
  });

  it('a stored loop keeps only its slides, with a safe interval', async () => {
    const { fromStored } = await import('./playlistStore');
    const l = fromStored({
      kind: 'loop',
      id: 'l',
      every: 1,
      items: [
        { kind: 'text', id: 't', label: 'a', title: '', body: 'a' },
        { kind: 'song', id: 's' },
        5,
      ],
    });
    expect(l).toMatchObject({ every: 3, label: '' });
    expect(l?.kind === 'loop' && l.items.map((x) => x.id)).toEqual(['t']);
  });
});

describe('«Цикл» and the item on screen (1.10.0-beta.4 review)', () => {
  it('gathering the current item makes the loop current; an emptied current loop leaves none', () => {
    const ids = state().items.map((i) => i.id);
    state().setCurrent(ids[0]);
    state().gatherLoop([ids[0]], 'Цикл');
    const loop = state().items[0];
    expect(state().currentId).toBe(loop.id);
    state().takeOutOfLoop(loop.id, ids[0]);
    expect(state().currentId).toBeNull();
  });
});
