import { Anchor, Group, Kbd, Stack, Text } from '@mantine/core';
import { formatChord, HOTKEY_ACTIONS } from '../hotkeys';
import { useSettings } from '../settingsStore';
import { tr, useLang } from '../i18n';
import { docsUrl } from '../lib/docs';

/**
 * A read-only cheat sheet of the operator shortcuts (1.21.0-beta.5, users' F1024-06: «посібничок зі
 * скороченнями»). The keys come from the live keymap, so a rebinding shows here too; to change one,
 * «Налаштування вигляду» → «Клавіші». Opened by «?» or from the command palette.
 */
export function HotkeysCheatsheet() {
  const lang = useLang();
  const keymap = useSettings((s) => s.keymap);
  return (
    <Stack gap={8}>
      <Text size="xs" c="dimmed">
        {tr('Клавіші показу. Змінити — «Налаштування вигляду» → «Клавіші».')}
      </Text>
      {HOTKEY_ACTIONS.map((a) => {
        const chords = (keymap[a.id] ?? a.default).split(',').filter(Boolean);
        return (
          <Group key={a.id} justify="space-between" wrap="nowrap" align="flex-start" gap="sm">
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={500}>
                {tr(a.label)}
              </Text>
              <Text size="xs" c="dimmed">
                {tr(a.hint)}
              </Text>
            </div>
            <Group gap={4} wrap="wrap" justify="flex-end" style={{ flexShrink: 0, maxWidth: 160 }}>
              {chords.map((c, i) => (
                <Kbd key={i} size="xs">
                  {formatChord(c)}
                </Kbd>
              ))}
            </Group>
          </Group>
        );
      })}
      <Text size="xs" c="dimmed">
        {tr('Enter — вибраний вірш на екран; у полі «Вірш» — ↑/↓ гортають. Повніше — у ')}
        <Anchor size="xs" href={docsUrl(lang)} target="_blank" rel="noopener">
          {tr('довідці')}
        </Anchor>
        .
      </Text>
    </Stack>
  );
}
