import { useState } from 'react';
import { Button, Text } from '@mantine/core';
import { IconDeviceDesktop } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '../api';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { tr, useLang } from '../i18n';

/**
 * «Ярлик на робочому столі» (0.7.5): starts the app and opens the control window as an app
 * window — no tabs, no address bar: in the browser chosen above when it is built on Chromium
 * (BrowserSection), with «Браузер системи» in Chrome or Edge (the default browser otherwise). The
 * same as `start --shortcut` (server/src/shortcut.ts).
 */
export function ShortcutSection() {
  const serverAvailable = useServer((s) => s.available);
  const [busy, setBusy] = useState(false);
  useLang();

  const make = async () => {
    setBusy(true);
    try {
      const r = await api.createShortcut();
      notifications.show({
        message: tr('Ярлик створено: {file}', { file: r.files[0] }),
        color: 'green',
        autoClose: 3000,
      });
    } catch (e) {
      notifications.show({
        message: tr('Ярлик не створено: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Text size="sm" fw={500} mb={2}>
        {tr('Ярлик на робочому столі')}
      </Text>
      <Text size="xs" c="dimmed" mb={8}>
        {tr(
          'Запускає застосунок і відкриває вікно керування окремим вікном — без вкладок і адресного рядка: у браузері, вибраному вище, якщо він на основі Chromium, а з «Браузер системи» — у Chrome чи Edge.',
        )}
      </Text>
      <Button
        size="xs"
        variant="default"
        fullWidth
        leftSection={<IconDeviceDesktop size={14} />}
        loading={busy}
        disabled={serverAvailable === false}
        title={serverAvailable === false ? tr(NEEDS_SERVER) : undefined}
        onClick={() => void make()}
      >
        {tr('Створити ярлик')}
      </Button>
    </div>
  );
}
