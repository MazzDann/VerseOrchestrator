import { Stack, Text, Group, ActionIcon } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { type RefItem } from '../settingsStore';

interface Props {
  items: RefItem[];
  onPick: (item: RefItem) => void;
  onRemove?: (item: RefItem) => void;
  empty: string;
}

/** Compact clickable list of references — used for history and bookmarks. */
export function RefList({ items, onPick, onRemove, empty }: Props) {
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
          {onRemove && (
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={() => onRemove(item)}
              aria-label="Прибрати"
            >
              <IconX size={14} />
            </ActionIcon>
          )}
        </Group>
      ))}
    </Stack>
  );
}
