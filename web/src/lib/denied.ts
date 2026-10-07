import { FILE_DENIED, FOLDER_DENIED } from '@vo/shared';
import { ApiFailure } from '../api';
import { IS_MAC } from '../hotkeys';
import { tr } from '../i18n';

/**
 * Why an album's folder or a video's file can't be read, and where to allow it (Mac check of
 * 1.9.0): the server says `denied` — the system refused — instead of «not found», which asked to
 * plug in a drive that was there. On a Mac it is the privacy settings (Desktop, Documents,
 * Downloads, removable and network disks are kept from a program macOS hasn't allowed — the
 * Terminal of start.command, or node under the LaunchAgent); elsewhere the folder's rights.
 * `then`: what to do after — «Оновити» in the album or the video list, another folder in the picker.
 */
export function deniedHint(
  what: 'folder' | 'file',
  then?: 'refresh' | 'pick',
  mac = IS_MAC,
): string {
  const why = mac
    ? `${what === 'folder' ? tr('macOS не дає відкрити цю папку.') : tr('macOS не дає відкрити цей файл.')} ${tr(
        'Дозвольте доступ: Системні параметри → Приватність і безпека → Файли та папки (або «Повний доступ до диска») — для Термінала чи програми, що запускає VerseOrchestrator.',
      )}`
    : tr(what === 'folder' ? FOLDER_DENIED : FILE_DENIED);
  const next =
    then === 'refresh'
      ? tr('Потім натисніть «Оновити».')
      : then === 'pick'
        ? tr('Або виберіть іншу папку.')
        : '';
  return next ? `${why} ${next}` : why;
}

/** A refused add in words: the system's refusal (the server's key) says where to allow it too. */
export const addRefusal = (e: unknown, what: 'folder' | 'file'): string =>
  e instanceof ApiFailure && (e.key === FOLDER_DENIED || e.key === FILE_DENIED)
    ? deniedHint(what)
    : tr((e as Error).message);

/**
 * Why an album's folder or a video's file can't be used, named by `name` — the running order's
 * mark, a remote's answer, a notice (1.9.4): added on another computer first, then the system's
 * refusal, then not there; null when it can be used. Before, all three said «не знайдено» there.
 */
export function unusable(
  what: 'folder' | 'file',
  e: { missing: boolean; denied?: boolean; elsewhere?: boolean },
  name: string,
): string | null {
  if (e.elsewhere)
    return what === 'folder'
      ? tr('Папка з іншого комп’ютера: {name}', { name })
      : tr('Файл з іншого комп’ютера: {name}', { name });
  if (e.denied)
    return what === 'folder'
      ? tr('Немає доступу до папки: {name}', { name })
      : tr('Немає доступу до файлу: {name}', { name });
  if (e.missing)
    return what === 'folder'
      ? tr('Папку не знайдено: {name}', { name })
      : tr('Файл не знайдено: {name}', { name });
  return null;
}

/** A notice for a folder or file that can't be used: a refusal says where to allow it. */
export const unusableNotice = (
  what: 'folder' | 'file',
  e: { missing: boolean; denied?: boolean; elsewhere?: boolean },
  path: string,
): string => (e.denied && !e.elsewhere ? deniedHint(what) : (unusable(what, e, path) ?? ''));
