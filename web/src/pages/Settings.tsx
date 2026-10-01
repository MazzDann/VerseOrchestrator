import { useEffect } from 'react';
import { ScrollArea, Box, Title, Group, Text } from '@mantine/core';
import { IconAdjustments } from '@tabler/icons-react';
import { SettingsPanel } from '../components/SettingsPanel';
import { tr, useLang } from '../i18n';
import { probeServer, useServer, versionHeading } from '../serverStore';
import { useSettingsSaveNotice } from '../lib/settingsSaveNotice';

/**
 * Standalone settings window (`/settings`) — opened on a second monitor next to the
 * control window. Changes sync live to the control/presenter via a cross-window
 * `storage` listener that rehydrates the persisted settings store (see main.tsx).
 */
export function Settings() {
  useLang();
  // the version in the header (2026-10-01): a git checkout by its label
  const devLabel = useServer((s) => s.devLabel);
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
        <Group gap={8} mb="md" wrap="nowrap">
          <IconAdjustments size={22} style={{ flexShrink: 0 }} />
          <Title order={4} style={{ flexShrink: 0 }}>
            {tr('Налаштування вигляду')}
          </Title>
          <Text size="xs" c="dimmed" ml="auto" ta="right" style={{ minWidth: 0 }}>
            {versionHeading(devLabel, __APP_VERSION__)}
          </Text>
        </Group>
        <SettingsPanel />
      </Box>
    </ScrollArea>
  );
}
