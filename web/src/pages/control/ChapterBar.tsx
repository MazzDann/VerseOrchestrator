import { ActionIcon, Badge, Group, ScrollArea, Text, Tooltip } from '@mantine/core';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDeviceTv,
  IconPlaylistAdd,
} from '@tabler/icons-react';
import { type Book } from '../../api';
import { type Slide } from '../../presenterBus';
import { type Outcome } from '../../lib/commands';
import { tr, trn, useLang } from '../../i18n';
import { formatVerseListDisplay } from '../../lib/reference';

/**
 * Above the verse list: the open book and chapter, what is on screen, the pages of a long
 * passage, «Додати уривок у показ», the selection's reference, and the chapter grid.
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
  reference,
  chapters,
  selectChapter,
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
  reference: string;
  chapters: number[];
  selectChapter: (chapter: number) => void;
}) {
  useLang();
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
      {chapters.length > 0 && (
        <ScrollArea.Autosize mah={64} px="md" pb="xs">
          <div className="vo-chapter-grid" role="group" aria-label={tr('Розділи')}>
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
      )}
    </>
  );
}
