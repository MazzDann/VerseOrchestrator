import { N_ } from '@vo/shared';
import type { RemoteCommand } from '../api';

/** One name per remote command — the same words on the phone and in the control UI. */
export const REMOTE_LABEL: Record<RemoteCommand, string> = {
  next: N_('Далі'),
  prev: N_('Назад'),
  blank: N_('Сховати текст'),
  black: N_('Чорний екран'),
  show: N_('На екран'),
  pick: N_('Вибір віршів'),
  songs: N_('Пісні'),
  playlist: N_('Послідовність'),
  queue: N_('У послідовність'),
};
