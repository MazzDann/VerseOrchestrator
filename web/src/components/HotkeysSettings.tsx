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

const labelFor = (id: HotkeyActionId) => HOTKEY_ACTIONS.find((a) => a.id === id)?.label ?? id;

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
          На Mac F-клавіші натискають разом із Fn, тому типово працюють і поєднання з ⌘: ⌘↩ — на
          екран, ⌘F — пошук у перекладі, ⇧⌘F — пошук скрізь, ⌘K — палітра команд.
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
                {a.label}
              </Text>
              <Text size="xs" c="dimmed" truncate>
                {a.hint}
              </Text>
              {conflicts.length > 0 && (
                <Text size="xs" c="orange">
                  Конфлікт із «{conflicts.map(labelFor).join('», «')}» — спрацюють разом
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
                  Натисніть клавіші… (Esc — скасувати)
                </Button>
              ) : (
                <>
                  <Group gap={4} wrap="nowrap">
                    {chords.map((c, i) => (
                      <Kbd key={i}>{formatChord(c)}</Kbd>
                    ))}
                  </Group>
                  <Tooltip label="Змінити">
                    <ActionIcon
                      variant="default"
                      size="sm"
                      onClick={() => setRecording(a.id)}
                      aria-label={`Змінити клавішу: ${a.label}`}
                    >
                      <IconPencil size={14} />
                    </ActionIcon>
                  </Tooltip>
                  {customised && (
                    <Tooltip label="Типова">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        onClick={() => setHotkey(a.id, DEFAULT_KEYMAP[a.id])}
                        aria-label={`Типова клавіша: ${a.label}`}
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
        Скинути всі клавіші
      </Button>
    </Stack>
  );
}
