import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { useDataSource } from '../../dataSourceStore';
import { tr } from '../../i18n';

/** «Застосунок» in the settings panel, and the first run with no server that opens it (E1). */
export function useAppSettingsOpener({
  setSettingsOpen,
  serverAvailable,
}: {
  setSettingsOpen: (open: boolean) => void;
  serverAvailable: boolean | null;
}) {
  /** The settings panel, opened on «Застосунок» (where «Джерело даних» is). */
  const openAppSettings = () => {
    try {
      const open = JSON.parse(localStorage.getItem('vo:settingsSections') ?? '[]');
      if (Array.isArray(open) && !open.includes('app'))
        localStorage.setItem('vo:settingsSections', JSON.stringify([...open, 'app']));
    } catch {
      /* storage unavailable */
    }
    setSettingsOpen(true);
  };
  // First run with no server and nothing loaded: the library can only come from the
  // browser engine — open the settings on «Джерело даних» and say why.
  useEffect(() => {
    if (serverAvailable !== false || useDataSource.getState().segments.length > 0) return;
    openAppSettings();
    // next tick: on first paint the notifications host may not be mounted yet
    window.setTimeout(() =>
      notifications.show({
        message: tr(
          'Сервера немає — бібліотека працюватиме в браузері. Виберіть переклади в «Джерело даних».',
        ),
        color: 'brand',
        autoClose: 8000,
      }),
    );
    // deps as they were in Control, where the rule saw openAppSettings use only a state setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverAvailable]);
  return openAppSettings;
}
