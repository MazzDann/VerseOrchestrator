import { useState } from 'react';
import {
  Stack,
  Select,
  ColorInput,
  SegmentedControl,
  Switch,
  NumberInput,
  Button,
  Text,
  Group,
  FileButton,
  ActionIcon,
  Divider,
} from '@mantine/core';
import { IconUpload, IconTrash, IconRefresh, IconDatabaseImport } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import {
  useSettings,
  FONT_OPTIONS,
  type TextAlign,
  type PadUnit,
  type PadLink,
  type StrongSubline,
} from '../settingsStore';
import { api } from '../api';
import { fileToDownscaledDataUrl } from '../lib/image';
import { TemplateEditor } from './TemplateEditor';
import { HotkeysSettings } from './HotkeysSettings';
import { PresetsSection } from './PresetsSection';

/** Appearance controls for the projected screen. Persisted via the settings store. */
export function SettingsPanel() {
  const a = useSettings((s) => s.appearance);
  const set = useSettings((s) => s.setAppearance);
  const reset = useSettings((s) => s.resetAppearance);
  const placement = useSettings((s) => s.panelPlacement);
  const setPlacement = useSettings((s) => s.setPanelPlacement);
  const queryClient = useQueryClient();
  const [rebuilding, setRebuilding] = useState(false);

  // Re-run the builder, then refresh all queries so new translations/songs appear.
  const rebuildLibrary = async () => {
    setRebuilding(true);
    try {
      await api.rebuild();
      await queryClient.invalidateQueries();
      notifications.show({ message: 'Бібліотеку оновлено', color: 'green' });
    } catch (e) {
      notifications.show({ message: `Не вдалося: ${(e as Error).message}`, color: 'red' });
    } finally {
      setRebuilding(false);
    }
  };

  const padMax = a.padUnit === '%' ? 25 : 400;
  // Respect the link mode: all four together / vertical+horizontal pairs / independent.
  const setSide = (side: 'padTop' | 'padRight' | 'padBottom' | 'padLeft', value: number) => {
    const v = Number.isFinite(value) ? Math.max(0, value) : 0;
    if (a.padLink === 'all') set({ padTop: v, padRight: v, padBottom: v, padLeft: v });
    else if (a.padLink === 'axis') {
      if (side === 'padTop' || side === 'padBottom') set({ padTop: v, padBottom: v });
      else set({ padLeft: v, padRight: v });
    } else if (side === 'padTop') set({ padTop: v });
    else if (side === 'padRight') set({ padRight: v });
    else if (side === 'padBottom') set({ padBottom: v });
    else set({ padLeft: v });
  };
  const padInput = (side: 'padTop' | 'padRight' | 'padBottom' | 'padLeft', label: string) => (
    <NumberInput
      size="xs"
      w={72}
      min={0}
      max={padMax}
      value={a[side]}
      onChange={(v) => setSide(side, Number(v))}
      hideControls
      aria-label={label}
    />
  );

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
      <div>
        <Text size="sm" fw={500} mb={4}>
          Шаблон показу
        </Text>
        <TemplateEditor />
      </div>
      <Divider />
      <PresetsSection />
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
        <Group justify="space-between" mb={6} wrap="nowrap">
          <Text size="sm" fw={500}>
            Відступи від країв
          </Text>
          <SegmentedControl
            size="xs"
            value={a.padUnit}
            onChange={(v) => set({ padUnit: v as PadUnit })}
            data={[
              { label: '%', value: '%' },
              { label: 'px', value: 'px' },
            ]}
          />
        </Group>
        <SegmentedControl
          fullWidth
          size="xs"
          mb={8}
          value={a.padLink}
          onChange={(v) => set({ padLink: v as PadLink })}
          data={[
            { label: 'Усі разом', value: 'all' },
            { label: 'Верт./Гориз.', value: 'axis' },
            { label: 'Окремо', value: 'none' },
          ]}
        />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
            alignItems: 'center',
            justifyItems: 'center',
          }}
        >
          <span />
          {padInput('padTop', 'Відступ зверху')}
          <span />
          {padInput('padLeft', 'Відступ зліва')}
          <div
            style={{
              width: 38,
              height: 24,
              border: '1px dashed var(--mantine-color-default-border)',
              borderRadius: 4,
            }}
          />
          {padInput('padRight', 'Відступ справа')}
          <span />
          {padInput('padBottom', 'Відступ знизу')}
          <span />
        </div>
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
      <NumberInput
        label="Віршів на слайд"
        description="0 = увесь уривок на одному слайді; більше — розбивка на сторінки (← → / PageUp–PageDown)"
        min={0}
        max={20}
        value={a.versesPerSlide}
        onChange={(v) => set({ versesPerSlide: Math.max(0, Math.trunc(Number(v) || 0)) })}
      />
      <div>
        <Switch
          label="Прогресивне розкриття"
          description="Уривок з'являється по одному вірша на кожен крок клікера (накопичення)"
          checked={a.reveal}
          onChange={(e) => set({ reveal: e.currentTarget.checked })}
        />
        {a.reveal && (
          <Stack gap={6} mt={8} pl="md">
            <Switch
              size="sm"
              label="Прожектор"
              description="Приглушувати показані вірші, яскравий лише поточний"
              checked={a.revealSpotlight}
              onChange={(e) => set({ revealSpotlight: e.currentTarget.checked })}
            />
            <Switch
              size="sm"
              label="Плейсхолдери"
              description="Нерозкриті вірші видно ледь помітно (інакше — невидимі, місце збережено)"
              checked={a.revealPlaceholders}
              onChange={(e) => set({ revealPlaceholders: e.currentTarget.checked })}
            />
          </Stack>
        )}
      </div>
      <div>
        <Text size="sm" fw={500} mb={4}>
          Текст Стронга на показі
        </Text>
        <SegmentedControl
          fullWidth
          value={a.strongSubline}
          onChange={(v) => set({ strongSubline: v as StrongSubline })}
          data={[
            { label: 'Лема', value: 'lemma' },
            { label: 'Повністю', value: 'full' },
          ]}
        />
      </div>
      <Switch
        label="Слова Ісуса червоним"
        checked={a.redLetter}
        onChange={(e) => set({ redLetter: e.currentTarget.checked })}
      />
      {a.redLetter && (
        <ColorInput
          label="Колір слів Ісуса"
          value={a.jesusColor}
          onChange={(v) => set({ jesusColor: v })}
          format="hex"
          swatches={['#ff6b6b', '#e03131', '#fa5252', '#ffa94d']}
        />
      )}
      <ColorInput
        label="Колір виділеного слова (Стронг)"
        value={a.highlightColor}
        onChange={(v) => set({ highlightColor: v })}
        format="hex"
        swatches={['#ffd43b', '#ffe066', '#a9e34b', '#74c0fc']}
      />
      <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={reset}>
        Скинути вигляд
      </Button>
      <Divider />
      <div>
        <Text size="sm" fw={500} mb={6}>
          Гарячі клавіші
        </Text>
        <HotkeysSettings />
      </div>
      <Divider />
      <div>
        <Text size="sm" fw={500} mb={2}>
          Бібліотека модулів
        </Text>
        <Text size="xs" c="dimmed" mb={8}>
          Перебудувати з теки modules/ після додавання перекладу чи пісні.
        </Text>
        <Button
          variant="light"
          color="blue"
          fullWidth
          leftSection={<IconDatabaseImport size={16} />}
          loading={rebuilding}
          onClick={rebuildLibrary}
        >
          Пересканувати модулі
        </Button>
      </div>
    </Stack>
  );
}
