import { Stack, Text } from '@mantine/core';
import { IconFileUpload } from '@tabler/icons-react';
import { tr, useLang } from '../i18n';

/** What a drop does, while files are dragged over the control window (1.14.0-beta.1). */
export function DropOverlay() {
  useLang();
  return (
    <div className="vo-drop-overlay" aria-hidden>
      <Stack align="center" gap="xs" className="vo-drop-card">
        <IconFileUpload size={36} stroke={1.5} />
        <Text fw={600}>{tr('Відпустіть, щоб додати')}</Text>
        <Text size="sm" c="dimmed" ta="center" maw={360}>
          {tr('Фото й картинки — у «Зображення», папку — альбомом, відео — у «Відео».')}
        </Text>
      </Stack>
    </div>
  );
}
