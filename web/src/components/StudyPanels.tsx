import {
  Box,
  Group,
  Stack,
  Text,
  Badge,
  ActionIcon,
  Tooltip,
  Divider,
  ScrollArea,
  SegmentedControl,
} from '@mantine/core';
import {
  IconBookmark,
  IconBook,
  IconAdjustments,
  IconPin,
  IconPinnedOff,
} from '@tabler/icons-react';

import { type Verse, type Book } from '../api';
import { type RefItem } from '../settingsStore';
import { type Slide, type SlideLine } from '../presenterBus';
import { Monitor, type TallyState } from './Monitor';
import { sameContent } from '../lib/slide';
import { SettingsPanel } from './SettingsPanel';
import { StrongView, type StrongPickRef } from './StrongView';
import { StudyContext } from './StudyContext';

export type AsideMode = 'preview' | 'settings' | 'strong' | 'study';

interface Props {
  mode: AsideMode;
  setMode: (m: AsideMode) => void;
  primaryHasStrong: boolean;
  reference: string;
  /** What the output window actually shows now (published slide). */
  liveSlide: Slide;
  liveActive: boolean;
  /** Short status of the output: reference, «Затемнено», «Чорний екран», «Порожньо». */
  liveLabel: string;
  isSaved: boolean;
  currentRef: RefItem | null;
  onToggleBookmark: (r: RefItem) => void;
  slideLines: SlideLine[];
  scriptureFont: string;
  previewSlide: Slide;
  selectedPrimaryVerses: Verse[];
  books: Book[];
  onProjectStrong?: (subline: string, strong: string) => void;
  onShowConcordance?: (strong: string) => void;
  onPickRef?: (r: StrongPickRef) => void;
  pinned: boolean;
  onTogglePin: () => void;
  /** Bottom-of-centre placement: constrain the preview and hide the pin. */
  compact?: boolean;
}

/**
 * Preview / Strong / appearance panels — used in the right aside or docked below the centre.
 * Go-live actions live only in the header toolbar (one place for «На екран»/«Затемнити»).
 */
export function StudyPanels({
  mode,
  setMode,
  primaryHasStrong,
  reference,
  liveSlide,
  liveActive,
  liveLabel,
  isSaved,
  currentRef,
  onToggleBookmark,
  slideLines,
  scriptureFont,
  previewSlide,
  selectedPrimaryVerses,
  books,
  onProjectStrong,
  onShowConcordance,
  onPickRef,
  pinned,
  onTogglePin,
  compact = false,
}: Props) {
  // Program/preview monitors (video-switcher tally): when the prepared slide is already
  // on screen show ONE red "На екрані" monitor; otherwise a large amber preview plus a
  // smaller red/grey "На екрані" monitor, so the operator always sees both states.
  const previewHas = previewSlide.lines.length > 0;
  const merged = liveActive && previewHas && sameContent(previewSlide, liveSlide);
  const previewState: TallyState = merged ? 'live' : previewHas ? 'cue' : 'idle';
  const bookmarkButton = (
    <Tooltip label={isSaved ? 'Прибрати зі збереженого' : 'Зберегти'}>
      <ActionIcon
        size="sm"
        variant={isSaved ? 'filled' : 'subtle'}
        color="brand"
        disabled={!currentRef}
        onClick={() => currentRef && onToggleBookmark(currentRef)}
        aria-label={isSaved ? 'Прибрати зі збереженого' : 'Зберегти'}
      >
        <IconBookmark size={14} />
      </ActionIcon>
    </Tooltip>
  );
  const previewMonitor = (maxWidth?: number) => (
    <Monitor
      slide={previewSlide}
      state={previewState}
      title={merged ? 'На екрані' : 'Прев’ю'}
      detail={reference || (previewHas ? undefined : 'оберіть вірші')}
      actions={bookmarkButton}
      maxWidth={maxWidth}
    />
  );
  const programMonitor = !merged && (
    <Box w="62%" mt="sm">
      <Monitor
        slide={liveSlide}
        state={liveActive ? 'live' : 'idle'}
        title="На екрані"
        detail={liveActive ? liveSlide.reference : liveLabel}
      />
    </Box>
  );

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Group p="xs" gap="xs" wrap="nowrap">
        <SegmentedControl
          flex={1}
          size="xs"
          value={mode}
          onChange={(v) => setMode(v as AsideMode)}
          data={[
            { value: 'preview', label: 'Прев’ю' },
            ...(primaryHasStrong ? [{ value: 'strong', label: 'Стронг' }] : []),
            { value: 'study', label: 'Контекст' },
            { value: 'settings', label: 'Вигляд' },
          ]}
        />
        {!compact && (
          <Tooltip label={pinned ? 'Відкріпити прев’ю' : 'Закріпити прев’ю знизу'}>
            <ActionIcon
              variant={pinned ? 'filled' : 'default'}
              color="brand"
              onClick={onTogglePin}
              aria-label="Закріпити прев’ю"
            >
              {pinned ? <IconPinnedOff size={16} /> : <IconPin size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
      <Divider />

      <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {mode === 'preview' && (
          <>
            {(!pinned || compact) && (
              <Box px="md" pt="sm" pb="xs">
                {previewMonitor(compact ? 460 : undefined)}
                {programMonitor}
              </Box>
            )}
            <ScrollArea style={{ flex: 1 }} px="md">
              <Stack gap="md" pb="md">
                {slideLines.map((line, i) => (
                  <div key={i} dir={line.rtl ? 'rtl' : 'ltr'}>
                    <Badge size="xs" variant="light" mb={4}>
                      {line.translationAbbr}
                    </Badge>
                    <Text size="sm" style={{ fontFamily: scriptureFont }}>
                      {line.text}
                    </Text>
                  </div>
                ))}
                {slideLines.length === 0 && (
                  <Text size="sm" c="dimmed">
                    Оберіть вірші у списку.
                  </Text>
                )}
              </Stack>
            </ScrollArea>
          </>
        )}
        {mode === 'strong' && (
          <ScrollArea style={{ flex: 1 }}>
            <Group gap={6} px="md" pt="sm">
              <IconBook size={16} />
              <Text fw={600} size="sm">
                Номери Стронга
              </Text>
            </Group>
            <StrongView
              verses={selectedPrimaryVerses}
              hasStrong={primaryHasStrong}
              onProjectStrong={onProjectStrong}
              onShowConcordance={onShowConcordance}
            />
          </ScrollArea>
        )}
        {mode === 'study' && (
          <ScrollArea style={{ flex: 1 }}>
            <Group gap={6} px="md" pt="sm">
              <IconBook size={16} />
              <Text fw={600} size="sm">
                Контекст вірша
              </Text>
            </Group>
            <StudyContext verses={selectedPrimaryVerses} books={books} onPickRef={onPickRef} />
          </ScrollArea>
        )}
        {mode === 'settings' && (
          <ScrollArea style={{ flex: 1 }}>
            <Group gap={6} px="md" pt="sm">
              <IconAdjustments size={16} />
              <Text fw={600} size="sm">
                Налаштування вигляду
              </Text>
            </Group>
            <SettingsPanel />
          </ScrollArea>
        )}
      </Box>

      {pinned && !compact && (
        <>
          <Divider />
          <Box p="xs">
            {previewMonitor()}
            {programMonitor}
          </Box>
        </>
      )}
    </Box>
  );
}
