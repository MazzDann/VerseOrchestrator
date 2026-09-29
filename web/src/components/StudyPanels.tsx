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
  Menu,
} from '@mantine/core';
import {
  IconBookmark,
  IconBook,
  IconAdjustments,
  IconPin,
  IconPinnedOff,
  IconScreenShare,
  IconArrowBackUp,
  IconX,
  IconSend,
} from '@tabler/icons-react';

import { type Verse, type Book } from '../api';
import { type RefItem } from '../settingsStore';
import { type Slide, type SlideLine } from '../presenterBus';
import { Monitor, type TallyState } from './Monitor';
import { sameContent } from '../lib/slide';
import { SettingsPanel } from './SettingsPanel';
import { StrongView, type StrongPickRef } from './StrongView';
import { StudyContext } from './StudyContext';
import { tr, useLang } from '../i18n';

export type AsideMode = 'preview' | 'settings' | 'strong' | 'study';

interface Props {
  mode: AsideMode;
  setMode: (m: AsideMode) => void;
  primaryHasStrong: boolean;
  reference: string;
  /** What the output window actually shows now (published slide). */
  liveSlide: Slide;
  liveActive: boolean;
  /** Short status of the output: reference, «Текст сховано», «Чорний екран», «Порожньо». */
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
  /** The speaker's own preview (0.6.2, a remote's cursor) and what the operator can do with it. */
  remote?: {
    name: string;
    slide: Slide;
    onShow: () => void;
    /** absent: nowhere to jump (a free-text item of the running order) */
    onAdopt?: () => void;
    onClose: () => void;
  } | null;
  /** Remotes the operator can suggest their preview to (0.6.4) and how. */
  suggest?: { remotes: { id: string; name: string }[]; onSend: (id: string) => void } | null;
}

/**
 * Preview / Strong / appearance panels — used in the right aside or docked below the centre.
 * Go-live actions live only in the header toolbar (one place for «На екран»/«Сховати текст»).
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
  remote,
  suggest,
}: Props) {
  useLang();
  // Program/preview monitors (video-switcher tally): when the prepared slide is already
  // on screen show ONE red "На екрані" monitor; otherwise a large amber preview plus a
  // smaller red/grey "На екрані" monitor, so the operator always sees both states.
  const previewHas = previewSlide.lines.length > 0;
  const merged = liveActive && previewHas && sameContent(previewSlide, liveSlide);
  const previewState: TallyState = merged ? 'live' : previewHas ? 'cue' : 'idle';
  const bookmarkButton = (
    <Tooltip label={isSaved ? tr('Прибрати зі збереженого') : tr('Зберегти')}>
      <ActionIcon
        size="sm"
        variant={isSaved ? 'filled' : 'subtle'}
        color="brand"
        disabled={!currentRef}
        onClick={() => currentRef && onToggleBookmark(currentRef)}
        aria-label={isSaved ? tr('Прибрати зі збереженого') : tr('Зберегти')}
      >
        <IconBookmark size={14} />
      </ActionIcon>
    </Tooltip>
  );
  // Suggest the preview to a speaker's remote (0.6.4): one remote — one click; several — a menu.
  const suggestTargets = previewHas ? (suggest?.remotes ?? []) : [];
  const suggestButton =
    suggestTargets.length === 1 ? (
      <Tooltip label={tr('Запропонувати пульту «{remote}»', { remote: suggestTargets[0].name })}>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="gray"
          onClick={() => suggest!.onSend(suggestTargets[0].id)}
          aria-label={tr('Запропонувати пульту «{remote}»', { remote: suggestTargets[0].name })}
        >
          <IconSend size={14} />
        </ActionIcon>
      </Tooltip>
    ) : suggestTargets.length > 1 ? (
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <Tooltip label={tr('Запропонувати пульту')}>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              aria-label={tr('Запропонувати пульту')}
            >
              <IconSend size={14} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{tr('Запропонувати пульту')}</Menu.Label>
          {suggestTargets.map((r) => (
            <Menu.Item key={r.id} onClick={() => suggest!.onSend(r.id)}>
              {r.name}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    ) : null;
  // put on screen by a speaker's remote (0.6.2): say whose it is
  const liveBy = liveSlide.source?.by;
  const liveDetail = liveActive
    ? `${liveSlide.reference}${liveBy ? ` · ${tr('пульт «{remote}»', { remote: liveBy })}` : ''}`
    : liveLabel;
  const previewMonitor = (maxWidth?: number) => (
    <Monitor
      slide={previewSlide}
      state={previewState}
      title={merged ? tr('На екрані') : tr('Прев’ю')}
      // the slide's own reference — a song or a text isn't the verse selection (the
      // merged monitor said «На екрані Psalms 135:15» over a song stanza, 0.6.11)
      detail={
        merged
          ? liveDetail
          : previewSlide.reference || reference || (previewHas ? undefined : tr('оберіть вірші'))
      }
      actions={
        <Group gap={2} wrap="nowrap">
          {suggestButton}
          {bookmarkButton}
        </Group>
      }
      maxWidth={maxWidth}
    />
  );
  const programMonitor = !merged && (
    <Box w="62%" mt="sm">
      <Monitor
        slide={liveSlide}
        state={liveActive ? 'live' : 'idle'}
        title={tr('На екрані')}
        detail={liveDetail}
      />
    </Box>
  );
  // The speaker's own preview — only while it differs from the screen (a remote walking
  // on screen would just repeat the monitor above).
  const remoteOnScreen = !!remote && liveActive && sameContent(remote.slide, liveSlide);
  const remoteMonitor = remote && !remoteOnScreen && (
    <Box w="62%" mt="sm">
      <Monitor
        slide={remote.slide}
        state="cue"
        title={tr('Пульт')}
        detail={`«${remote.name}» · ${remote.slide.reference}`}
        actions={
          <Group gap={2} wrap="nowrap">
            <Tooltip label={tr('На екран')}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="live"
                onClick={remote.onShow}
                aria-label={tr('На екран: передпоказ пульта «{remote}»', { remote: remote.name })}
              >
                <IconScreenShare size={14} />
              </ActionIcon>
            </Tooltip>
            {remote.onAdopt && (
              <Tooltip label={tr('Перейти сюди у своєму виборі')}>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  onClick={remote.onAdopt}
                  aria-label={tr('Перейти до передпоказу пульта «{remote}»', {
                    remote: remote.name,
                  })}
                >
                  <IconArrowBackUp size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label={tr('Сховати до наступного вибору на пульті')}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={remote.onClose}
                aria-label={tr('Сховати передпоказ пульта')}
              >
                <IconX size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        }
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
            { value: 'preview', label: tr('Прев’ю') },
            ...(primaryHasStrong ? [{ value: 'strong', label: tr('Стронг') }] : []),
            { value: 'study', label: tr('Контекст') },
            { value: 'settings', label: tr('Вигляд') },
          ]}
        />
        {!compact && (
          <Tooltip label={pinned ? tr('Відкріпити прев’ю') : tr('Закріпити прев’ю знизу')}>
            <ActionIcon
              variant={pinned ? 'filled' : 'default'}
              color="brand"
              onClick={onTogglePin}
              aria-label={tr('Закріпити прев’ю')}
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
                {remoteMonitor}
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
                    {tr('Оберіть вірші у списку.')}
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
                {tr('Номери Стронга')}
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
                {tr('Контекст вірша')}
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
                {tr('Налаштування вигляду')}
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
            {remoteMonitor}
          </Box>
        </>
      )}
    </Box>
  );
}
