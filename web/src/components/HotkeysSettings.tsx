import { useEffect, useState } from 'react';
import { Stack, Group, Text, Button, ActionIcon, Tooltip, Kbd } from '@mantine/core';
import { IconPencil, IconRotateClockwise } from '@tabler/icons-react';
import { useSettings } from '../settingsStore';
import {
  HOTKEY_ACTIONS,
  DEFAULT_KEYMAP,
  IS_MAC,
  comboFromEvent,
  formatChord,
  conflictsForAction,
  type HotkeyActionId,
} from '../hotkeys';
import { tr, useLang } from '../i18n';

const labelFor = (id: HotkeyActionId) => {
  const label = HOTKEY_ACTIONS.find((a) => a.id === id)?.label;
  return label ? tr(label) : id;
};

/**
 * Rebind operator shortcuts. Click "змінити" to record the next key combo for an
 * action; capturing uses a capture-phase listener so the pressed keys don't also
 * trigger the app's own hotkeys (and so F5/Ctrl+F don't reach the browser).
 * Recording one combo replaces the action's alternatives — use «типова» to restore.
 * The conflict banner is derived from the live keymap, so it self-clears on any revert.
 */
export function HotkeysSettings() {
  const keymap = useSettings((s) => s.keymap);
  const setHotkey = useSettings((s) => s.setHotkey);
  const resetKeymap = useSettings((s) => s.resetKeymap);
  const [recording, setRecording] = useState<HotkeyActionId | null>(null);
  useLang();

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Escape cancels recording (so it stays bindable to "clear" by default).
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      const chord = comboFromEvent(e);
      if (!chord) return; // a lone modifier — keep waiting
      setHotkey(recording, chord);
      setRecording(null);
    };
    // Capture phase + preventDefault: stop the combo from firing app hotkeys or the browser.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, setHotkey]);

  return (
    <Stack gap="xs">
      {IS_MAC && (
        <Text size="xs" c="dimmed">
          {tr(
            'На Mac F-клавіші натискають разом із Fn, тому типово працюють і поєднання з ⌘: ⌘↩ — на екран, ⌘F — пошук у перекладі, ⇧⌘F — пошук скрізь, ⌘K — палітра команд.',
          )}
        </Text>
      )}
      {HOTKEY_ACTIONS.map((a) => {
        const isRec = recording === a.id;
        const chords = keymap[a.id].split(',').filter(Boolean);
        const customised = keymap[a.id] !== DEFAULT_KEYMAP[a.id];
        const conflicts = conflictsForAction(keymap, a.id);
        return (
          <Group key={a.id} justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text size="sm" fw={500} truncate>
                {tr(a.label)}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {tr(a.hint)}
              </Text>
              {conflicts.length > 0 && (
                <Text size="xs" c="orange">
                  {tr('Конфлікт із «{actions}» — спрацюють разом', {
                    actions: conflicts.map(labelFor).join('», «'),
                  })}
                </Text>
              )}
            </div>
            <Group gap={6} wrap="nowrap">
              {isRec ? (
                <Button
                  size="compact-xs"
                  variant="light"
                  color="orange"
                  onClick={() => setRecording(null)}
                >
                  {tr('Натисніть клавіші… (Esc — скасувати)')}
                </Button>
              ) : (
                <>
                  <Group gap={4} wrap="nowrap">
                    {chords.map((c, i) => (
                      <Kbd key={i}>{formatChord(c)}</Kbd>
                    ))}
                  </Group>
                  <Tooltip label={tr('Змінити')}>
                    <ActionIcon
                      variant="default"
                      size="sm"
                      onClick={() => setRecording(a.id)}
                      aria-label={tr('Змінити клавішу: {action}', { action: tr(a.label) })}
                    >
                      <IconPencil size={14} />
                    </ActionIcon>
                  </Tooltip>
                  {customised && (
                    <Tooltip label={tr('Типова')}>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={() => setHotkey(a.id, DEFAULT_KEYMAP[a.id])}
                        aria-label={tr('Типова клавіша: {action}', { action: tr(a.label) })}
                      >
                        <IconRotateClockwise size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </>
              )}
            </Group>
          </Group>
        );
      })}
      <Button
        variant="default"
        size="xs"
        leftSection={<IconRotateClockwise size={14} />}
        onClick={resetKeymap}
      >
        {tr('Скинути всі клавіші')}
      </Button>
    </Stack>
  );
}
