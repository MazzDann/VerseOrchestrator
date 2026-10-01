import { Paper, Text } from '@mantine/core';
import { formatChord, IS_MAC } from '../hotkeys';
import { tr, useLang } from '../i18n';

/**
 * The numbers of a quick jump as they are typed (1.4.0), after the open book's name: bottom
 * centre of the control window — the notices sit bottom-left and the floating panels tile
 * from the bottom-right. The hint names ⌘↩ / Ctrl+Enter: the box goes there and shows it
 * (Mac check of 1.4.0).
 */
export function QuickRefPill({ value, place }: { value: string; place: string }) {
  useLang();
  return (
    <Paper className="vo-quick-ref" withBorder shadow="md" px="md" py={6} role="status">
      <Text size="sm">
        {place && (
          <Text span c="dimmed">
            {place}{' '}
          </Text>
        )}
        <Text span fw={600} ff="monospace">
          {value}
        </Text>
      </Text>
      <Text size="xs" c="dimmed">
        {tr('Enter — перейти · {show} — на екран · Esc — скасувати', {
          show: formatChord(IS_MAC ? 'meta+enter' : 'ctrl+enter'),
        })}
      </Text>
    </Paper>
  );
}
