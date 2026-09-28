import { useState, type ReactNode } from 'react';
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
  Accordion,
} from '@mantine/core';
import {
  IconUpload,
  IconTrash,
  IconRefresh,
  IconDatabaseImport,
  IconExternalLink,
} from '@tabler/icons-react';
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
import type { SlideTransition } from '../presenterBus';
import { api } from '../api';
import { fileToDownscaledDataUrl } from '../lib/image';
import { TemplateEditor } from './TemplateEditor';
import { HotkeysSettings } from './HotkeysSettings';
import { PresetsSection } from './PresetsSection';
import { DataSourceSection } from './DataSourceSection';
import { StandbySection } from './StandbySection';
import { ShutdownSection } from './ShutdownSection';
import { ShortcutSection } from './ShortcutSection';
import { useEffectiveSource } from '../dataSourceStore';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { openSettingsWindow } from '../openPresenter';

const SECTIONS_KEY = 'vo:settingsSections';

/** Appearance controls for the projected screen. Persisted via the settings store. */
export function SettingsPanel() {
  const a = useSettings((s) => s.appearance);
  const set = useSettings((s) => s.setAppearance);
  const reset = useSettings((s) => s.resetAppearance);
  const template = useSettings((s) => s.slideTemplate);
  const dataSource = useEffectiveSource();
  const serverAvailable = useServer((s) => s.available);
  const placement = useSettings((s) => s.panelPlacement);
  const setPlacement = useSettings((s) => s.setPanelPlacement);
  const queryClient = useQueryClient();
  const [rebuilding, setRebuilding] = useState(false);
  // Which groups are expanded — a per-viewer convenience, remembered locally.
  const [openSections, setOpenSectionsState] = useState<string[]>(() => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? 'null');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : ['text'];
    } catch {
      return ['text'];
    }
  });
  const setOpenSections = (v: string[]) => {
    setOpenSectionsState(v);
    try {
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(v));
    } catch {
      /* storage unavailable — keep in memory */
    }
  };

  // Re-run the builder, then refresh all queries so new translations/songs appear.
  const rebuildLibrary = async () => {
    setRebuilding(true);
    try {
      await api.rebuild();
      await queryClient.invalidateQueries();
      notifications.show({ message: 'Бібліотеку оновлено', color: 'green' });
    } catch (e) {
      notifications.show({
        message: `Не вдалося перебудувати бібліотеку: ${(e as Error).message}`,
        color: 'red',
      });
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

  const inSettingsWindow =
    typeof window !== 'undefined' && window.location.pathname === '/settings';

  const fontLabel = FONT_OPTIONS.find((f) => f.value === a.scriptureFont)?.label ?? 'власний';
  const templateLabel = template?.name ?? 'класичний';
  const alignLabel = { left: 'ліворуч', center: 'по центру', right: 'праворуч' }[a.textAlign];

  return (
    <Stack gap="sm" p="md">
      {!inSettingsWindow && (
        <Button
          variant="default"
          size="xs"
          leftSection={<IconExternalLink size={14} />}
          onClick={() => void openSettingsWindow()}
        >
          Відкрити окремим вікном
        </Button>
      )}
      <Accordion
        multiple
        value={openSections}
        onChange={setOpenSections}
        variant="default"
        chevronPosition="right"
        styles={{ content: { paddingInline: 0 }, control: { paddingInline: 0 } }}
      >
        <Section value="presets" title="Пресети" summary="готові набори вигляду">
          <PresetsSection />
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            leftSection={<IconRefresh size={14} />}
            onClick={reset}
          >
            Скинути вигляд до типового
          </Button>
        </Section>

        <Section
          value="text"
          title="Текст"
          summary={`${fontLabel}, ${alignLabel}${a.transition === 'fast' ? ', швидкий перехід' : a.transition === 'none' ? ', без анімації' : ''}`}
        >
          <Select
            label="Шрифт"
            data={FONT_OPTIONS}
            value={a.scriptureFont}
            onChange={(v) => v && set({ scriptureFont: v })}
            allowDeselect={false}
          />
          <ColorInput
            label="Колір"
            value={a.textColor}
            onChange={(v) => set({ textColor: v })}
            format="hex"
            swatches={['#f4f4f6', '#ffffff', '#ffd966', '#a5b4fc', '#000000']}
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
          <Switch
            label="Показувати номери віршів"
            checked={a.showVerseNumbers}
            onChange={(e) => set({ showVerseNumbers: e.currentTarget.checked })}
          />
          <div>
            <Text size="sm" fw={500} mb={2}>
              Перехід між слайдами
            </Text>
            <Text size="xs" c="dimmed" mb={6}>
              Плавний: старий слайд згасає, новий проявляється (новий текст — за ~0,4 с). Швидкий:
              новий одразу, коротке проявлення. Без анімації: миттєва заміна.
            </Text>
            <SegmentedControl
              fullWidth
              value={a.transition}
              onChange={(v) => set({ transition: v as SlideTransition })}
              data={[
                { label: 'Плавний', value: 'smooth' },
                { label: 'Швидкий', value: 'fast' },
                { label: 'Без анімації', value: 'none' },
              ]}
            />
          </div>
        </Section>

        <Section value="background" title="Фон" summary={a.bgImage ? 'зображення' : a.bgColor}>
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
                  <Button
                    {...props}
                    variant="light"
                    size="xs"
                    leftSection={<IconUpload size={16} />}
                  >
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
        </Section>

        <Section
          value="layout"
          title="Розкладка слайда"
          summary={`${templateLabel}, відступи ${a.padTop}/${a.padRight}/${a.padBottom}/${a.padLeft} ${a.padUnit}`}
        >
          <TemplateEditor />
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
        </Section>

        <Section
          value="passages"
          title="Довгі уривки"
          summary={
            (a.versesPerSlide ? `по ${a.versesPerSlide} на слайд` : 'усе на одному слайді') +
            (a.reveal ? ', поступово' : '')
          }
        >
          <NumberInput
            label="Віршів на слайд"
            description="0 = увесь уривок на одному слайді; більше — розбивка на сторінки"
            min={0}
            max={20}
            value={a.versesPerSlide}
            onChange={(v) => set({ versesPerSlide: Math.max(0, Math.trunc(Number(v) || 0)) })}
          />
          <div>
            <Switch
              label="Прогресивне розкриття"
              description="Уривок з’являється по одному віршу на кожен крок клікера (накопичення)"
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
        </Section>

        <Section
          value="highlight"
          title="Виділення"
          summary={a.redLetter ? 'слова Ісуса кольором' : 'без виділення слів Ісуса'}
        >
          <Switch
            label="Слова Ісуса кольором"
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
        </Section>

        <Section value="hotkeys" title="Гарячі клавіші" summary="клавіші дій оператора">
          <HotkeysSettings />
        </Section>

        <Section
          value="app"
          title="Застосунок"
          summary={`${dataSource === 'local' ? 'дані в браузері' : 'дані з сервера'}, ${placement === 'aside' ? 'прев’ю праворуч' : 'прев’ю внизу'}`}
        >
          {inSettingsWindow ? (
            <Text size="xs" c="dimmed">
              Джерело даних налаштовується в головному вікні керування.
            </Text>
          ) : (
            <DataSourceSection />
          )}
          <div>
            <Text size="sm" fw={500} mb={4}>
              Розташування панелі прев’ю
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
            <Text size="sm" fw={500} mb={2}>
              Бібліотека модулів
            </Text>
            <Text size="xs" c="dimmed" mb={8}>
              Перебудувати з папок modules/ і songs/ після додавання перекладу чи пісні.
            </Text>
            <Button
              variant="light"
              fullWidth
              leftSection={<IconDatabaseImport size={16} />}
              loading={rebuilding}
              disabled={serverAvailable === false}
              title={serverAvailable === false ? NEEDS_SERVER : undefined}
              onClick={rebuildLibrary}
            >
              Пересканувати модулі
            </Button>
          </div>
          <StandbySection active={openSections.includes('app')} />
          <ShortcutSection />
          <ShutdownSection />
        </Section>
      </Accordion>
      <Text size="xs" c="dimmed" ta="center">
        VerseOrchestrator v{__APP_VERSION__}
      </Text>
    </Stack>
  );
}

/** One collapsible settings group: title + a dimmed one-line summary of current values. */
function Section({
  value,
  title,
  summary,
  children,
}: {
  value: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <Accordion.Item value={value}>
      <Accordion.Control>
        <Text size="sm" fw={600}>
          {title}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {summary}
        </Text>
      </Accordion.Control>
      <Accordion.Panel>
        <Stack gap="md" pb="xs">
          {children}
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  );
}
