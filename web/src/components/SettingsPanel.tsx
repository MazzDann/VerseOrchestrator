import {
  Stack,
  Select,
  ColorInput,
  SegmentedControl,
  Switch,
  Slider,
  Button,
  Text,
  Group,
  FileButton,
  ActionIcon,
} from '@mantine/core';
import { IconUpload, IconTrash, IconRefresh } from '@tabler/icons-react';
import { useSettings, FONT_OPTIONS, type TextAlign } from '../settingsStore';
import { fileToDownscaledDataUrl } from '../lib/image';

/** Appearance controls for the projected screen. Persisted via the settings store. */
export function SettingsPanel() {
  const a = useSettings((s) => s.appearance);
  const set = useSettings((s) => s.setAppearance);
  const reset = useSettings((s) => s.resetAppearance);
  const placement = useSettings((s) => s.panelPlacement);
  const setPlacement = useSettings((s) => s.setPanelPlacement);

  // When linked, moving either axis sets both so the inset stays uniform.
  const setPad = (axis: 'padX' | 'padY', value: number) => {
    if (a.padLinked) set({ padX: value, padY: value });
    else if (axis === 'padX') set({ padX: value });
    else set({ padY: value });
  };

  return (
    <Stack gap="md" p="md">
      <div>
        <Text size="sm" fw={500} mb={4}>
          Розташування панелей
        </Text>
        <SegmentedControl
          fullWidth
          value={placement}
          onChange={(v) => setPlacement(v as 'aside' | 'bottom')}
          data={[
            { label: 'Праворуч', value: 'aside' },
            { label: 'Унизу центру', value: 'bottom' },
          ]}
        />
      </div>
      <Select
        label="Шрифт тексту"
        data={FONT_OPTIONS}
        value={a.scriptureFont}
        onChange={(v) => v && set({ scriptureFont: v })}
        allowDeselect={false}
      />
      <div>
        <Text size="sm" fw={500} mb={4}>
          Вирівнювання
        </Text>
        <SegmentedControl
          fullWidth
          value={a.textAlign}
          onChange={(v) => set({ textAlign: v as TextAlign })}
          data={[
            { label: 'Ліворуч', value: 'left' },
            { label: 'Центр', value: 'center' },
            { label: 'Праворуч', value: 'right' },
          ]}
        />
      </div>
      <div>
        <Group justify="space-between" mb={4} wrap="nowrap">
          <Text size="sm" fw={500}>
            Відступи від країв
          </Text>
          <Switch
            size="xs"
            label="Зв'язати"
            checked={a.padLinked}
            onChange={(e) =>
              set(
                e.currentTarget.checked
                  ? { padLinked: true, padY: a.padX }
                  : { padLinked: false },
              )
            }
          />
        </Group>
        <Text size="xs" c="dimmed" mb={2}>
          Горизонталь (ліво/право): {a.padX}%
        </Text>
        <Slider
          min={0}
          max={20}
          step={1}
          value={a.padX}
          onChange={(v) => setPad('padX', v)}
          label={(v) => `${v}%`}
        />
        <Text size="xs" c="dimmed" mt={8} mb={2}>
          Вертикаль (верх/низ): {a.padY}%
        </Text>
        <Slider
          min={0}
          max={20}
          step={1}
          value={a.padY}
          onChange={(v) => setPad('padY', v)}
          label={(v) => `${v}%`}
        />
      </div>
      <ColorInput
        label="Колір тексту"
        value={a.textColor}
        onChange={(v) => set({ textColor: v })}
        format="hex"
        swatches={['#f4f4f6', '#ffffff', '#ffd966', '#a5b4fc', '#000000']}
      />
      <ColorInput
        label="Колір фону"
        value={a.bgColor}
        onChange={(v) => set({ bgColor: v })}
        format="hex"
        swatches={['#000000', '#0c0c14', '#1a1b2e', '#0b2545', '#2c2c2a']}
      />
      <div>
        <Text size="sm" fw={500} mb={4}>
          Фонове зображення
        </Text>
        <Group gap="xs">
          <FileButton
            accept="image/png,image/jpeg,image/webp"
            onChange={async (f) => {
              if (!f) return;
              try {
                set({ bgImage: await fileToDownscaledDataUrl(f) });
              } catch {
                /* ignore unreadable image */
              }
            }}
          >
            {(props) => (
              <Button {...props} variant="light" size="xs" leftSection={<IconUpload size={16} />}>
                {a.bgImage ? 'Замінити' : 'Завантажити'}
              </Button>
            )}
          </FileButton>
          {a.bgImage && (
            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => set({ bgImage: null })}
              aria-label="Прибрати фон"
            >
              <IconTrash size={16} />
            </ActionIcon>
          )}
        </Group>
      </div>
      <Switch
        label="Показувати номери віршів"
        checked={a.showVerseNumbers}
        onChange={(e) => set({ showVerseNumbers: e.currentTarget.checked })}
      />
      <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={reset}>
        Скинути вигляд
      </Button>
    </Stack>
  );
}
