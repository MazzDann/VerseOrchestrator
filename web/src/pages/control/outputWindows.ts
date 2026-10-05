import { notifications } from '@mantine/notifications';
import { tr } from '../../i18n';
import { openPresenterWindow, openStageWindow } from '../../openPresenter';
import { useSettings } from '../../settingsStore';

export const openPresenter = async () => {
  // «Кілька вікон показу» (Вікна виводу): another window instead of the open one.
  const win = await openPresenterWindow(useSettings.getState().outputs.multiple);
  notifications.show(
    win
      ? { message: tr('Вікно показу відкрито'), color: 'brand', autoClose: 1500 }
      : { message: tr('Не вдалося відкрити вікно (перевірте блокувальник)'), color: 'red' },
  );
};

export const openStage = async () => {
  const win = await openStageWindow();
  notifications.show(
    win
      ? { message: tr('Вікно сцени відкрито'), color: 'brand', autoClose: 1500 }
      : { message: tr('Не вдалося відкрити вікно (перевірте блокувальник)'), color: 'red' },
  );
};
