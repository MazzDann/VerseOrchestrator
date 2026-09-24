import { ScrollArea, Box, Title, Group } from '@mantine/core';
import { IconAdjustments } from '@tabler/icons-react';
import { SettingsPanel } from '../components/SettingsPanel';

/**
 * Standalone settings window (`/settings`) — opened on a second monitor next to the
 * control window. Changes sync live to the control/presenter via a cross-window
 * `storage` listener that rehydrates the persisted settings store (see main.tsx).
 */
export function Settings() {
  return (
    <ScrollArea style={{ height: '100vh' }} type="auto">
      <Box maw={560} mx="auto" px="md" py="lg">
        <Group gap={8} mb="md">
          <IconAdjustments size={22} />
          <Title order={4}>Налаштування вигляду</Title>
        </Group>
        <SettingsPanel />
      </Box>
    </ScrollArea>
  );
}
