import { Stack, Text } from '@mantine/core';
import { IconFileUpload, IconPlaylistAdd } from '@tabler/icons-react';
import { tr, useLang } from '../i18n';

/**
 * What a drop does, while files are dragged over the control window (1.14.0-beta.1). Over the
 * running order («Показ», 1.18.2) it outlines it: a drop there goes next in the show.
 */
export function DropOverlay({ zone }: { zone: 'order' | null }) {
  useLang();
  const order =
    typeof document !== 'undefined'
      ? document.querySelector('[data-drop-zone="order"]')?.getBoundingClientRect()
      : undefined;
  const orderShown = !!order && order.width > 0 && order.height > 0;
  return (
    <div className="vo-drop-overlay" data-zone={zone ?? undefined} aria-hidden>
      {orderShown && (
        <div
          className="vo-drop-zone"
          data-active={zone === 'order' ? 'true' : undefined}
          style={{ left: order.left, top: order.top, width: order.width, height: order.height }}
        >
          <IconPlaylistAdd size={22} stroke={1.5} />
          <Text size="sm" fw={600} ta="center">
            {tr('Сюди — наступним у показі')}
          </Text>
        </div>
      )}
      {zone !== 'order' && (
        <Stack align="center" gap="xs" className="vo-drop-card">
          <IconFileUpload size={36} stroke={1.5} />
          <Text fw={600}>{tr('Відпустіть, щоб додати')}</Text>
          <Text size="sm" c="dimmed" ta="center" maw={360}>
            {tr(
              'Фото й картинки — у «Зображення», папку — альбомом, відео — у «Відео», документ (.docx, .md, .txt, .pdf) — у «Документи», презентацію (.pptx) — у «Пісні», модуль (.SQLite3) — у бібліотеку, vectors.db — у вектори.',
            )}
          </Text>
          {orderShown && (
            <Text size="sm" ta="center" maw={360}>
              {tr('На «Показ» під моніторами — і вони стануть наступними у показі.')}
            </Text>
          )}
        </Stack>
      )}
    </div>
  );
}
