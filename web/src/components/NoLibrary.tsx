import { Button, Group, Stack, Text } from '@mantine/core';
import { IconAdjustments, IconDatabaseImport } from '@tabler/icons-react';
import { tr, useLang } from '../i18n';
import { rebuildProgress, useRebuildLibrary } from '../lib/rebuild';

/**
 * Why there is nothing to read, and what to do (0.13.1): `missing` — the server has no
 * library yet; `empty` — it has one without translations; `local` — the browser library
 * holds no translation. Before, the control window showed an empty list and no hint.
 */
export type LibraryGap = 'missing' | 'empty' | 'local';

export function NoLibrary({
  gap,
  onOpenSettings,
}: {
  gap: LibraryGap;
  onOpenSettings: () => void;
}) {
  useLang();
  const { rebuilding, job, rebuild, stop } = useRebuildLibrary();
  const server = gap !== 'local';
  return (
    <Stack gap="xs" p="sm" maw={560}>
      <Text fw={600}>
        {gap === 'missing'
          ? tr('Бібліотеки ще немає')
          : gap === 'empty'
            ? tr('У бібліотеці немає перекладів')
            : tr('У браузері ще немає перекладів')}
      </Text>
      {server && (
        <Text size="sm" c="dimmed">
          {tr(
            'Покладіть модулі MyBible (*.SQLite3) у папку modules/ поруч із застосунком і натисніть «Пересканувати модулі».',
          )}
        </Text>
      )}
      <Text size="sm" c="dimmed">
        {server
          ? tr(
              'Або відкрийте модуль прямо в браузері: додайте файл у «Джерело даних» (Налаштування вигляду → Застосунок) і виберіть «У браузері».',
            )
          : tr(
              'Додайте модуль MyBible чи сегмент у «Джерело даних» (Налаштування вигляду → Застосунок).',
            )}
      </Text>
      <Group gap="xs" mt={4}>
        {server && (
          <Button
            size="sm"
            variant="light"
            leftSection={<IconDatabaseImport size={16} />}
            loading={rebuilding}
            onClick={() => void rebuild()}
          >
            {tr('Пересканувати модулі')}
          </Button>
        )}
        {server && job?.phase === 'running' && (
          <Button size="sm" variant="default" onClick={() => void stop()}>
            {tr('Зупинити')}
          </Button>
        )}
        <Button
          size="sm"
          variant="default"
          leftSection={<IconAdjustments size={16} />}
          onClick={onOpenSettings}
        >
          {tr('Джерело даних…')}
        </Button>
      </Group>
      {server && job?.phase === 'running' && (
        <Text size="xs" c="dimmed" aria-live="polite">
          {rebuildProgress(job)}
        </Text>
      )}
    </Stack>
  );
}
