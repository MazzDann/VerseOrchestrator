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
  Textarea,
} from '@mantine/core';
import {
  IconUpload,
  IconTrash,
  IconRefresh,
  IconDatabaseImport,
  IconExternalLink,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import {
  useSettings,
  setAppearanceImage,
  FONT_OPTIONS,
  videoEndOf,
  videoPhonesOf,
  type TextAlign,
  type PadUnit,
  type PadLink,
  type StrongSubline,
  type SearchPlace,
} from '../settingsStore';
import type { SlideTransition } from '../presenterBus';
import { fileToDownscaledDataUrl, fileToLogoDataUrl } from '../lib/image';
import { warmAudio } from '../lib/countdownSound';
import {
  WARN_MINUTES,
  type CaptionAt,
  type CornerAt,
  type CornerSize,
  type TimerFont,
  type TimerFormat,
  type TimerSize,
} from '../lib/countdown';
import { TemplateEditor } from './TemplateEditor';
import { HotkeysSettings } from './HotkeysSettings';
import { PresetsSection } from './PresetsSection';
import { DataSourceSection } from './DataSourceSection';
import { useRebuildLibrary } from '../lib/rebuild';
import { StandbySection } from './StandbySection';
import { UpdateSection } from './UpdateSection';
import { BackupSection } from './BackupSection';
import { FeedbackSection } from './FeedbackSection';
import { ShutdownSection } from './ShutdownSection';
import { ShortcutSection } from './ShortcutSection';
import { BrowserSection } from './BrowserSection';
import { useEffectiveSource } from '../dataSourceStore';
import { useServer, NEEDS_SERVER, versionHeading } from '../serverStore';
import { openSettingsWindow } from '../openPresenter';
import { tr, useLang } from '../i18n';
import { formatCombo } from '../hotkeys';

const SECTIONS_KEY = 'vo:settingsSections';

/** Appearance controls for the projected screen. Persisted via the settings store. */
export function SettingsPanel({ onDetach }: { onDetach?: () => void } = {}) {
  const a = useSettings((s) => s.appearance);
  const set = useSettings((s) => s.setAppearance);
  const search = useSettings((s) => s.search);
  const setSearch = useSettings((s) => s.setSearch);
  const keymapCover = useSettings((s) => s.keymap.cover);
  const reset = useSettings((s) => s.resetAppearance);
  const template = useSettings((s) => s.slideTemplate);
  const dataSource = useEffectiveSource();
  const serverAvailable = useServer((s) => s.available);
  // the version at the top (2026-10-01): a git checkout by its label, «dev 1.4.2.try7 (mac-test ·
  // 20dd850)», so a test build is told from the release it grew from
  const devLabel = useServer((s) => s.devLabel);
  const placement = useSettings((s) => s.panelPlacement);
  const setPlacement = useSettings((s) => s.setPanelPlacement);
  const simpleView = useSettings((s) => s.simpleView);
  const setSimpleView = useSettings((s) => s.setSimpleView);
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

  // A picked image (1.4.1): one the browser can't read — an iPhone's HEIC in Chrome, a renamed
  // file — says so (it was dropped without a word); one the settings can't store is taken back
  // at once, so every later change still saves (the notice: useSettingsSaveNotice).
  const putImage = async (
    field: 'coverImage' | 'bgImage',
    file: File | null,
    read: (f: File) => Promise<string>,
  ) => {
    if (!file) return;
    let data: string;
    try {
      data = await read(file);
    } catch {
      notifications.show({
        color: 'red',
        title: tr('Не вдалося прочитати зображення'),
        message: tr(
          'Виберіть файл PNG, JPEG або WebP. Фото HEIC з iPhone спершу збережіть як JPEG',
        ),
      });
      return;
    }
    setAppearanceImage(field, data);
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
      {/* the /settings window shows it in its own header (pages/Settings.tsx) */}
      {!inSettingsWindow && (
        <Text size="xs" c="dimmed">
          {versionHeading(devLabel, __APP_VERSION__)}
        </Text>
      )}
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
          value="cover"
          title={tr('Заставка')}
          summary={
            a.coverImage || a.coverText.trim()
              ? summary(a.coverImage ? tr('логотип') : '', a.coverText.trim() ? tr('текст') : '')
              : tr('порожня — лише фон')
          }
        >
          <Text size="xs" c="dimmed">
            {tr(
              'Між елементами показу: логотип і рядок тексту на фоні слайда. Клавіша {key} чи кнопка «Заставка» вгорі показує її; ще раз — повертає те, що було.',
              { key: formatCombo(keymapCover) },
            )}
          </Text>
          <Textarea
            label={tr('Текст заставки')}
            placeholder={tr('Наприклад, назва зібрання')}
            value={a.coverText}
            onChange={(e) => set({ coverText: e.currentTarget.value.slice(0, 300) })}
            autosize
            minRows={1}
            maxRows={3}
            size="sm"
          />
          <div>
            <Text size="sm" fw={500} mb={2}>
              {tr('Логотип')}
            </Text>
            {/* it fills a share of the slide (1.4.1), so a small file comes out soft */}
            <Text size="xs" c="dimmed" mb={6}>
              {tr('PNG, JPEG або WebP; для чіткого показу — від 1600 пікселів по довшому боці.')}
            </Text>
            <Group gap="xs">
              <FileButton
                accept="image/png,image/jpeg,image/webp"
                onChange={(f) => void putImage('coverImage', f, fileToLogoDataUrl)}
              >
                {(props) => (
                  <Button
                    {...props}
                    variant="light"
                    size="xs"
                    leftSection={<IconUpload size={16} />}
                  >
                    {a.coverImage ? tr('Замінити') : tr('Завантажити')}
                  </Button>
                )}
              </FileButton>
              {a.coverImage && (
                <ActionIcon
                  variant="subtle"
                  color="red"
                  onClick={() => set({ coverImage: null })}
                  aria-label={tr('Прибрати логотип')}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              )}
            </Group>
          </div>
        </Section>

        {/* «Відлік» (1.8.2): the time's colours — a warning before the end, another past it */}
        <Section
          value="countdown"
          title={tr('Відлік')}
          summary={
            summary(
              a.countdownWarnMinutes > 0 &&
                tr('попередження за {n} хв', { n: a.countdownWarnMinutes }),
              a.countdownOverOn && tr('колір після нуля'),
              a.countdownBeeps && tr('звук'),
              (a.countdownSize !== 'md' ||
                a.countdownFont !== 'text' ||
                a.countdownFormat !== 'clock' ||
                a.countdownCaptionAt !== 'above' ||
                a.countdownCorner !== 'tr' ||
                a.countdownCornerSize !== 'md') &&
                tr('свій вигляд часу'),
            ) || tr('звичайний вигляд')
          }
        >
          <Text size="xs" c="dimmed">
            {tr(
              'Час відліку на екрані, у «Сцені» й на телефонах змінює колір перед кінцем і після нуля.',
            )}
          </Text>
          <Text size="xs" c="dimmed">
            {tr('Тут — те, що бачать глядачі. Таймер доповідача має свій розділ нижче.')}
          </Text>
          <Switch
            label={tr('Звук останніх 5 секунд')}
            description={tr(
              '5, 4, 3, 2, 1 — короткий звук, на нулі — довший; грає вікно керування',
            )}
            checked={a.countdownBeeps}
            onChange={(e) => {
              set({ countdownBeeps: e.currentTarget.checked });
              if (e.currentTarget.checked) warmAudio();
            }}
          />
          <Select
            label={tr('Попередження')}
            data={WARN_MINUTES.map((n) => ({
              value: String(n),
              label: n === 0 ? tr('Без попередження') : tr('За {n} хв до кінця', { n }),
            }))}
            value={String(a.countdownWarnMinutes)}
            onChange={(v) => v != null && set({ countdownWarnMinutes: Number(v) })}
            allowDeselect={false}
          />
          {a.countdownWarnMinutes > 0 && (
            <ColorInput
              label={tr('Колір попередження')}
              value={a.countdownWarnColor}
              onChange={(v) => set({ countdownWarnColor: v })}
              format="hex"
              swatches={['#ffb020', '#ffd43b', '#ff922b', '#ffffff']}
            />
          )}
          <Switch
            label={tr('Інший колір після нуля')}
            checked={a.countdownOverOn}
            onChange={(e) => set({ countdownOverOn: e.currentTarget.checked })}
          />
          {a.countdownOverOn && (
            <ColorInput
              label={tr('Колір після нуля')}
              value={a.countdownOverColor}
              onChange={(v) => set({ countdownOverColor: v })}
              format="hex"
              swatches={['#ff5a5a', '#e03131', '#ff922b', '#ffffff']}
            />
          )}
          {/* the time's look (1.8.3) */}
          <Select
            label={tr('Розмір часу')}
            data={[
              { value: 'sm', label: tr('Менший') },
              { value: 'md', label: tr('Звичайний') },
              { value: 'lg', label: tr('Більший') },
              { value: 'xl', label: tr('Найбільший') },
            ]}
            value={a.countdownSize}
            onChange={(v) => v && set({ countdownSize: v as TimerSize })}
            allowDeselect={false}
          />
          <Select
            label={tr('Шрифт часу')}
            data={[
              { value: 'text', label: tr('Як у тексті') },
              { value: 'sans', label: tr('Inter (без зарубок)') },
              { value: 'mono', label: tr('Моноширинний') },
            ]}
            value={a.countdownFont}
            onChange={(v) => v && set({ countdownFont: v as TimerFont })}
            allowDeselect={false}
          />
          <Select
            label={tr('Як писати час')}
            data={[
              { value: 'clock', label: '4:59' },
              { value: 'padded', label: '04:59' },
              { value: 'minutes', label: tr('5 хв, секунди — в останню хвилину') },
            ]}
            value={a.countdownFormat}
            onChange={(v) => v && set({ countdownFormat: v as TimerFormat })}
            allowDeselect={false}
          />
          <div>
            <Text size="sm" fw={500} mb={4}>
              {tr('Напис')}
            </Text>
            <SegmentedControl
              fullWidth
              value={a.countdownCaptionAt}
              onChange={(v) => set({ countdownCaptionAt: v as CaptionAt })}
              data={[
                { label: tr('Над часом'), value: 'above' },
                { label: tr('Під часом'), value: 'below' },
                { label: tr('Без напису'), value: 'none' },
              ]}
            />
          </div>
          {/* «Відлік» in a corner (1.8.7): which corner and how big */}
          <Select
            label={tr('Кут для відліку')}
            description={tr('Коли відлік показують у кутку, поверх слайда')}
            data={[
              { value: 'tr', label: tr('Угорі праворуч') },
              { value: 'tl', label: tr('Угорі ліворуч') },
              { value: 'br', label: tr('Унизу праворуч') },
              { value: 'bl', label: tr('Унизу ліворуч') },
            ]}
            value={a.countdownCorner}
            onChange={(v) => v && set({ countdownCorner: v as CornerAt })}
            allowDeselect={false}
          />
          <Select
            label={tr('Розмір у кутку')}
            data={[
              { value: 'sm', label: tr('Менший') },
              { value: 'md', label: tr('Звичайний') },
              { value: 'lg', label: tr('Більший') },
            ]}
            value={a.countdownCornerSize}
            onChange={(v) => v && set({ countdownCornerSize: v as CornerSize })}
            allowDeselect={false}
          />
        </Section>

        {/* «Пошук» (1.8.12-beta.4, the author's calls): where words go first, no repeats, focus */}
        <Section
          value="search"
          title={tr('Пошук')}
          summary={summary(
            search.scope === 'all' ? tr('спершу в усіх') : tr('спершу в поточному'),
            search.dedupe && tr('без повторів'),
            search.focusOnReturn && tr('курсор у пошук'),
            search.place !== 'start' && placeName(search.place),
          )}
        >
          <Text size="xs" c="dimmed">
            {tr(
              'Одне поле вгорі: посилання — перехід, слова — результати під ним. Якщо в поточному перекладі нічого, застосунок шукає в інших.',
            )}
          </Text>
          <Select
            label={tr('Де шукати слова спершу')}
            data={[
              { value: 'current', label: tr('У поточному перекладі (F3)') },
              { value: 'all', label: tr('В усіх перекладах бібліотеки (F4)') },
            ]}
            value={search.scope}
            onChange={(v) => v && setSearch({ scope: v === 'all' ? 'all' : 'current' })}
            allowDeselect={false}
          />
          {/* 1.8.12-beta.9 (A1007-01, the author's ask): where the field stands */}
          <Select
            label={tr('Де поле пошуку')}
            data={(['start', 'afterModes', 'center', 'verses'] as const).map((p) => ({
              value: p,
              label: placeName(p),
            }))}
            value={search.place}
            onChange={(v) => v && setSearch({ place: v as SearchPlace })}
            allowDeselect={false}
          />
          <Switch
            label={tr('Той самий вірш з різних перекладів — одним рядком')}
            checked={search.dedupe}
            onChange={(e) => setSearch({ dedupe: e.currentTarget.checked })}
          />
          <Switch
            label={tr('Курсор у пошук, коли повертаєтеся до вікна керування')}
            description={tr('Поки поле порожнє, стрілки й PageUp/PageDown далі гортають вірші.')}
            checked={search.focusOnReturn}
            onChange={(e) => setSearch({ focusOnReturn: e.currentTarget.checked })}
          />
        </Section>

        {/* «Відео» (1.8.12-beta.3, the author's calls): its end and the phones */}
        <Section
          value="video"
          title={tr('Відео')}
          summary={summary(
            videoEndOf(a.videoEnd) === 'next'
              ? tr('після кінця — далі')
              : tr('після кінця — чорний екран'),
            videoPhonesOf(a.videoPhones) === 'text'
              ? tr('на телефонах — напис')
              : tr('на телефонах — кадр'),
          )}
        >
          <Text size="xs" c="dimmed">
            {tr('Відео грає у вікні показу без звуку; звук іде з вікна керування.')}
          </Text>
          <Select
            label={tr('Після кінця відео')}
            data={[
              { value: 'black', label: tr('Чорний екран') },
              { value: 'next', label: tr('Далі: наступний пункт послідовності чи наступне відео') },
            ]}
            value={videoEndOf(a.videoEnd)}
            onChange={(v) => v && set({ videoEnd: videoEndOf(v) })}
            allowDeselect={false}
          />
          <Select
            label={tr('Телефони глядачів під час відео')}
            data={[
              { value: 'poster', label: tr('Кадр з відео') },
              { value: 'text', label: tr('Напис «Відео на екрані»') },
            ]}
            value={videoPhonesOf(a.videoPhones)}
            onChange={(v) => v && set({ videoPhones: videoPhonesOf(v) })}
            allowDeselect={false}
          />
        </Section>

        {/* «Таймер доповідача» (1.8.6): its own look, apart from what the hall sees */}
        <Section
          value="stageTimer"
          title={tr('Таймер доповідача')}
          summary={
            summary(
              a.stageTimerWarnMinutes > 0 &&
                tr('попередження за {n} хв', { n: a.stageTimerWarnMinutes }),
              a.stageTimerOverOn && tr('колір після нуля'),
              (a.stageTimerFont !== 'text' || a.stageTimerFormat !== 'clock') &&
                tr('свій вигляд часу'),
            ) || tr('звичайний вигляд')
          }
        >
          <Text size="xs" c="dimmed">
            {tr(
              'Час, який бачить лише доповідач у вікні «Сцена». Глядачів ці налаштування не стосуються.',
            )}
          </Text>
          <Select
            label={tr('Попередження')}
            data={WARN_MINUTES.map((n) => ({
              value: String(n),
              label: n === 0 ? tr('Без попередження') : tr('За {n} хв до кінця', { n }),
            }))}
            value={String(a.stageTimerWarnMinutes)}
            onChange={(v) => v != null && set({ stageTimerWarnMinutes: Number(v) })}
            allowDeselect={false}
          />
          {a.stageTimerWarnMinutes > 0 && (
            <ColorInput
              label={tr('Колір попередження')}
              value={a.stageTimerWarnColor}
              onChange={(v) => set({ stageTimerWarnColor: v })}
              format="hex"
              swatches={['#ffb020', '#ffd43b', '#ff922b', '#ffffff']}
            />
          )}
          <Switch
            label={tr('Інший колір після нуля')}
            checked={a.stageTimerOverOn}
            onChange={(e) => set({ stageTimerOverOn: e.currentTarget.checked })}
          />
          {a.stageTimerOverOn && (
            <ColorInput
              label={tr('Колір після нуля')}
              value={a.stageTimerOverColor}
              onChange={(v) => set({ stageTimerOverColor: v })}
              format="hex"
              swatches={['#ff5a5a', '#e03131', '#ff922b', '#ffffff']}
            />
          )}
          <Select
            label={tr('Шрифт часу')}
            data={[
              { value: 'text', label: tr('Як у тексті') },
              { value: 'sans', label: tr('Inter (без зарубок)') },
              { value: 'mono', label: tr('Моноширинний') },
            ]}
            value={a.stageTimerFont}
            onChange={(v) => v && set({ stageTimerFont: v as TimerFont })}
            allowDeselect={false}
          />
          <Select
            label={tr('Як писати час')}
            data={[
              { value: 'clock', label: '4:59' },
              { value: 'padded', label: '04:59' },
              { value: 'minutes', label: tr('5 хв, секунди — в останню хвилину') },
            ]}
            value={a.stageTimerFormat}
            onChange={(v) => v && set({ stageTimerFormat: v as TimerFormat })}
            allowDeselect={false}
          />
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
                onChange={(f) =>
                  void putImage('bgImage', f, (file) => fileToDownscaledDataUrl(file))
                }
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
            simpleView && tr('простий вигляд'),
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
          {/* 1.8.12-beta.7 (F1005-15): fewer things in sight */}
          <Switch
            label={tr('Простий вигляд')}
            description={tr(
              'Сцена, вікна виводу, глядачі, пульт, довідка й тема — у меню «Ще»; праворуч лише прев’ю',
            )}
            checked={simpleView}
            onChange={(e) => setSimpleView(e.currentTarget.checked)}
          />
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
          <BackupSection />
          <FeedbackSection />
          <StandbySection active={openSections.includes('app')} />
          <BrowserSection active={openSections.includes('app')} />
          <ShortcutSection />
          <ShutdownSection />
        </Section>
      </Accordion>
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

/** Where the search field stands (1.8.12-beta.9), as the settings name it. */
function placeName(p: SearchPlace): string {
  return p === 'afterModes'
    ? tr('Угорі, після режимів')
    : p === 'center'
      ? tr('Угорі, посередині')
      : p === 'verses'
        ? tr('Над віршами (у «Біблії»)')
        : tr('Угорі, перед режимами');
}
