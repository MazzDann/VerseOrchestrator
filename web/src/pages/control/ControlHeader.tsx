import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { type ReactNode } from 'react';
import { Box, Burger, Divider, Group, Text } from '@mantine/core';
import {
  IconAdjustments,
  IconAppWindow,
  IconDeviceMobile,
  IconHelp,
  IconLayoutDashboard,
  IconBook2,
  IconLayoutSidebarRight,
  IconLibraryPhoto,
  IconMoonStars,
  IconMusic,
  IconQrcode,
  IconScreenShare,
  IconSearch,
  IconSun,
} from '@tabler/icons-react';
import { type CodeState, type UpdateState } from '../../api';
import { useSettings, type PanelPlacement } from '../../settingsStore';
import { type Workspace } from '../Control';
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
import { SearchField } from './SearchField';
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
  clearSearch,
  searchFieldRef,
  searchKeysRef,
  focusOnReturn,
  fieldInCentre,
  keysBusy,
  workspace,
  setWorkspace,
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
  openSearch: (scope?: SearchScope) => void;
  goToValue: string;
  setGoToValue: (value: string) => void;
  goTo: (q: string) => Promise<void>;
  /** done with a query: it goes, the results close, the scope is the settings' again */
  clearSearch: () => void;
  /** the one search field (1.8.12-beta.4) and the results panel's keys it hands over first */
  searchFieldRef: MutableRefObject<HTMLInputElement | null>;
  searchKeysRef: MutableRefObject<((e: React.KeyboardEvent) => boolean) | null>;
  /** the setting: the cursor back in the field when the window comes back */
  focusOnReturn: boolean;
  /** the field stands above the verses now («Над віршами» in «Біблія», 1.8.12-beta.9): not here */
  fieldInCentre: boolean;
  /** the palette, «Ще» or a tool owns the keyboard now */
  keysBusy: boolean;
  /** «Біблія / Пісні / Медіа» (1.8.12-beta.7) */
  workspace: Workspace;
  setWorkspace: (ws: Workspace) => void;
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
  // F1005-11 (the setting, off by default): the window coming back puts the cursor in the
  // field — only when nothing else holds it, and not over the palette or a tool
  const busy = useRef(keysBusy);
  busy.current = keysBusy;
  useEffect(() => {
    if (!focusOnReturn) return;
    const back = () => {
      const field = searchFieldRef.current;
      const held = document.activeElement;
      if (!field || field.offsetParent === null || busy.current) return;
      // already there (alt-tab while typing): nothing — a select would make the next key replace it
      if (held === field) return;
      if (held && held !== document.body) return;
      field.focus();
      field.select();
    };
    const visible = () => {
      if (document.visibilityState === 'visible') back();
    };
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [focusOnReturn, searchFieldRef]);

  // The header's foldable tools, each defined once: the toolbar draws them as buttons, «Ще» as
  // menu items — the same names, icons, hotkeys and states (vo-design §2).
  const rowGap = fold.tight ? 'xs' : 'sm';
  // where the field stands (1.8.12-beta.9, A1007-01): the settings say; above the verses it is
  // Control's, in «Пісні» / «Медіа» it comes back here at the start
  const place = useSettings((st) => st.search.place);
  const fieldAt = fieldInCentre ? null : place === 'verses' ? 'start' : place;
  const searchField = (width: number | string) => (
    <SearchField
      fieldRef={searchFieldRef}
      value={goToValue}
      setValue={setGoToValue}
      goTo={goTo}
      clearSearch={clearSearch}
      keysRef={searchKeysRef}
      focusKey={keymap.searchFocus}
      width={width}
      hidden={fold.noGoTo}
    />
  );
  // the modes (1.8.12-beta.7, F1005-12 / 15): one workspace at a time — the left column and the
  // centre change with it; they stand where «Пісні», «Власний текст» and «Зображення» stood
  const modeTool = (ws: Workspace, label: string, hint: string, icon: ReactNode): ToolProps => ({
    label,
    hint,
    icon,
    active: workspace === ws,
    onClick: () => setWorkspace(ws),
  });
  const modeTools = [
    modeTool(
      'bible',
      tr('Біблія'),
      tr('Переклади, книги й вірші'),
      <IconBook2 size={18} stroke={1.5} />,
    ),
    modeTool(
      'songs',
      tr('Пісні'),
      tr('Список пісень ліворуч, пісня посередині'),
      <IconMusic size={18} stroke={1.5} />,
    ),
    modeTool(
      'media',
      tr('Медіа'),
      tr('Зображення, альбоми, відео й власний текст'),
      <IconLibraryPhoto size={18} stroke={1.5} />,
    ),
  ];
  // «Простий вигляд» (1.8.12-beta.7, F1005-15): the rarely used tools wait in «Ще»
  const simple = useSettings((s) => s.simpleView);
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
    sources: { label: tr('Режим'), tools: modeTools },
    windows: {
      label: tr('Вікна'),
      tools: [presenterTool, stageTool, outputsTool, viewersTool, remoteTool],
    },
    app: {
      label: tr('Застосунок'),
      tools: [settingsTool, helpTool, themeTool, ...(asideToggle ? [panelTool] : [])],
    },
  };
  const hiddenWindows = [stageTool, outputsTool, viewersTool, remoteTool];
  const hiddenApp = [helpTool, themeTool];
  const moreSections = [
    ...fold.folded.map((zone) => zoneTools[zone]),
    ...(simple && !folded('windows') ? [{ label: tr('Вікна'), tools: hiddenWindows }] : []),
    ...(simple && !folded('app') ? [{ label: tr('Застосунок'), tools: hiddenApp }] : []),
  ];
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
          {fieldAt === 'start' && searchField(230)}
        </ToolZone>
        {!folded('sources') && (
          <ToolZone label={tr('Режим')}>
            {/* icons, like every other tool up here (the author: text read as filler); the one
                on is lit, its name is in the tooltip */}
            {modeTools.map((t) => (
              <ToolIcon key={t.label} {...t} />
            ))}
          </ToolZone>
        )}
        {fieldAt === 'afterModes' && searchField(230)}
      </Group>
      {/* «Посередині» (1.8.12-beta.9): between the two groups, centred in the room they leave */}
      {/* up to 20rem where there is room, down to 12.5rem where there isn't — never less: the fold
          measures the children, and a field squeezed to nothing looked as if it fit */}
      {fieldAt === 'center' && (
        <Box style={{ flex: '0 1 20rem', minWidth: '12.5rem' }}>{searchField('100%')}</Box>
      )}

      <Group gap={rowGap} wrap="nowrap" style={{ flexShrink: 0 }}>
        {!folded('windows') && (
          <ToolZone label={tr('Вікна')} divider={false}>
            <ToolButton {...presenterTool} text={tr('Вікно показу')} compact={fold.iconsOnly} />
            {!simple && hiddenWindows.map((t) => <ToolIcon key={t.label} {...t} />)}
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
              {!simple && hiddenApp.map((t) => <ToolIcon key={t.label} {...t} />)}
              {simple && !moreFirst && moreButton}
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
