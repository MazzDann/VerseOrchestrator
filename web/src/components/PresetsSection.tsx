import { useEffect, useState } from 'react';
import {
  Stack,
  Group,
  Button,
  ActionIcon,
  TextInput,
  Tooltip,
  Box,
  ScrollArea,
  FileButton,
  Divider,
} from '@mantine/core';
import {
  IconDeviceFloppy,
  IconTrash,
  IconDownload,
  IconUpload,
  IconBuildingStore,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useSettings, coercePreset, presetToFile, type AppearancePreset } from '../settingsStore';
import { tr, useLang } from '../i18n';

interface BuiltIn {
  file: string;
  name: string;
  /** the name in other interface languages (0.11.1), e.g. `{ "en": "Classic (serif)" }` */
  names?: Record<string, string>;
}

const safeFileName = (name: string) =>
  name
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'preset';

/**
 * Appearance presets: save the current look + layout as a named preset, apply it,
 * and share it as a file (export/import). Built-in starter presets are served from
 * `public/presets/` (add a .json there + list it in index.json to ship more).
 */
export function PresetsSection() {
  const presets = useSettings((s) => s.presets);
  const savePreset = useSettings((s) => s.savePreset);
  const applyPreset = useSettings((s) => s.applyPreset);
  const applyPresetData = useSettings((s) => s.applyPresetData);
  const deletePreset = useSettings((s) => s.deletePreset);
  const importPreset = useSettings((s) => s.importPreset);

  const [name, setName] = useState('');
  const [builtIns, setBuiltIns] = useState<BuiltIn[]>([]);
  const lang = useLang();
  const builtInName = (b: BuiltIn) => b.names?.[lang] ?? b.name;

  useEffect(() => {
    fetch('/presets/index.json')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (Array.isArray(list)) {
          setBuiltIns(
            list.filter((x) => x && typeof x.file === 'string' && typeof x.name === 'string'),
          );
        }
      })
      .catch(() => setBuiltIns([]));
  }, []);

  const save = () => {
    if (!name.trim()) return;
    savePreset(name);
    notifications.show({
      message: tr('Пресет збережено: {name}', { name: name.trim() }),
      color: 'green',
      autoClose: 1500,
    });
    setName('');
  };

  const exportPreset = (p: AppearancePreset) => {
    const blob = new Blob([JSON.stringify(presetToFile(p), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileName(p.name)}.vop.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFromFile = async (file: File | null) => {
    if (!file) return;
    try {
      const preset = coercePreset(JSON.parse(await file.text()), file.name.replace(/\.[^.]+$/, ''));
      if (!preset) throw new Error('bad');
      const n = importPreset(preset);
      notifications.show({
        message: tr('Пресет застосовано: {name}', { name: n }),
        color: 'green',
        autoClose: 1500,
      });
    } catch {
      notifications.show({ message: tr('Не вдалося прочитати файл пресету'), color: 'red' });
    }
  };

  const applyBuiltIn = async (b: BuiltIn) => {
    try {
      const res = await fetch(`/presets/${b.file}`);
      if (!res.ok) throw new Error('fetch');
      const preset = coercePreset(await res.json(), b.name);
      if (!preset) throw new Error('bad');
      applyPresetData(preset); // apply only — built-ins aren't copied into the library
      notifications.show({
        message: tr('Пресет застосовано: {name}', { name: builtInName(b) }),
        color: 'green',
        autoClose: 1500,
      });
    } catch {
      notifications.show({ message: tr('Не вдалося завантажити пресет'), color: 'red' });
    }
  };

  return (
    <div>
      {/* Titled by the «Пресети» settings section that hosts it. */}
      <Group gap="xs" wrap="nowrap" mb="xs">
        <TextInput
          size="xs"
          flex={1}
          placeholder={tr('Назва пресету')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        <Button
          size="xs"
          variant="light"
          leftSection={<IconDeviceFloppy size={14} />}
          disabled={!name.trim()}
          onClick={save}
        >
          {tr('Зберегти')}
        </Button>
        <FileButton accept="application/json,.json" onChange={importFromFile}>
          {(props) => (
            <Tooltip label={tr('Імпортувати пресет із файлу')}>
              <ActionIcon {...props} variant="default" size="lg" aria-label={tr('Імпорт пресету')}>
                <IconUpload size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </FileButton>
      </Group>

      {presets.length > 0 && (
        <ScrollArea.Autosize mah={170} mb="xs">
          <Stack gap={2}>
            {presets.map((p) => (
              <Group key={p.name} gap={4} wrap="nowrap">
                <Button
                  variant="subtle"
                  color="gray"
                  size="compact-sm"
                  justify="flex-start"
                  style={{ flex: 1, minWidth: 0 }}
                  styles={{ label: { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                  onClick={() => applyPreset(p.name)}
                >
                  {p.name}
                </Button>
                <Tooltip label={tr('Експортувати у файл')}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    onClick={() => exportPreset(p)}
                    aria-label={tr('Експорт {name}', { name: p.name })}
                  >
                    <IconDownload size={14} />
                  </ActionIcon>
                </Tooltip>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  onClick={() => deletePreset(p.name)}
                  aria-label={tr('Видалити {name}', { name: p.name })}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}

      {builtIns.length > 0 && (
        <>
          <Divider
            my={6}
            label={
              <Group gap={4}>
                <IconBuildingStore size={12} />
                <span>{tr('Вбудовані')}</span>
              </Group>
            }
          />
          <Box>
            <Group gap={6}>
              {builtIns.map((b) => (
                <Button
                  key={b.file}
                  size="compact-xs"
                  variant="default"
                  onClick={() => applyBuiltIn(b)}
                >
                  {builtInName(b)}
                </Button>
              ))}
            </Group>
          </Box>
        </>
      )}
    </div>
  );
}
