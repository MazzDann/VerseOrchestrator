import { useState, type ReactNode } from 'react';
import { LANG_NAMES, LANGS, type Lang } from '@vo/shared';
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
import {
  useSettings,
  FONT_OPTIONS,
  type TextAlign,
  type PadUnit,
  type PadLink,
  type StrongSubline,
} from '../settingsStore';
import type { SlideTransition } from '../presenterBus';
import { fileToDownscaledDataUrl } from '../lib/image';
import { TemplateEditor } from './TemplateEditor';
import { HotkeysSettings } from './HotkeysSettings';
import { PresetsSection } from './PresetsSection';
import { DataSourceSection } from './DataSourceSection';
import { useRebuildLibrary } from '../lib/rebuild';
import { StandbySection } from './StandbySection';
import { UpdateSection } from './UpdateSection';
import { ShutdownSection } from './ShutdownSection';
import { ShortcutSection } from './ShortcutSection';
import { useEffectiveSource } from '../dataSourceStore';
import { useServer, NEEDS_SERVER } from '../serverStore';
import { openSettingsWindow } from '../openPresenter';
import { tr, useLang } from '../i18n';

const SECTIONS_KEY = 'vo:settingsSections';

/** Appearance controls for the projected screen. Persisted via the settings store. */
export function SettingsPanel({ onDetach }: { onDetach?: () => void } = {}) {
  const a = useSettings((s) => s.appearance);
  const set = useSettings((s) => s.setAppearance);
  const reset = useSettings((s) => s.resetAppearance);
  const template = useSettings((s) => s.slideTemplate);
  const dataSource = useEffectiveSource();
  const serverAvailable = useServer((s) => s.available);
  const placement = useSettings((s) => s.panelPlacement);
  const setPlacement = useSettings((s) => s.setPanelPlacement);
  const language = useLang();
  const setLanguage = useSettings((s) => s.setLanguage);
  const { rebuilding, rebuild: rebuildLibrary } = useRebuildLibrary();
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

  const fonts = FONT_OPTIONS.map((f) => ({ ...f, label: tr(f.label) }));
  const fontLabel = fonts.find((f) => f.value === a.scriptureFont)?.label ?? tr('власний');
  const templateLabel = template ? tr(template.name) : tr('класичний');
  const alignLabel = {
    left: tr('ліворуч'),
    center: tr('по центру'),
    right: tr('праворуч'),
  }[a.textAlign];
  /** a section's one-line summary: its parts, the empty ones left out */
  const summary = (...parts: (string | false)[]) => parts.filter(Boolean).join(', ');

  return (
    <Stack gap="sm" p="md">
      {!inSettingsWindow && (
        <Button
          variant="default"
          size="xs"
          leftSection={<IconExternalLink size={14} />}
          onClick={(e) => {
            // the window takes the panel's place and size; the panel goes (1.1.0)
            const panel = e.currentTarget.closest('[data-floating-panel]');
            void openSettingsWindow(panel?.getBoundingClientRect()).then((w) => {
              if (w) onDetach?.();
            });
          }}
        >
          {tr('Відкрити окремим вікном')}
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
        <Section value="presets" title={tr('Пресети')} summary={tr('готові набори вигляду')}>
          <PresetsSection />
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            leftSection={<IconRefresh size={14} />}
            onClick={reset}
          >
            {tr('Скинути вигляд до типового')}
          </Button>
        </Section>

        <Section
          value="text"
          title={tr('Текст')}
          summary={summary(
            fontLabel,
            alignLabel,
            a.transition === 'fast' && tr('швидкий перехід'),
            a.transition === 'none' && tr('без анімації'),
          )}
        >
          <Select
            label={tr('Шрифт')}
            data={fonts}
            value={a.scriptureFont}
            onChange={(v) => v && set({ scriptureFont: v })}
            allowDeselect={false}
          />
          <ColorInput
            label={tr('Колір')}
            value={a.textColor}
            onChange={(v) => set({ textColor: v })}
            format="hex"
            swatches={['#f4f4f6', '#ffffff', '#ffd966', '#a5b4fc', '#000000']}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              {tr('Вирівнювання')}
            </Text>
            <SegmentedControl
              fullWidth
              value={a.textAlign}
              onChange={(v) => set({ textAlign: v as TextAlign })}
              data={[
                { label: tr('Ліворуч'), value: 'left' },
                { label: tr('Центр'), value: 'center' },
                { label: tr('Праворуч'), value: 'right' },
              ]}
            />
          </div>
          <Switch
            label={tr('Показувати номери віршів')}
            checked={a.showVerseNumbers}
            onChange={(e) => set({ showVerseNumbers: e.currentTarget.checked })}
          />
          <div>
            <Text size="sm" fw={500} mb={2}>
              {tr('Перехід між слайдами')}
            </Text>
            <Text size="xs" c="dimmed" mb={6}>
              {tr(
                'Плавний: старий слайд згасає, новий проявляється (новий текст — за ~0,4 с). Швидкий: новий одразу, коротке проявлення. Без анімації: миттєва заміна.',
              )}
            </Text>
            <SegmentedControl
              fullWidth
              value={a.transition}
              onChange={(v) => set({ transition: v as SlideTransition })}
              data={[
                { label: tr('Плавний'), value: 'smooth' },
                { label: tr('Швидкий'), value: 'fast' },
                { label: tr('Без анімації'), value: 'none' },
              ]}
            />
          </div>
        </Section>

        <Section
          value="background"
          title={tr('Фон')}
          summary={a.bgImage ? tr('зображення') : a.bgColor}
        >
          <ColorInput
            label={tr('Колір фону')}
            value={a.bgColor}
            onChange={(v) => set({ bgColor: v })}
            format="hex"
            swatches={['#000000', '#0c0c14', '#1a1b2e', '#0b2545', '#2c2c2a']}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              {tr('Фонове зображення')}
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
                    {a.bgImage ? tr('Замінити') : tr('Завантажити')}
                  </Button>
                )}
              </FileButton>
              {a.bgImage && (
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => set({ bgImage: null })}
                  aria-label={tr('Прибрати фон')}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              )}
            </Group>
          </div>
        </Section>

        <Section
          value="layout"
          title={tr('Розкладка слайда')}
          summary={summary(
            templateLabel,
            tr('відступи {top}/{right}/{bottom}/{left} {unit}', {
              top: a.padTop,
              right: a.padRight,
              bottom: a.padBottom,
              left: a.padLeft,
              unit: a.padUnit,
            }),
          )}
        >
          <TemplateEditor />
          <div>
            <Group justify="space-between" mb={6} wrap="nowrap">
              <Text size="sm" fw={500}>
                {tr('Відступи від країв')}
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
                { label: tr('Усі разом'), value: 'all' },
                { label: tr('Верт./Гориз.'), value: 'axis' },
                { label: tr('Окремо'), value: 'none' },
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
              {padInput('padTop', tr('Відступ зверху'))}
              <span />
              {padInput('padLeft', tr('Відступ зліва'))}
              <div
                style={{
                  width: 38,
                  height: 24,
                  border: '1px dashed var(--mantine-color-default-border)',
                  borderRadius: 4,
                }}
              />
              {padInput('padRight', tr('Відступ справа'))}
              <span />
              {padInput('padBottom', tr('Відступ знизу'))}
              <span />
            </div>
          </div>
        </Section>

        <Section
          value="passages"
          title={tr('Довгі уривки')}
          summary={summary(
            a.versesPerSlide
              ? tr('по {n} на слайд', { n: a.versesPerSlide })
              : tr('усе на одному слайді'),
            a.reveal && tr('поступово'),
          )}
        >
          <NumberInput
            label={tr('Віршів на слайд')}
            description={tr('0 = увесь уривок на одному слайді; більше — розбивка на сторінки')}
            min={0}
            max={20}
            value={a.versesPerSlide}
            onChange={(v) => set({ versesPerSlide: Math.max(0, Math.trunc(Number(v) || 0)) })}
          />
          <div>
            <Switch
              label={tr('Прогресивне розкриття')}
              description={tr(
                'Уривок з’являється по одному віршу на кожен крок клікера (накопичення)',
              )}
              checked={a.reveal}
              onChange={(e) => set({ reveal: e.currentTarget.checked })}
            />
            {a.reveal && (
              <Stack gap={6} mt={8} pl="md">
                <Switch
                  size="sm"
                  label={tr('Прожектор')}
                  description={tr('Приглушувати показані вірші, яскравий лише поточний')}
                  checked={a.revealSpotlight}
                  onChange={(e) => set({ revealSpotlight: e.currentTarget.checked })}
                />
                <Switch
                  size="sm"
                  label={tr('Плейсхолдери')}
                  description={tr(
                    'Нерозкриті вірші видно ледь помітно (інакше — невидимі, місце збережено)',
                  )}
                  checked={a.revealPlaceholders}
                  onChange={(e) => set({ revealPlaceholders: e.currentTarget.checked })}
                />
              </Stack>
            )}
          </div>
        </Section>

        <Section
          value="highlight"
          title={tr('Виділення')}
          summary={a.redLetter ? tr('слова Ісуса кольором') : tr('без виділення слів Ісуса')}
        >
          <Switch
            label={tr('Слова Ісуса кольором')}
            checked={a.redLetter}
            onChange={(e) => set({ redLetter: e.currentTarget.checked })}
          />
          {a.redLetter && (
            <ColorInput
              label={tr('Колір слів Ісуса')}
              value={a.jesusColor}
              onChange={(v) => set({ jesusColor: v })}
              format="hex"
              swatches={['#ff6b6b', '#e03131', '#fa5252', '#ffa94d']}
            />
          )}
          <ColorInput
            label={tr('Колір виділеного слова (Стронг)')}
            value={a.highlightColor}
            onChange={(v) => set({ highlightColor: v })}
            format="hex"
            swatches={['#ffd43b', '#ffe066', '#a9e34b', '#74c0fc']}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              {tr('Текст Стронга на показі')}
            </Text>
            <SegmentedControl
              fullWidth
              value={a.strongSubline}
              onChange={(v) => set({ strongSubline: v as StrongSubline })}
              data={[
                { label: tr('Лема'), value: 'lemma' },
                { label: tr('Повністю'), value: 'full' },
              ]}
            />
          </div>
        </Section>

        <Section value="hotkeys" title={tr('Гарячі клавіші')} summary={tr('клавіші дій оператора')}>
          <HotkeysSettings />
        </Section>

        <Section
          value="app"
          title={tr('Застосунок')}
          summary={summary(
            LANG_NAMES[language],
            dataSource === 'local' ? tr('дані в браузері') : tr('дані з сервера'),
            placement === 'aside' ? tr('прев’ю праворуч') : tr('прев’ю внизу'),
          )}
        >
          <div>
            {/* named in both languages while it's Ukrainian: whoever reads only English finds it */}
            <Text size="sm" fw={500} mb={4}>
              {tr('Мова інтерфейсу')}
              {language === 'uk' ? ' · Interface language' : ''}
            </Text>
            <SegmentedControl
              fullWidth
              value={language}
              onChange={(v) => setLanguage(v as Lang)}
              data={LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))}
            />
          </div>
          {inSettingsWindow ? (
            <Text size="xs" c="dimmed">
              {tr('Джерело даних налаштовується в головному вікні керування.')}
            </Text>
          ) : (
            <DataSourceSection />
          )}
          <div>
            <Text size="sm" fw={500} mb={4}>
              {tr('Розташування панелі прев’ю')}
            </Text>
            <SegmentedControl
              fullWidth
              value={placement}
              onChange={(v) => setPlacement(v as 'aside' | 'bottom')}
              data={[
                { label: tr('Праворуч'), value: 'aside' },
                { label: tr('Унизу центру'), value: 'bottom' },
              ]}
            />
          </div>
          <div>
            <Text size="sm" fw={500} mb={2}>
              {tr('Бібліотека модулів')}
            </Text>
            <Text size="xs" c="dimmed" mb={8}>
              {tr('Перебудувати з папок modules/ і songs/ після додавання перекладу чи пісні.')}
            </Text>
            <Button
              variant="light"
              fullWidth
              leftSection={<IconDatabaseImport size={16} />}
              loading={rebuilding}
              disabled={serverAvailable === false}
              title={serverAvailable === false ? tr(NEEDS_SERVER) : undefined}
              onClick={rebuildLibrary}
            >
              {tr('Пересканувати модулі')}
            </Button>
          </div>
          <UpdateSection />
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
