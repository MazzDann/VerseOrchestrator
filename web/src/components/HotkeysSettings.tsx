import { useEffect, useMemo, useState } from 'react';
import {
  Stack,
  Group,
  Text,
  Button,
  ActionIcon,
  Tooltip,
  Kbd,
  Select,
  Switch,
  TextInput,
  FileButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconDownload,
  IconPlus,
  IconRotateClockwise,
  IconSearch,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { useSettings, type OrderButtons } from '../settingsStore';
import {
  HOTKEY_ACTIONS,
  DEFAULT_KEYMAP,
  IS_MAC,
  comboFromEvent,
  formatChord,
  conflictsForAction,
  ARROW_SCHEMES,
  arrowScheme,
  withArrowScheme,
  HOTKEY_GROUPS,
  KEY_SETS,
  addChord,
  groupOf,
  keySet,
  removeChord,
  sanitizeKeymap,
  whereItWorks,
  type ArrowScheme,
  type HotkeyActionId,
  type KeySet,
  type Keymap,
} from '../hotkeys';
import { tr, useLang } from '../i18n';

const labelFor = (id: HotkeyActionId) => {
  const label = HOTKEY_ACTIONS.find((a) => a.id === id)?.label;
  return label ? tr(label) : id;
};

/**
 * «Стрілки» (1.8.12-beta.6, F1005-06): a scheme writes the arrows' bindings, each stays editable.
 * Its own component since 1.23.0-beta.2 — the cheat sheet «?» offers it too (the users' F1114-10
 * asked for «← → екран, ↑ ↓ прев’ю», which was there, unfound).
 */
export function ArrowSchemeSelect() {
  const keymap = useSettings((s) => s.keymap);
  const setHotkey = useSettings((s) => s.setHotkey);
  useLang();
  const scheme = arrowScheme(keymap);
  const pickScheme = (v: string | null) => {
    if (!v) return;
    const next = withArrowScheme(keymap, v as ArrowScheme);
    for (const id of Object.keys(next) as HotkeyActionId[])
      if (next[id] !== keymap[id]) setHotkey(id, next[id]);
  };
  return (
    <Select
      size="xs"
      label={tr('Стрілки')}
      description={
        scheme
          ? tr(ARROW_SCHEMES.find((s) => s.id === scheme)!.hint)
          : tr('Клавіші кроків змінено вручну — виберіть схему, щоб повернути одну зі звичних')
      }
      placeholder={tr('Своя')}
      data={ARROW_SCHEMES.map((s) => ({ value: s.id, label: tr(s.label) }))}
      value={scheme}
      onChange={pickScheme}
      allowDeselect={false}
      comboboxProps={{ withinPortal: true }}
    />
  );
}

/**
 * Rebind operator shortcuts. Click "змінити" to record the next key combo for an
 * action; capturing uses a capture-phase listener so the pressed keys don't also
 * trigger the app's own hotkeys (and so F5/Ctrl+F don't reach the browser).
 * Recording one combo replaces the action's alternatives — use «типова» to restore.
 * The conflict banner is derived from the live keymap, so it self-clears on any revert.
 */
export function HotkeysSettings() {
  const setHotkey = useSettings((s) => s.setHotkey);
  const [recording, setRecording] = useState<Recording | null>(null);
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
      const now = useSettings.getState().keymap[recording.id];
      setHotkey(recording.id, recording.add ? addChord(now, chord) : chord);
      setRecording(null);
    };
    // Capture phase + preventDefault: stop the combo from firing app hotkeys or the browser.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, setHotkey]);

  const orderFlow = useSettings((s) => s.orderFlow);
  const setOrderFlow = useSettings((s) => s.setOrderFlow);
  const orderButtons = useSettings((s) => s.orderButtons);
  const setOrderButtons = useSettings((s) => s.setOrderButtons);
  const pickBeforeEnter = useSettings((s) => s.pickBeforeEnter);
  const setPickBeforeEnter = useSettings((s) => s.setPickBeforeEnter);
  const continuousReading = useSettings((s) => s.continuousReading);
  const setContinuousReading = useSettings((s) => s.setContinuousReading);
  return (
    <Stack gap="xs">
      <ArrowSchemeSelect />
      <Switch
        size="xs"
        label={tr('Після кінця пункту «Далі» відкриває наступний')}
        description={tr(
          'Пункт послідовності показу: після його останнього вірша, слайда чи фото «Далі» відкриває наступний пункт, «Назад» на першому — попередній.',
        )}
        checked={orderFlow}
        onChange={(e) => setOrderFlow(e.currentTarget.checked)}
      />
      {/* «Безперервне читання» (1.21.0-beta.4, F1024-05): one press crosses a chapter edge */}
      <Switch
        size="xs"
        label={tr('Безперервне читання')}
        description={tr(
          'На кінці розділу «Далі» одразу відкриває наступний розділ (а «Назад» на початку — попередній), без другого натиску для підтвердження. Утримана клавіша все одно спиняється на межі.',
        )}
        checked={continuousReading}
        onChange={(e) => setContinuousReading(e.currentTarget.checked)}
      />
      {/* the «Показ» panel's ◀ / «Далі» (1.18.3, F1017-07 and the author's ask) */}
      <Select
        size="xs"
        label={tr('Кнопки «Показ»')}
        description={tr(
          '◀ і «Далі» над послідовністю показу: як стрілки клавіатури (наступний вірш, слайд, абзац) чи від пункту до пункту.',
        )}
        data={[
          { value: 'auto', label: tr('Порожній показ — як стрілки, інакше пункти') },
          { value: 'keys', label: tr('Завжди як стрілки клавіатури') },
          { value: 'items', label: tr('Лише пункти показу') },
        ]}
        value={orderButtons}
        onChange={(v) => v && setOrderButtons(v as OrderButtons)}
        allowDeselect={false}
        comboboxProps={{ withinPortal: true }}
      />
      <Switch
        size="xs"
        label={tr('Кілька віршів — на екран після Enter')}
        description={tr(
          'Поки «Наживо» увімкнено, вірші, додані з Ctrl (⌘) чи Shift, збираються в прев’ю. Enter, «На екран» чи «Далі» показують їх разом, а далі «Далі» веде по одному.',
        )}
        checked={pickBeforeEnter}
        onChange={(e) => setPickBeforeEnter(e.currentTarget.checked)}
      />
      {IS_MAC && (
        <Text size="xs" c="dimmed">
          {tr(
            'На Mac F-клавіші натискають разом із Fn, тому типово працюють і поєднання з ⌘: ⌘↩ — на екран, ⌘F — пошук у перекладі, ⇧⌘F — пошук скрізь, ⌘K — палітра команд.',
          )}
        </Text>
      )}
      <KeymapEditor recording={recording} setRecording={setRecording} />
      <KeySets />
    </Stack>
  );
}

/** A key being recorded: for which action, and whether it is one more (1.24.0-beta.4) or the only one. */
interface Recording {
  id: HotkeyActionId;
  add: boolean;
}

/**
 * The keys by group, with a search over the actions and their keys (1.24.0-beta.4, the author's
 * asks): each key its own chip, × takes it away, + records one more; with none the action is «без
 * клавіші» (kept as such); where it works is said by it.
 */
function KeymapEditor({
  recording,
  setRecording,
}: {
  recording: Recording | null;
  setRecording: (r: Recording | null) => void;
}) {
  useLang();
  const keymap = useSettings((s) => s.keymap);
  const setHotkey = useSettings((s) => s.setHotkey);
  const [find, setFind] = useState('');
  const q = find.trim().toLocaleLowerCase();
  const shown = useMemo(
    () =>
      HOTKEY_ACTIONS.filter((a) => {
        if (!q) return true;
        const keys = keymap[a.id]
          .split(',')
          .filter(Boolean)
          .map((c) => formatChord(c))
          .join(' ');
        return `${tr(a.label)} ${tr(a.hint)} ${keys}`.toLocaleLowerCase().includes(q);
      }),
    [q, keymap],
  );
  return (
    <Stack gap="xs">
      <TextInput
        size="xs"
        leftSection={<IconSearch size={14} />}
        placeholder={tr('Знайти дію чи клавішу')}
        aria-label={tr('Знайти дію чи клавішу')}
        value={find}
        onChange={(e) => setFind(e.currentTarget.value)}
      />
      {shown.length === 0 && (
        <Text size="xs" c="dimmed">
          {tr('Нічого не знайдено. Спробуйте інше слово.')}
        </Text>
      )}
      {HOTKEY_GROUPS.map((g) => {
        const rows = shown.filter((a) => groupOf(a.id) === g.id);
        if (!rows.length) return null;
        return (
          <Stack key={g.id} gap={6}>
            <Text size="xs" fw={600} c="dimmed" mt={4}>
              {tr(g.label)}
            </Text>
            {rows.map((a) => {
              const isRec = recording?.id === a.id;
              const chords = keymap[a.id].split(',').filter(Boolean);
              const customised = keymap[a.id] !== DEFAULT_KEYMAP[a.id];
              const conflicts = conflictsForAction(keymap, a.id);
              const where = whereItWorks(a);
              return (
                <Group key={a.id} justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <Text size="sm" fw={500} truncate>
                      {tr(a.label)}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {tr(a.hint)}
                    </Text>
                    {(where.inFields || where.appOnly) && (
                      <Text size="xs" c="dimmed">
                        {[
                          where.inFields ? tr('працює й у полі введення') : null,
                          where.appOnly ? tr('типово лише в застосунку') : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    )}
                    {conflicts.length > 0 && (
                      <Text size="xs" c="orange">
                        {tr('Конфлікт із «{actions}» — спрацюють разом', {
                          actions: conflicts.map(labelFor).join('», «'),
                        })}
                      </Text>
                    )}
                  </div>
                  <Group gap={4} wrap="wrap" justify="flex-end" style={{ maxWidth: '55%' }}>
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
                        {chords.length === 0 && (
                          <Text size="xs" c="dimmed">
                            {tr('без клавіші')}
                          </Text>
                        )}
                        {chords.map((c) => (
                          <Group key={c} gap={0} wrap="nowrap">
                            <Kbd>{formatChord(c)}</Kbd>
                            <Tooltip label={tr('Прибрати клавішу {key}', { key: formatChord(c) })}>
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="xs"
                                aria-label={tr('Прибрати клавішу {key}: {action}', {
                                  key: formatChord(c),
                                  action: tr(a.label),
                                })}
                                onClick={() => setHotkey(a.id, removeChord(keymap[a.id], c))}
                              >
                                <IconX size={12} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        ))}
                        <Tooltip label={tr('Додати клавішу')}>
                          <ActionIcon
                            variant="default"
                            size="sm"
                            onClick={() => setRecording({ id: a.id, add: true })}
                            aria-label={tr('Додати клавішу: {action}', { action: tr(a.label) })}
                          >
                            <IconPlus size={14} />
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
          </Stack>
        );
      })}
    </Stack>
  );
}

/**
 * Ready key sets and one's own as a file (1.24.0-beta.4): «Стандартний», «Як у PowerPoint»,
 * «Клікер»; «Зберегти набір у файл» / «Відкрити набір з файлу» (.vokeys.json, another computer).
 */
function KeySets() {
  useLang();
  const keymap = useSettings((s) => s.keymap);
  const apply = (next: Keymap) => {
    const st = useSettings.getState();
    for (const id of Object.keys(next) as HotkeyActionId[])
      if (next[id] !== st.keymap[id]) st.setHotkey(id, next[id]);
  };
  const save = () => {
    const blob = new Blob([JSON.stringify({ voKeys: 1, keymap }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'keys.vokeys.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const open = async (file: File | null) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as { voKeys?: number; keymap?: unknown };
      if (data.voKeys !== 1 || !data.keymap || typeof data.keymap !== 'object') throw new Error();
      apply(sanitizeKeymap(data.keymap, undefined, undefined, false));
      notifications.show({ message: tr('Набір клавіш відкрито'), color: 'green', autoClose: 1500 });
    } catch {
      notifications.show({
        message: tr('Це не файл набору клавіш (.vokeys.json)'),
        color: 'red',
      });
    }
  };
  return (
    <Stack gap={6}>
      <Select
        size="xs"
        label={tr('Набір клавіш')}
        description={tr('Готовий набір замінює всі клавіші; кожну потім можна змінити.')}
        placeholder={tr('Вибрати набір…')}
        data={KEY_SETS.map((k) => ({ value: k.id, label: tr(k.label) }))}
        value={null}
        onChange={(v) => {
          if (!v) return;
          apply(keySet(v as KeySet));
          const set = KEY_SETS.find((k) => k.id === v)!;
          notifications.show({
            message: `${tr(set.label)}: ${tr(set.hint)}`,
            color: 'green',
            autoClose: 3000,
          });
        }}
        comboboxProps={{ withinPortal: true }}
      />
      <Group gap="xs">
        <Button variant="default" size="xs" leftSection={<IconDownload size={14} />} onClick={save}>
          {tr('Зберегти набір у файл')}
        </Button>
        <FileButton onChange={(f) => void open(f)} accept=".json,application/json">
          {(props) => (
            <Button {...props} variant="default" size="xs" leftSection={<IconUpload size={14} />}>
              {tr('Відкрити набір з файлу')}
            </Button>
          )}
        </FileButton>
      </Group>
      <Button
        variant="subtle"
        color="gray"
        size="xs"
        leftSection={<IconRotateClockwise size={14} />}
        onClick={() => useSettings.getState().resetKeymap()}
      >
        {tr('Скинути всі клавіші')}
      </Button>
    </Stack>
  );
}
