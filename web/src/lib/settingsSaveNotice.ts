import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { tr } from '../i18n';
import { onSettingsSaveFailed } from '../settingsStore';

const NOTICE_ID = 'settings-unsaved';

/**
 * For the control and settings windows (1.4.1): a settings write the browser refused — its
 * storage is full, almost always of images — becomes one red notice (the same id: a notice
 * already up is not repeated on every later change). Before, the changes were lost silently.
 */
export function useSettingsSaveNotice(): void {
  useEffect(
    () =>
      onSettingsSaveFailed(() => {
        notifications.show({
          id: NOTICE_ID,
          color: 'red',
          message: tr(
            'Не вдалося зберегти налаштування: у сховищі браузера бракує місця. Виберіть менше зображення або приберіть фон чи логотип (Налаштування вигляду)',
          ),
        });
      }),
    [],
  );
}
