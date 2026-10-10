import { memo } from 'react';
import { Stack, Text, Group, ActionIcon, Tooltip } from '@mantine/core';
import { IconPlaylistAdd, IconX } from '@tabler/icons-react';
import { type RefItem } from '../settingsStore';
import { type PlaceText, placeTextKey } from '../pages/control/useHistoryTexts';
import { tr, useLang } from '../i18n';

interface Props {
  items: RefItem[];
  onPick: (item: RefItem) => void;
  onRemove?: (item: RefItem) => void;
  /** «Додати в показ» on each row (the bookmarks under the monitors, 1.8.12-beta.6) */
  onAdd?: (item: RefItem) => void;
  /** a pale line of each place's text, its whole pick in a tooltip («Історія», 1.13.0-beta.3) */
  texts?: Map<string, PlaceText>;
  empty: string;
}

/**
 * Compact clickable list of references — used for history and bookmarks. Memo'd (1.8.12-beta.6):
 * under the monitors it would be drawn again with every verse step.
 */
export const RefList = memo(function RefList({
  items,
  onPick,
  onRemove,
  onAdd,
  texts,
  empty,
}: Props) {
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
      {items.map((item, i) => {
        const text = texts?.get(placeTextKey(item));
        const label = (
          <Text
            size="sm"
            style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
            truncate
            title={text ? undefined : item.ref}
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
            {text && (
              // the place's text, pale and on one line (the author's Q8a)
              <Text component="span" size="xs" c="dimmed" display="block" truncate>
                {text.line}
              </Text>
            )}
          </Text>
        );
        return (
          <Group key={`${item.ref}-${i}`} gap={4} wrap="nowrap">
            {text ? (
              <Tooltip
                label={`${item.ref}${text.abbr ? ` · ${text.abbr}` : ''} — ${text.full}`}
                multiline
                w={320}
                openDelay={400}
                withArrow
                position="right"
                events={{ hover: true, focus: true, touch: false }}
              >
                {label}
              </Tooltip>
            ) : (
              label
            )}
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
        );
      })}
    </Stack>
  );
});
