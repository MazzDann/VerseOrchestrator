import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDeviceTv,
  IconPlaylistAdd,
  IconSquarePlus,
  IconX,
} from '@tabler/icons-react';
import { type Book } from '../../api';
import { type Slide } from '../../presenterBus';
import { type Outcome } from '../../lib/commands';
import { tr, trn, useLang } from '../../i18n';
import { formatVerseListDisplay } from '../../lib/reference';
import { useSettings } from '../../settingsStore';

/**
 * Above the verse list: the open book and chapter, what is on screen, the pages of a long
 * passage, «Додати уривок у показ», the selection's reference, and the chapter grid with a verse field
 * beside it (1.19.0-beta.2, F1017-14: a chapter of 60 verses is a long scroll).
 */
export function ChapterBar({
  currentBook,
  chapter,
  liveActive,
  liveSlide,
  liveLabel,
  pageCount,
  safePageIndex,
  advance,
  selectedVerses,
  pickHeld,
  addCurrentPassage,
  gatheredCount,
  gather,
  showGathered,
  clearGathered,
  reference,
  chapters,
  selectChapter,
  jumpVerse,
}: {
  currentBook: Book | null;
  chapter: number | null;
  liveActive: boolean;
  liveSlide: Slide;
  liveLabel: string;
  pageCount: number;
  safePageIndex: number;
  advance: (delta: number, previewOnly?: boolean) => Outcome | Promise<Outcome>;
  selectedVerses: number[];
  /** a pick waits in the preview for Enter (1.13.0-beta.1) */
  pickHeld: boolean;
  addCurrentPassage: () => void;
  /** «Додати до слайда» (1.23.0-beta.7, F1114-07): places gathered for one slide */
  gatheredCount: number;
  gather: () => void;
  showGathered: () => void;
  clearGathered: () => void;
  reference: string;
  chapters: number[];
  selectChapter: (chapter: number) => void;
  /**
   * «16», «16-18» or «3:16» in the open book: selected and its row focused; `show` — on screen too.
   * `keepFocus` — select without taking the focus from the field (type on / step with arrows,
   * F1024-01), and stay quiet about a verse that isn't there.
   */
  jumpVerse: (q: string, show: boolean, keepFocus?: boolean) => Promise<boolean>;
}) {
  useLang();
  const placement = useSettings((s) => s.verseField); // beside / below / off (F1024-03)
  const chapterSize = useSettings((s) => s.chapterSize); // sm / md / lg (F1024-04)
  const [verse, setVerse] = useState('');
  // F1024-01: typing a verse selects it into the preview on a short pause (no Enter), and ↑/↓ step
  // to the next/previous verse without leaving the field. The explicit Enter still commits (and
  // moves to the row), Ctrl+Enter also shows it.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPending = () => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
  };
  useEffect(() => clearPending, []);
  // which verse a step moves from: a range's first one going back, its last going on (F1107-05:
  // ↑ from the last verse of a long pick landed far off), else what is typed
  const stepFrom = (delta: number) => {
    if (selectedVerses.length > 0)
      return delta < 0 ? Math.min(...selectedVerses) : Math.max(...selectedVerses);
    const n = parseInt(verse, 10);
    return Number.isFinite(n) ? n : 0;
  };
  const stepVerse = (delta: number) => {
    clearPending();
    const next = stepFrom(delta) + delta;
    if (next < 1) return;
    // show the number in the field only once it actually lands (don't leave an out-of-range one)
    void jumpVerse(String(next), false, true).then((ok) => ok && setVerse(String(next)));
  };
  return (
    <>
      <Group justify="space-between" px="md" pt="xs" pb={4} wrap="nowrap">
        <Text fw={600} size="md" truncate>
          {currentBook ? `${currentBook.longName} ${chapter ?? ''}` : tr('Оберіть книгу')}
        </Text>
        <Group gap={6} wrap="nowrap">
          <Tooltip label={tr('Що зараз на екрані показу')}>
            <Badge
              variant={liveActive ? 'filled' : 'light'}
              color={liveSlide.forceBlack ? 'dark' : liveActive ? 'live' : 'gray'}
              leftSection={<IconDeviceTv size={12} />}
              style={{ maxWidth: 220 }}
            >
              {liveLabel}
            </Badge>
          </Tooltip>
          {pageCount > 1 && (
            <Group gap={2} wrap="nowrap">
              <ActionIcon
                variant="default"
                size="sm"
                disabled={safePageIndex === 0}
                onClick={() => advance(-1)}
                aria-label={tr('Попередня сторінка')}
              >
                <IconChevronLeft size={14} />
              </ActionIcon>
              <Tooltip label={tr('Сторінка довгого уривка (← → або PageUp/PageDown)')}>
                <Badge variant="filled" color="brand">
                  {safePageIndex + 1}/{pageCount}
                </Badge>
              </Tooltip>
              <ActionIcon
                variant="default"
                size="sm"
                disabled={safePageIndex === pageCount - 1}
                onClick={() => advance(1)}
                aria-label={tr('Наступна сторінка')}
              >
                <IconChevronRight size={14} />
              </ActionIcon>
            </Group>
          )}
          {selectedVerses.length > 0 && (
            <Tooltip label={tr('Додати до слайда: кілька місць на одному слайді')}>
              <ActionIcon
                variant="subtle"
                color="brand"
                size="sm"
                onClick={gather}
                aria-label={tr('Додати до слайда')}
              >
                <IconSquarePlus size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {gatheredCount > 0 && (
            <Group gap={2} wrap="nowrap">
              <Tooltip label={tr('Показати зібрані місця одним слайдом')}>
                <Badge
                  variant="light"
                  color="cue"
                  style={{ cursor: 'pointer' }}
                  component="button"
                  onClick={showGathered}
                >
                  {tr('Слайд: {n} — показати', { n: gatheredCount })}
                </Badge>
              </Tooltip>
              <Tooltip label={tr('Прибрати зібрані місця')}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={clearGathered}
                  aria-label={tr('Прибрати зібрані місця')}
                >
                  <IconX size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
          {selectedVerses.length > 0 && (
            <Tooltip label={tr('Додати уривок у показ')}>
              <ActionIcon
                variant="subtle"
                color="brand"
                size="sm"
                onClick={addCurrentPassage}
                aria-label={tr('Додати уривок у показ')}
              >
                <IconPlaylistAdd size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {selectedVerses.length > 0 && (
            // the picked numbers, as they read (1.13.0-beta.1, users' report F1010-04): the book is
            // the title already, so a long name no longer cuts them off; «cue» while the pick waits
            <Tooltip
              label={
                pickHeld
                  ? tr('Ще не на екрані — Enter')
                  : `${reference} · ${trn(selectedVerses.length, '{n} вірш|{n} вірші|{n} віршів')}`
              }
              withArrow
              openDelay={250}
            >
              <Badge
                variant="light"
                color={pickHeld ? 'cue' : undefined}
                style={{ flexShrink: 0, textTransform: 'none' }}
              >
                {`${chapter}:${formatVerseListDisplay(selectedVerses)}`}
                {selectedVerses.length > 1 && ` · ${selectedVerses.length}`}
              </Badge>
            </Tooltip>
          )}
        </Group>
      </Group>
      {chapters.length > 0 &&
        (() => {
          const field =
            placement === 'off' ? null : (
              <Tooltip
                label={tr(
                  'Вірш цього розділу, як-от 16 чи 16-18. Вибирається сам; ↑/↓ — гортати, Enter — вибрати й далі, Ctrl+Enter — і на екран',
                )}
                multiline
                w={240}
                withArrow
                openDelay={400}
              >
                <TextInput
                  size="xs"
                  w={64}
                  placeholder={tr('Вірш')}
                  aria-label={tr('Вірш у розділі')}
                  value={verse}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    setVerse(v);
                    clearPending();
                    const q = v.trim();
                    // select as you type (into the preview, quietly) so ↑/↓ can step right away
                    if (q) debounce.current = setTimeout(() => void jumpVerse(q, false, true), 350);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && verse) {
                      e.preventDefault();
                      e.stopPropagation();
                      clearPending();
                      setVerse('');
                      return;
                    }
                    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                      // step the selection without leaving the field (F1024-01); holding repeats
                      e.preventDefault();
                      e.stopPropagation();
                      stepVerse(e.key === 'ArrowDown' ? 1 : -1);
                      return;
                    }
                    if (e.key !== 'Enter' || !verse.trim()) return;
                    // the field's own Enter: not «На екран»'s ⌘↩ / the window's keys as well
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.repeat) return;
                    clearPending();
                    void jumpVerse(verse.trim(), e.ctrlKey || e.metaKey).then(
                      (ok) => ok && setVerse(''),
                    );
                  }}
                />
              </Tooltip>
            );
          const grid = (
            <ScrollArea.Autosize
              mah={64}
              // more chapters than two rows: the half row at the bottom fades — «there is more», not a
              // row cut off (1.25.0-beta.5, the vo-ux walk-through)
              className={chapters.length > 20 ? 'vo-fade-bottom' : undefined}
              style={placement === 'beside' ? { flex: 1, minWidth: 0 } : { width: '100%' }}
            >
              <div
                className="vo-chapter-grid"
                data-size={chapterSize}
                role="group"
                aria-label={tr('Розділи')}
              >
                {chapters.map((c) => (
                  <button
                    key={c}
                    className="vo-chip"
                    data-selected={c === chapter ? 'true' : undefined}
                    onClick={() => selectChapter(c)}
                    aria-current={c === chapter ? 'true' : undefined}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </ScrollArea.Autosize>
          );
          return placement === 'below' ? (
            <Stack gap="xs" px="md" pb="xs">
              {grid}
              <Group gap="xs" wrap="nowrap">
                {field}
              </Group>
            </Stack>
          ) : (
            <Group gap="xs" wrap="nowrap" align="flex-start" px="md" pb="xs">
              {field}
              {grid}
            </Group>
          );
        })()}
    </>
  );
}
