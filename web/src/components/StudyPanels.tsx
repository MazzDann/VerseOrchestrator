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

import { type CSSProperties, type ReactNode } from 'react';
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
  /** the verse preview's caption with the short book name (1.13.0-beta.1) */
  previewShort?: string;
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
  /** Bottom-of-centre placement: the monitors side by side, no pin. */
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
  /**
   * What stands under the monitors (1.8.12-beta.6): the running order, the bookmarks and the
   * slide's text (ShowList), given the text — absent, the text alone as before.
   */
  showList?: (text: ReactNode) => ReactNode;
  /** «Простий вигляд» (1.8.12-beta.7): only the preview — no Стронг / Контекст / Вигляд row */
  simple?: boolean;
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
  previewShort,
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
  showList,
  simple = false,
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
  const previewMonitor = (
    <Monitor
      slide={previewSlide}
      state={previewState}
      title={merged ? tr('На екрані') : tr('Прев’ю')}
      // the slide's own reference — a song or a text isn't the verse selection (the
      // merged monitor said «На екрані Psalms 135:15» over a song stanza, 0.6.11)
      detail={
        merged
          ? liveDetail
          : previewShort ||
            previewSlide.reference ||
            reference ||
            (previewHas ? undefined : tr('оберіть вірші'))
      }
      actions={
        <Group gap={2} wrap="nowrap">
          {suggestButton}
          {bookmarkButton}
        </Group>
      }
    />
  );
  const programMonitor = !merged && (
    <Monitor
      slide={liveSlide}
      state={liveActive ? 'live' : 'idle'}
      title={tr('На екрані')}
      detail={liveDetail}
    />
  );
  // The speaker's own preview — only while it differs from the screen (a remote walking
  // on screen would just repeat the monitor above).
  const remoteOnScreen = !!remote && liveActive && sameContent(remote.slide, liveSlide);
  const remoteMonitor = remote && !remoteOnScreen && (
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
  );
  // In the right column: a large preview, the smaller «На екрані» and the remote's below it
  // (62 % and the 0.75rem above each: .vo-monitor-stack in styles.css counts on them).
  const monitorStack = (
    <>
      {previewMonitor}
      {programMonitor && (
        <Box w="62%" mt="sm">
          {programMonitor}
        </Box>
      )}
      {remoteMonitor && (
        <Box w="62%" mt="sm">
          {remoteMonitor}
        </Box>
      )}
    </>
  );
  // The slide's lines per translation (what the preview shows, as text).
  const slideText = (
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
  );
  // Below the centre (1.4.6): the panel is wide and short — the monitors stand side by side,
  // each as large as the panel's height allows (.vo-monitor-row), the text in what is left.
  const monitors = (
    [
      ['preview', previewMonitor],
      ['program', programMonitor],
      ['remote', remoteMonitor],
    ] as const
  ).filter(([, m]) => m);
  const monitorRow = (
    <div
      className="vo-monitor-row"
      data-list={showList ? 'true' : undefined}
      style={{ '--monitors': monitors.length } as CSSProperties}
    >
      {monitors.map(([key, m]) => (
        <div key={key} className="vo-monitor-cell">
          {m}
        </div>
      ))}
      {showList ? (
        <div className="vo-monitor-list">{showList(slideText)}</div>
      ) : (
        <ScrollArea className="vo-monitor-text" type="hover" scrollbars="y">
          <div className="vo-monitor-text-body">{slideText}</div>
        </ScrollArea>
      )}
    </div>
  );

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* below the centre the row stays short and the tabs keep their own width (1.4.6) */}
      {!simple && (
        <Group p="xs" py={compact ? 4 : undefined} gap="xs" wrap="nowrap">
          <SegmentedControl
            flex={compact ? undefined : 1}
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
      )}
      {!simple && <Divider />}

      <Box
        style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        // the monitors above the list measure this body's height (.vo-monitor-stack)
        className={mode === 'preview' && !compact && !pinned ? 'vo-preview-body' : undefined}
      >
        {mode === 'preview' &&
          (compact ? (
            monitorRow
          ) : (
            <>
              {!pinned && (
                <Box px="md" pt="sm" pb="xs">
                  {/* in a short column they give way to the list (Mac check of 1.9.0) */}
                  <div
                    className="vo-monitor-stack"
                    data-list={showList ? 'true' : undefined}
                    style={{ '--small-monitors': monitors.length - 1 } as CSSProperties}
                  >
                    {monitorStack}
                  </div>
                </Box>
              )}
              {showList ? (
                <Box
                  style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
                  className="vo-show-list"
                >
                  {showList(slideText)}
                </Box>
              ) : (
                <ScrollArea style={{ flex: 1 }} px="md">
                  {slideText}
                </ScrollArea>
              )}
            </>
          ))}
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
            {/* the full width of the window below the centre is too wide for a form */}
            <Box maw={compact ? 640 : undefined}>
              <SettingsPanel />
            </Box>
          </ScrollArea>
        )}
      </Box>

      {pinned && !compact && (
        <>
          <Divider />
          <Box p="xs">{monitorStack}</Box>
        </>
      )}
    </Box>
  );
}
