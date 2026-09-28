import type { RemoteCommand } from '../api';

/** One name per remote command — the same words on the phone and in the control UI. */
export const REMOTE_LABEL: Record<RemoteCommand, string> = {
  next: 'Далі',
  prev: 'Назад',
  blank: 'Затемнити',
  black: 'Чорний екран',
  show: 'На екран',
  pick: 'Вибір віршів',
  songs: 'Пісні',
  playlist: 'Послідовність',
  queue: 'У послідовність',
};
