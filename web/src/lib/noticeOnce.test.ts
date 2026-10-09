import { afterEach, describe, expect, it } from 'vitest';
import { notifications, notificationsStore } from '@mantine/notifications';
import { noticeOnce } from './noticeOnce';

const all = () => {
  const s = notificationsStore.getState();
  return [...s.notifications, ...s.queue];
};

describe('noticeOnce (1.10.6: a held key at an edge)', () => {
  afterEach(() => notifications.clean());
  it('says the same words once', () => {
    for (let i = 0; i < 11; i++) noticeOnce('show-edge', 'Кінець розділу');
    expect(all().filter((n) => String(n.id).startsWith('show-edge'))).toHaveLength(1);
  });
  it('other words take its place, a new notice with a timer of its own', () => {
    noticeOnce('show-edge', 'Кінець розділу');
    const first = all().find((n) => String(n.id).startsWith('show-edge'))?.id;
    noticeOnce('show-edge', 'Початок розділу');
    const mine = all().filter((n) => String(n.id).startsWith('show-edge'));
    expect(mine).toHaveLength(1);
    expect(mine[0].message).toBe('Початок розділу');
    expect(mine[0].id).not.toBe(first);
  });
  it('once it is gone, the same words show again', () => {
    noticeOnce('song-edge', 'Це остання строфа');
    notifications.clean();
    noticeOnce('song-edge', 'Це остання строфа');
    expect(all().filter((n) => String(n.id).startsWith('song-edge'))).toHaveLength(1);
  });
});
