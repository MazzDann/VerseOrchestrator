import { memo } from 'react';
import { Stack, Text, Group, ActionIcon, Tooltip } from '@mantine/core';
import { IconPlaylistAdd, IconX } from '@tabler/icons-react';
import { type RefItem } from '../settingsStore';
import { tr, useLang } from '../i18n';

interface Props {
  items: RefItem[];
  onPick: (item: RefItem) => void;
  onRemove?: (item: RefItem) => void;
  /** «Додати в показ» on each row (the bookmarks under the monitors, 1.8.12-beta.6) */
  onAdd?: (item: RefItem) => void;
  empty: string;
}

/**
 * Compact clickable list of references — used for history and bookmarks. Memo'd (1.8.12-beta.6):
 * under the monitors it would be drawn again with every verse step.
 */
export const RefList = memo(function RefList({ items, onPick, onRemove, onAdd, empty }: Props) {
  useLang();
  if (items.length === 0) {
    return (
      <Text size="sm" c="dimmed" p="sm">
        {empty}
      </Text>
    );
  }
  return (
    <Stack gap={2} p="xs">
      {items.map((item, i) => (
        <Group key={`${item.ref}-${i}`} gap={4} wrap="nowrap">
          <Text
            size="sm"
            style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            truncate
            title={item.ref}
            role="button"
            tabIndex={0}
            onClick={() => onPick(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onPick(item);
              }
            }}
          >
            {item.refShort || item.ref}
          </Text>
          {onAdd && (
            <Tooltip label={tr('Додати в показ')}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={() => onAdd(item)}
                aria-label={tr('Додати в показ: {item}', { item: item.refShort || item.ref })}
              >
                <IconPlaylistAdd size={14} />
              </ActionIcon>
            </Tooltip>
          )}
          {onRemove && (
            <Tooltip label={tr('Прибрати')}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={() => onRemove(item)}
                aria-label={tr('Прибрати')}
              >
                <IconX size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      ))}
    </Stack>
  );
});
