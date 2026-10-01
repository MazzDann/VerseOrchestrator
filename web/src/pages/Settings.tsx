import { useEffect } from 'react';
import { ScrollArea, Box, Title, Group } from '@mantine/core';
import { IconAdjustments } from '@tabler/icons-react';
import { SettingsPanel } from '../components/SettingsPanel';
import { tr, useLang } from '../i18n';
import { probeServer, useServer } from '../serverStore';
import { useSettingsSaveNotice } from '../lib/settingsSaveNotice';

/**
 * Standalone settings window (`/settings`) — opened on a second monitor next to the
 * control window. Changes sync live to the control/presenter via a cross-window
 * `storage` listener that rehydrates the persisted settings store (see main.tsx).
 */
export function Settings() {
  useLang();
  // a change the browser can't store says so here too (1.4.1)
  useSettingsSaveNotice();
  // the control window finds out whether the server is there; this window must ask itself —
  // «Оновлення» and the other server-backed sections wait for the answer
  useEffect(() => {
    if (useServer.getState().available === null) void probeServer();
  }, []);
  return (
    <ScrollArea style={{ height: '100vh' }} type="auto">
      <Box maw={560} mx="auto" px="md" py="lg">
        <Group gap={8} mb="md">
          <IconAdjustments size={22} />
          <Title order={4}>{tr('Налаштування вигляду')}</Title>
        </Group>
        <SettingsPanel />
      </Box>
    </ScrollArea>
  );
}
