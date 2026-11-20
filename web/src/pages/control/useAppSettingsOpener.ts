import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { useDataSource } from '../../dataSourceStore';
import { tr } from '../../i18n';

/**
 * The settings panel opened with `section` unfolded (its accordion keeps the open ones in
 * `vo:settingsSections`), and `anchor` (an element id) brought into sight once it is drawn.
 */
export function openSettingsAt(
  setSettingsOpen: (open: boolean) => void,
  section: string,
  anchor?: string,
): void {
  try {
    const open = JSON.parse(localStorage.getItem('vo:settingsSections') ?? '[]');
    if (Array.isArray(open) && !open.includes(section))
      localStorage.setItem('vo:settingsSections', JSON.stringify([...open, section]));
    // the two panes (1.24.0-beta.1) open on it too
    localStorage.setItem('vo:settingsPane', section);
  } catch {
    /* storage unavailable */
  }
  setSettingsOpen(true);
  // the panel already open reads no storage: it unfolds the section on this (SettingsPanel)
  window.dispatchEvent(new CustomEvent('vo:open-settings-section', { detail: section }));
  if (anchor)
    window.setTimeout(
      () =>
        document.getElementById(anchor)?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      400,
    );
}

/** «Дані» in the settings panel (1.15.1; «Застосунок» before), and the first run with no server that opens it (E1). */
export function useAppSettingsOpener({
  setSettingsOpen,
  serverAvailable,
}: {
  setSettingsOpen: (open: boolean) => void;
  serverAvailable: boolean | null;
}) {
  /** The settings panel, opened on «Дані» (where «Джерело даних» is since 1.15.1). */
  const openAppSettings = () => openSettingsAt(setSettingsOpen, 'data');
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
