import { notifications } from '@mantine/notifications';
import { IS_MAC } from '../hotkeys';
import { tr } from '../i18n';

/**
 * «Закрити це вікно» on a second control window (1.1.0, the operator's ask to get back to the
 * one in charge): a page can't bring another window forward, but it may close itself when the
 * app opened it or it has nothing to go back to (a window of the shortcut or the start file) —
 * then the one underneath, usually the first control window, is in front again. A tab the
 * browser keeps open: say how to close it.
 */
export function closeThisWindow(): void {
  window.close();
  window.setTimeout(() => {
    if (window.closed) return;
    notifications.show({
      message: tr('Браузер не дає закрити цю вкладку — закрийте її самі ({key}).', {
        key: IS_MAC ? '⌘W' : 'Ctrl+W',
      }),
      color: 'gray',
      autoClose: 5000,
    });
  }, 300);
}
