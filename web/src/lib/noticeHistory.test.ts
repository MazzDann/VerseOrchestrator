import { createElement, Fragment } from 'react';
import { describe, expect, it } from 'vitest';
import {
  createNotificationsStore,
  hideNotification,
  showNotification,
  updateNotification,
} from '@mantine/notifications';
import {
  NOTICE_HISTORY_MAX,
  createNoticeHistory,
  createNoticeRecorder,
  noticeInput,
  noticeText,
  unseenCount,
  type NoticeStorage,
} from './noticeHistory';

const h = createElement;

/** sessionStorage's stand-in: a Map behind getItem / setItem. */
function memory(): NoticeStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

/** A storage that refuses everything (Safari private mode, a full quota, blocked site data). */
const refusing: NoticeStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

const fresh = () => createNoticeHistory(() => memory());

describe('noticeText: a notice’s words, never its elements', () => {
  it('keeps a string and a number as they are', () => {
    expect(noticeText('Збережено')).toBe('Збережено');
    expect(noticeText(42)).toBe('42');
    expect(noticeText(0)).toBe('0');
  });

  it('says nothing for null, undefined, booleans and render functions', () => {
    expect(noticeText(null)).toBe('');
    expect(noticeText(undefined)).toBe('');
    expect(noticeText(true)).toBe('');
    expect(noticeText(false)).toBe('');
    const renderProp = (() => 'x') as unknown as string;
    expect(noticeText(h('div', null, renderProp))).toBe('');
    expect(noticeText(['a', null, false, undefined, 'b'])).toBe('ab');
  });

  it('walks nested elements and arrays', () => {
    const node = h('div', null, [
      'Файл ',
      h('b', { key: 1 }, ['пісні', '.pptx']),
      ' — ',
      h('span', { key: 2 }, h('i', null, 3), ' строфи'),
    ]);
    expect(noticeText(node)).toBe('Файл пісні.pptx — 3 строфи');
  });

  it('keeps a button’s label as text, a space between side-by-side elements', () => {
    // the «Екран очищено» notice (useScreenSwitches): a line and its «Повернути» button
    const node = h(
      'div',
      { role: 'group' },
      h('p', null, 'Екран очищено · Ctrl+Z повертає'),
      h('button', { onClick: () => {} }, 'Повернути'),
    );
    expect(noticeText(node)).toBe('Екран очищено · Ctrl+Z повертає Повернути');
  });

  it('reads trx’s fragments inline, closes up spaces, starts a line at <br>', () => {
    const trx = [
      h(Fragment, { key: 0 }, 'Додайте модуль '),
      h(Fragment, { key: 1 }, h('code', null, 'KJV')),
      h(Fragment, { key: 2 }, '.'),
    ];
    expect(noticeText(trx)).toBe('Додайте модуль KJV.');
    expect(noticeText(h('div', null, '  Рядок   один ', h('br'), ' рядок два  '))).toBe(
      'Рядок один\nрядок два',
    );
  });

  it('takes from Mantine’s notice its id, colour, title and words', () => {
    expect(
      noticeInput({ id: 'a', message: h('span', null, 'Готово'), color: 'green', title: 'Т' }),
    ).toEqual({ id: 'a', color: 'green', title: 'Т', text: 'Готово' });
    expect(noticeInput({ id: 'b', message: 'Так', color: '' })).toEqual({
      id: 'b',
      color: undefined,
      title: undefined,
      text: 'Так',
    });
    expect(noticeInput({ message: 'без id' })).toBeNull();
  });
});

describe('the notices’ history', () => {
  it('keeps the newest first', () => {
    const history = fresh();
    history.getState().record({ id: 'a', text: 'Перше' }, 1000);
    history.getState().record({ id: 'b', text: 'Друге', color: 'red' }, 2000);
    expect(history.getState().entries.map((e) => [e.id, e.text, e.at, e.color])).toEqual([
      ['b', 'Друге', 2000, 'red'],
      ['a', 'Перше', 1000, undefined],
    ]);
  });

  it('an update under the same id changes that entry, not a new one', () => {
    const history = fresh();
    history.getState().record({ id: 'load', text: 'Завантажую…', color: 'gray' }, 1000);
    history.getState().record({ id: 'other', text: 'Інше' }, 1500);
    history.getState().update({ id: 'load', text: 'Готово', color: 'green' }, 2000);
    const { entries } = history.getState();
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ id: 'load', text: 'Готово', color: 'green', at: 1000 });
  });

  it('an update of an entry already cleared away is a new entry', () => {
    const history = fresh();
    history.getState().record({ id: 'x', text: 'Зберігаю…' });
    history.getState().clear();
    history.getState().update({ id: 'x', text: 'Збережено' });
    expect(history.getState().entries.map((e) => e.text)).toEqual(['Збережено']);
  });

  it('ignores a notice without words', () => {
    const history = fresh();
    history.getState().record({ id: 'x', text: '' });
    expect(history.getState().entries).toEqual([]);
  });

  it(`keeps the last ${NOTICE_HISTORY_MAX}`, () => {
    const history = fresh();
    for (let i = 1; i <= NOTICE_HISTORY_MAX + 5; i++)
      history.getState().record({ id: `n${i}`, text: `Сповіщення ${i}` });
    const { entries } = history.getState();
    expect(entries).toHaveLength(NOTICE_HISTORY_MAX);
    expect(entries[0].text).toBe(`Сповіщення ${NOTICE_HISTORY_MAX + 5}`);
    expect(entries[entries.length - 1].text).toBe('Сповіщення 6');
  });

  it('counts what is new since the list was last opened', () => {
    const history = fresh();
    history.getState().record({ id: 'a', text: 'А' });
    history.getState().record({ id: 'b', text: 'Б' });
    expect(unseenCount(history.getState())).toBe(2);
    history.getState().markSeen();
    expect(unseenCount(history.getState())).toBe(0);
    history.getState().record({ id: 'c', text: 'В' });
    expect(unseenCount(history.getState())).toBe(1);
    // a seen notice that changes is new again
    history.getState().markSeen();
    history.getState().update({ id: 'a', text: 'А — готово' });
    expect(unseenCount(history.getState())).toBe(1);
    history.getState().clear();
    expect(unseenCount(history.getState())).toBe(0);
  });

  it('comes back after a reload of the window (sessionStorage)', () => {
    const store = memory();
    const before = createNoticeHistory(() => store);
    before.getState().record({ id: 'a', text: 'Перше', color: 'green' }, 1000);
    before.getState().record({ id: 'b', text: 'Друге', title: 'Заголовок' }, 2000);
    before.getState().markSeen();
    before.getState().record({ id: 'c', text: 'Третє' }, 3000);
    const after = createNoticeHistory(() => store);
    expect(after.getState().entries).toEqual(before.getState().entries);
    expect(unseenCount(after.getState())).toBe(1);
    // numbers go on from where they were: a new entry is newer than everything kept
    after.getState().record({ id: 'd', text: 'Четверте' });
    const seqs = after.getState().entries.map((e) => e.seq);
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(seqs[0]).toBeGreaterThan(Math.max(...seqs.slice(1)));
  });

  it('starts empty from a broken or foreign copy', () => {
    for (const raw of ['{', 'null', '5', '"x"', JSON.stringify({ entries: [{ id: 1 }, null] })]) {
      const store = memory();
      store.setItem('vo:notices', raw);
      expect(createNoticeHistory(() => store).getState().entries).toEqual([]);
    }
  });

  it('works on when the storage refuses to read or write, or is not there', () => {
    for (const storage of [
      () => refusing,
      () => null,
      () => {
        throw new Error('SecurityError');
      },
    ]) {
      const history = createNoticeHistory(storage);
      expect(() => history.getState().record({ id: 'a', text: 'Збережено' })).not.toThrow();
      expect(history.getState().entries).toHaveLength(1);
    }
  });
});

describe('the recorder on Mantine’s notifications store', () => {
  const setup = () => {
    const source = createNotificationsStore();
    const history = fresh();
    const stop = createNoticeRecorder(history)(source);
    const texts = () => history.getState().entries.map((e) => e.text);
    return { source, history, stop, texts };
  };

  it('records a notice the first time it appears, not on every change of the store', () => {
    const { source, texts } = setup();
    const id = showNotification({ message: 'Додано у показ', color: 'green' }, source);
    showNotification({ message: 'Друге' }, source);
    hideNotification('nothing-here', source);
    expect(texts()).toEqual(['Друге', 'Додано у показ']);
    hideNotification(id, source);
    expect(texts()).toEqual(['Друге', 'Додано у показ']);
  });

  it('an update under the same id updates its entry; the same words change nothing', () => {
    const { source, history, texts } = setup();
    showNotification({ id: 'save', message: 'Зберігаю…', loading: true }, source);
    const rev = history.getState().entries[0].rev;
    updateNotification({ id: 'save', message: 'Зберігаю…', autoClose: 4000 }, source);
    expect(history.getState().entries[0].rev).toBe(rev);
    updateNotification({ id: 'save', message: 'Збережено', color: 'green' }, source);
    expect(texts()).toEqual(['Збережено']);
    expect(history.getState().entries[0].color).toBe('green');
  });

  it('the same id shown again after it closed is a new entry', () => {
    const { source, texts } = setup();
    showNotification({ id: 'edge', message: 'Кінець розділу' }, source);
    hideNotification('edge', source);
    showNotification({ id: 'edge', message: 'Кінець розділу' }, source);
    expect(texts()).toEqual(['Кінець розділу', 'Кінець розділу']);
  });

  it('records the queued ones too (more than the limit on screen)', () => {
    const { source, texts } = setup();
    for (let i = 1; i <= 8; i++) showNotification({ message: `N${i}` }, source);
    expect(source.getState().queue.length).toBeGreaterThan(0);
    expect(texts()).toHaveLength(8);
  });

  it('keeps only words: a notice’s button does not live on in the history', () => {
    const { source, history } = setup();
    let undone = 0;
    showNotification(
      {
        message: h(
          'div',
          null,
          h('span', null, 'Пісню видалено'),
          h('button', { onClick: () => undone++ }, 'Скасувати'),
        ),
      },
      source,
    );
    const [entry] = history.getState().entries;
    expect(entry.text).toBe('Пісню видалено Скасувати');
    expect(JSON.parse(JSON.stringify(entry))).toEqual(entry);
    expect(undone).toBe(0);
  });

  it('a second install (StrictMode’s remount) records nothing twice; stop stops', () => {
    const source = createNotificationsStore();
    const history = fresh();
    const install = createNoticeRecorder(history);
    showNotification({ message: 'Раніше' }, source);
    const stop = install(source);
    expect(history.getState().entries).toHaveLength(1);
    stop();
    install(source)();
    const again = install(source);
    expect(history.getState().entries).toHaveLength(1);
    again();
    showNotification({ message: 'Після' }, source);
    expect(history.getState().entries).toHaveLength(1);
  });

  it('works with any store of that shape', () => {
    let listener: ((s: never) => void) | null = null;
    let state = { notifications: [{ id: 'a', message: 'А' }], queue: [] as never[] };
    const fake = {
      getState: () => state,
      subscribe: (l: (s: never) => void) => {
        listener = l;
        return () => (listener = null);
      },
    };
    const history = fresh();
    const stop = createNoticeRecorder(history)(fake);
    state = { ...state, notifications: [...state.notifications, { id: 'b', message: 'Б' }] };
    listener!(state as never);
    expect(history.getState().entries.map((e) => e.text)).toEqual(['Б', 'А']);
    stop();
    expect(listener).toBeNull();
  });
});
