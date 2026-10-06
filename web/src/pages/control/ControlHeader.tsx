import { type Dispatch, type SetStateAction } from 'react';
import { Burger, Divider, Group, Text, TextInput } from '@mantine/core';
import {
  IconAdjustments,
  IconAppWindow,
  IconArrowRight,
  IconDeviceMobile,
  IconHelp,
  IconLayoutDashboard,
  IconLayoutSidebarRight,
  IconLetterT,
  IconLibraryPhoto,
  IconList,
  IconMoonStars,
  IconMusic,
  IconQrcode,
  IconScreenShare,
  IconSearch,
  IconSun,
} from '@tabler/icons-react';
import { type CodeState, type UpdateState } from '../../api';
import { type PanelPlacement } from '../../settingsStore';
import { NEEDS_SERVER } from '../../serverStore';
import { formatCombo, type Keymap } from '../../hotkeys';
import { type SearchScope } from '../../components/SearchPanel';
import {
  ToolButton,
  ToolIcon,
  ToolMore,
  ToolZone,
  type ToolProps,
  type ToolSection,
} from '../../components/Toolbar';
import { type FoldZone } from '../../lib/headerFold';
import type { useHeaderFold } from '../../lib/headerFold';
import { type TrackedOutput } from '../../lib/outputs';
import { docsUrl } from '../../lib/docs';
import { tr, useLang } from '../../i18n';
import { openPresenter, openStage } from './outputWindows';
import { LiveZone, type LiveZoneProps } from './LiveZone';

type Toggle = Dispatch<SetStateAction<boolean>>;

/**
 * The control window's header: navigate · sources | windows · live output (`LiveZone`) · app,
 * folding into «Ще» as the window narrows (lib/headerFold.ts).
 */
export function ControlHeader({
  header,
  navOpened,
  toggleNav,
  navBreakpoint,
  keymap,
  openSearch,
  goToValue,
  setGoToValue,
  goTo,
  songsOpen,
  setSongsOpen,
  textOpen,
  setTextOpen,
  imagesOpen,
  setImagesOpen,
  playlistOpen,
  setPlaylistOpen,
  outputWindows,
  outputsOpen,
  setOutputsOpen,
  followAlong,
  viewers,
  serverAvailable,
  followOpen,
  setFollowOpen,
  remoteOpen,
  setRemoteOpen,
  update,
  code,
  settingsOpen,
  setSettingsOpen,
  colorScheme,
  toggleColorScheme,
  asideOpened,
  toggleAside,
  asideToggle,
  moreShown,
  setMoreOpen,
  panelPlacement,
  live,
}: {
  header: ReturnType<typeof useHeaderFold>;
  navOpened: boolean;
  toggleNav: () => void;
  navBreakpoint: boolean | undefined;
  keymap: Keymap;
  openSearch: (scope: SearchScope) => void;
  goToValue: string;
  setGoToValue: (value: string) => void;
  goTo: (q: string) => Promise<void>;
  songsOpen: boolean;
  setSongsOpen: Toggle;
  textOpen: boolean;
  setTextOpen: Toggle;
  imagesOpen: boolean;
  setImagesOpen: Toggle;
  playlistOpen: boolean;
  setPlaylistOpen: Toggle;
  outputWindows: TrackedOutput[];
  outputsOpen: boolean;
  setOutputsOpen: Toggle;
  followAlong: boolean;
  viewers: number;
  serverAvailable: boolean | null;
  followOpen: boolean;
  setFollowOpen: Toggle;
  remoteOpen: boolean;
  setRemoteOpen: Toggle;
  update: UpdateState | undefined;
  code: CodeState | null;
  settingsOpen: boolean;
  setSettingsOpen: Toggle;
  colorScheme: 'light' | 'dark';
  toggleColorScheme: () => void;
  asideOpened: boolean;
  toggleAside: () => void;
  /** the aside's burger exists (below `md`): «Панель показу» is an item in «Ще» */
  asideToggle: boolean;
  moreShown: boolean;
  setMoreOpen: (opened: boolean) => void;
  panelPlacement: PanelPlacement;
  /** the go-live zone's own props, passed through to `LiveZone` */
  live: LiveZoneProps;
}) {
  const lang = useLang();
  const fold = header.fold;
  const folded = (zone: FoldZone) => fold.folded.includes(zone);

  // The header's foldable tools, each defined once: the toolbar draws them as buttons, «Ще» as
  // menu items — the same names, icons, hotkeys and states (vo-design §2).
  const rowGap = fold.tight ? 'xs' : 'sm';
  const songsTool: ToolProps = {
    label: tr('Пісні'),
    hint: tr('Пошук пісень з .pptx і показ куплетів'),
    icon: <IconMusic size={18} stroke={1.5} />,
    active: songsOpen,
    onClick: () => setSongsOpen((o) => !o),
  };
  const textTool: ToolProps = {
    label: tr('Власний текст'),
    hint: tr('Скласти й показати довільний текст'),
    icon: <IconLetterT size={18} stroke={1.5} />,
    active: textOpen,
    onClick: () => setTextOpen((o) => !o),
  };
  const imagesTool: ToolProps = {
    label: tr('Зображення'),
    hint: tr('Картинки на екран і в послідовність показу'),
    icon: <IconLibraryPhoto size={18} stroke={1.5} />,
    active: imagesOpen,
    onClick: () => setImagesOpen((o) => !o),
  };
  const playlistTool: ToolProps = {
    label: tr('Послідовність показу'),
    hint: tr('Черга уривків, пісень і текстів; збережені програми'),
    icon: <IconList size={18} stroke={1.5} />,
    active: playlistOpen,
    onClick: () => setPlaylistOpen((o) => !o),
  };
  const presenterTool: ToolProps = {
    label: tr('Відкрити вікно показу'),
    hint: tr('Вихідне вікно для другого монітора чи проєктора'),
    icon: <IconScreenShare size={18} stroke={1.5} />,
    onClick: () => void openPresenter(),
  };
  const stageTool: ToolProps = {
    label: tr('Сцена'),
    hint: tr('Монітор доповідача: зараз, далі, годинник'),
    icon: <IconLayoutDashboard size={18} stroke={1.5} />,
    onClick: () => void openStage(),
  };
  const outputsTool: ToolProps = {
    label: outputWindows.length
      ? tr('Вікна виводу: відкрито {n}', { n: outputWindows.length })
      : tr('Вікна виводу'),
    hint: tr('Екрани, відкриті вікна показу й сцени, розкладка'),
    icon: <IconAppWindow size={18} stroke={1.5} />,
    active: outputsOpen,
    onClick: () => setOutputsOpen((o) => !o),
  };
  const viewersTool: ToolProps = {
    label: followAlong
      ? tr('Глядачі: трансляція увімкнена, на зв’язку {n}', { n: viewers })
      : tr('Глядачі'),
    hint:
      serverAvailable === false
        ? tr(NEEDS_SERVER)
        : tr('QR, щоб глядачі стежили за текстом з телефона'),
    icon: <IconQrcode size={18} stroke={1.5} />,
    disabled: serverAvailable === false,
    active: followOpen,
    color: followAlong ? 'live' : undefined,
    onClick: () => setFollowOpen((o) => !o),
  };
  const remoteTool: ToolProps = {
    label: tr('Пульт доповідача'),
    hint:
      serverAvailable === false
        ? tr(NEEDS_SERVER)
        : tr('Телефон-пульт за QR: гортати показ без доступу до налаштувань'),
    icon: <IconDeviceMobile size={18} stroke={1.5} />,
    disabled: serverAvailable === false,
    active: remoteOpen,
    onClick: () => setRemoteOpen((o) => !o),
  };
  // a newer version to remind of — not one an older version was chosen over (1.6.3)
  const newer = update?.available && !update.pinned ? (update.latest?.version ?? null) : null;
  const settingsTool: ToolProps = {
    label: tr('Налаштування вигляду'),
    hint: code?.changed
      ? tr('Код застосунку змінився — див. «Застосунок» → «Оновлення»')
      : newer
        ? tr('Доступна версія {version} — див. «Застосунок» → «Оновлення»', {
            version: newer,
          })
        : tr('Шрифт, кольори, шаблон слайда, пресети, клавіші'),
    icon: <IconAdjustments size={18} stroke={1.5} />,
    dot: !!newer || !!code?.changed,
    active: settingsOpen,
    onClick: () => setSettingsOpen((o) => !o),
  };
  const helpTool: ToolProps = {
    label: tr('Довідка'),
    hint: tr('Посібник користувача — відкривається на GitHub'),
    icon: <IconHelp size={18} stroke={1.5} />,
    onClick: () => window.open(docsUrl(lang), '_blank', 'noopener'),
  };
  const themeTool: ToolProps = {
    label: colorScheme === 'dark' ? tr('Світла тема') : tr('Темна тема'),
    icon:
      colorScheme === 'dark' ? (
        <IconSun size={18} stroke={1.5} />
      ) : (
        <IconMoonStars size={18} stroke={1.5} />
      ),
    onClick: () => toggleColorScheme(),
  };
  // the aside's toggle (a Burger in the bar below `md`) is an item of its own in «Ще»
  const panelTool: ToolProps = {
    label: tr('Панель показу'),
    icon: <IconLayoutSidebarRight size={18} stroke={1.5} />,
    active: asideOpened,
    onClick: toggleAside,
  };
  const zoneTools: Record<FoldZone, ToolSection> = {
    sources: { label: tr('Джерела'), tools: [songsTool, textTool, imagesTool, playlistTool] },
    windows: {
      label: tr('Вікна'),
      tools: [presenterTool, stageTool, outputsTool, viewersTool, remoteTool],
    },
    app: {
      label: tr('Застосунок'),
      tools: [settingsTool, helpTool, themeTool, ...(asideToggle ? [panelTool] : [])],
    },
  };
  const moreSections = fold.folded.map((zone) => zoneTools[zone]);
  const moreButton = (
    <ToolMore
      label={tr('Ще')}
      hint={tr('Кнопки, які не вмістилися у вікні')}
      sections={moreSections}
      opened={moreShown}
      onChange={setMoreOpen}
    />
  );
  // even the last step is too wide (a very large root font in a small window): what runs off
  // the right edge must not be «Ще», the only way to the folded tools — it goes before the
  // go-live zone, whose buttons have their hotkeys, and the row shows that it scrolls
  const moreFirst = header.overflow && fold.folded.includes('app');

  // Zones, left → right: navigate · sources | windows · live output · app. A narrow window
  // folds them step by step, zones into «Ще» (lib/headerFold.ts); the row scrolls sideways
  // only if even the last step doesn't fit (a huge root font), with «Ще» moved before the
  // go-live zone and a thin scrollbar.
  return (
    <Group
      ref={header.ref}
      data-fold={header.step}
      h="100%"
      px={fold.tight ? 'xs' : 'md'}
      justify="space-between"
      wrap="nowrap"
      gap={rowGap}
      style={{ overflowX: 'auto', scrollbarWidth: header.overflow ? 'thin' : 'none' }}
    >
      <Group gap={rowGap} wrap="nowrap" style={{ flexShrink: 0 }}>
        <Burger
          opened={navOpened}
          onClick={toggleNav}
          hiddenFrom="sm"
          size="sm"
          aria-label={tr('Навігація')}
        />
        {!fold.noTitle && (
          <Text fw={600} size="sm" style={{ whiteSpace: 'nowrap' }}>
            VerseOrchestrator
          </Text>
        )}
        {/* a rule after the title or the burger, not at the window's edge */}
        <ToolZone label={tr('Навігація')} divider={!fold.noTitle || !navBreakpoint}>
          <ToolIcon
            label={tr('Пошук')}
            hint={tr('У поточному перекладі; {combo} — в усіх', {
              combo: formatCombo(keymap.searchAll),
            })}
            combo={keymap.searchCurrent}
            icon={<IconSearch size={18} stroke={1.5} />}
            onClick={() => openSearch('current')}
          />
          <TextInput
            size="sm"
            w={170}
            display={fold.noGoTo ? 'none' : undefined}
            placeholder={tr('Перейти: Ів 3:16')}
            value={goToValue}
            onChange={(e) => setGoToValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void goTo(goToValue);
            }}
            leftSection={<IconArrowRight size={14} />}
            aria-label={tr('Перейти до посилання')}
          />
        </ToolZone>
        {!folded('sources') && (
          <ToolZone label={tr('Джерела')}>
            <ToolIcon {...songsTool} />
            <ToolIcon {...textTool} />
            <ToolIcon {...imagesTool} />
            <ToolIcon {...playlistTool} />
          </ToolZone>
        )}
      </Group>

      <Group gap={rowGap} wrap="nowrap" style={{ flexShrink: 0 }}>
        {!folded('windows') && (
          <ToolZone label={tr('Вікна')} divider={false}>
            <ToolButton {...presenterTool} text={tr('Вікно показу')} compact={fold.iconsOnly} />
            <ToolIcon {...stageTool} />
            <ToolIcon {...outputsTool} />
            <ToolIcon {...viewersTool} />
            <ToolIcon {...remoteTool} />
          </ToolZone>
        )}
        {moreFirst && moreButton}
        <LiveZone {...live} divider={!folded('windows') || moreFirst} fold={fold} keymap={keymap} />
        {folded('app') ? (
          !moreFirst && (
            <>
              <Divider orientation="vertical" h={24} style={{ alignSelf: 'center' }} />
              {moreButton}
            </>
          )
        ) : (
          <>
            <ToolZone label={tr('Застосунок')}>
              <ToolIcon {...settingsTool} />
              <ToolIcon {...helpTool} />
              <ToolIcon {...themeTool} />
            </ToolZone>
            {panelPlacement === 'aside' && (
              <Burger
                opened={asideOpened}
                onClick={toggleAside}
                hiddenFrom="md"
                size="sm"
                aria-label={tr('Панель показу')}
              />
            )}
          </>
        )}
      </Group>
    </Group>
  );
}
