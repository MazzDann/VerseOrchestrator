import { notifications, notificationsStore } from '@mantine/notifications';

/** the notice each key shows now: its own id (a fresh one per new message) and its words */
const current = new Map<string, { id: string; message: string }>();
let seq = 0;

/**
 * One notice per `key` (1.10.6, the Mac's round: a key held at an edge piled up ~11 alike): the same
 * words again leave the one on screen as it is; other words take its place with a timer of their own
 * (an update in place kept the old one's — a failure right after a success went in a blink).
 */
export function noticeOnce(key: string, message: string, autoClose = 2500, color = 'gray'): void {
  const { notifications: shown, queue } = notificationsStore.getState();
  const prev = current.get(key);
  const visible = !!prev && [...shown, ...queue].some((n) => n.id === prev.id);
  if (visible && prev.message === message) return;
  if (visible) notifications.hide(prev.id);
  const id = `${key}-${++seq}`;
  current.set(key, { id, message });
  notifications.show({ id, message, color, autoClose });
}
