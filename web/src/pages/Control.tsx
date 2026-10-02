import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppShell,
  Group,
  Button,
  ScrollArea,
  Stack,
  Text,
  Badge,
  ActionIcon,
  Tooltip,
  Box,
  TextInput,
  Divider,
  Tabs,
  FileButton,
  Burger,
  Switch,
  useMantineColorScheme,
  useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useHotkeys } from 'react-hotkeys-hook';
import { notifications } from '@mantine/notifications';
import {
  IconScreenShare,
  IconDeviceTv,
  IconSquareOff,
  IconSun,
  IconHelp,
  IconMessageReport,
  IconMoonStars,
  IconSearch,
  IconBookmark,
  IconHistory,
  IconTrash,
  IconDownload,
  IconUpload,
  IconArrowRight,
  IconMusic,
  IconLetterT,
  IconSquareFilled,
  IconPhoto,
  IconChevronLeft,
  IconChevronRight,
  IconAdjustments,
  IconList,
  IconPlaylistAdd,
  IconLayoutDashboard,
  IconQrcode,
  IconDeviceMobile,
  IconAppWindow,
  IconLayoutSidebarRight,
  IconPlugConnectedX,
  IconPower,
} from '@tabler/icons-react';

import {
  api,
  ApiFailure,
  type Verse,
  type SongStyle,
  type RemoteCommand,
  type Pairing,
} from '../api';
import { useStore } from '../store';
import {
  useSettings,
  refKey,
  DEFAULT_LAYOUT,
  LAYOUT_LIMITS,
  type PanelLayout,
  type RefItem,
} from '../settingsStore';
import {
  publishSlide,
  publishNext,
  readSlide,
  subscribeCommand,
  subscribeSlide,
  setPublishing,
  type Slide,
  type SlideLine,
  type SlideStyle,
  type SlideTemplate,
  type SlideReveal,
  type SlideSource,
  type TextSpan,
} from '../presenterBus';
import {
  NO_LIBRARY,
  mainText,
  markedText,
  parseRedLetter,
  secondParts,
  strongLangFor,
  unmark,
} from '@vo/shared';
import { parseStrongTokens } from '../lib/strong';
import { findSong } from '../lib/songLink';
import { openPresenterWindow, openStageWindow } from '../openPresenter';
import { SearchPanel, type SearchScope } from '../components/SearchPanel';
import { StudyPanels, type AsideMode } from '../components/StudyPanels';
import { RefList } from '../components/RefList';
import { VirtualList } from '../components/VirtualList';
import { TranslationPicker } from '../components/TranslationPicker';
import { ConcordancePanel } from '../components/ConcordancePanel';
import { SongsPanel } from '../components/SongsPanel';
import { TextPanel } from '../components/TextPanel';
import { FloatingPanel } from '../components/FloatingPanel';
import { floatingPanelOpen } from '../lib/panelStack';
import { SettingsPanel } from '../components/SettingsPanel';
import { PlaylistPanel } from '../components/PlaylistPanel';
import { FollowPanel } from '../components/FollowPanel';
import { usePhoneUrl } from '../lib/phoneUrl';
import { RemotePanel } from '../components/RemotePanel';
import { OutputsPanel } from '../components/OutputsPanel';
import { useOutputWindows } from '../lib/outputs';
import { useSlideErrorNotices } from '../lib/slideErrorNotices';
import { useSettingsSaveNotice } from '../lib/settingsSaveNotice';
import { useFullscreenRefusedNotices } from '../lib/fullscreenNotices';
import { useControlLeader } from '../lib/leader';
import { planTakeover } from '../lib/takeover';
import { formatReference } from '../lib/reference';
import { opensAtTop, type OpenPlace } from '../lib/bookPick';
import { parseQuickRef, placeKey, quickKeydown, showStep } from '../lib/quickRef';
import { QuickRefPill } from '../components/QuickRefPill';
import {
  chapterName,
  crossTarget,
  edgeNotice,
  landingVerse,
  pressAtEdge,
  translationEdge,
  type CrossArm,
} from '../lib/chapterCross';
import { connectLive, type LiveConnection } from '../lib/liveSocket';
import { REMOTE_LABEL } from '../lib/remote';
import {
  asPassage,
  commands,
  PRIORITY,
  useCommandHandler,
  asSong,
  type Outcome,
  type RemotePassage,
  type RemoteSong,
  type RemoteTarget,
  type SharedPlaylist,
  type ShowToggle,
  targetArgs,
  toggleOf,
} from '../lib/commands';
import { useServer, NEEDS_SERVER, START_AGAIN } from '../serverStore';
import { tr, useLang } from '../i18n';
import { useDataSource, useEffectiveSource } from '../dataSourceStore';
import { NoLibrary, type LibraryGap } from '../components/NoLibrary';
import { useUpdateState } from '../lib/updates';
import {
  coverOver,
  forAudience,
  qrOver,
  sameContent,
  sameSlide,
  showsSomething,
  summarize,
  toggleBlack,
  toggleHidden,
  uncover,
} from '../lib/slide';
import { CommandPalette, type CommandItem } from '../components/CommandPalette';
import { takeServerUiState } from '../lib/uiState';
import { SONG_KEYS } from '../lib/songKeys';
import {
  ToolButton,
  ToolIcon,
  ToolMore,
  ToolZone,
  type ToolProps,
  type ToolSection,
} from '../components/Toolbar';
import { useHeaderFold, type FoldZone } from '../lib/headerFold';
import { ResizeHandle } from '../components/ResizeHandle';
import { setAppShellWidth } from '../lib/appShell';
import { SETTINGS_PANEL_KEY, bottomHeightAfter } from '../lib/panelBox';
import { formatCombo, matchesCombo } from '../hotkeys';
import { isFormField, scrollableAround } from '../lib/keyScroll';
import { closeThisWindow } from '../lib/closeWindow';
import { applyHandoverFrame, claimForHandover, controlHello, takeHandover } from '../lib/handover';
import { docsUrl } from '../lib/docs';
import { openFeedback } from '../lib/feedback';
import { usePlaylist, type SeqItem, type SeqPassage, type SeqSong } from '../playlistStore';

const EMPTY_ARRAY: never[] = [];
/** One «Екран очищено» notice at a time (0.13.2): a new clear replaces the last one. */
const CLEARED_NOTICE = 'screen-cleared';
type Jumpable = { translationId: number; bookNumber: number; chapter: number; verse: number };

type InlinePanel = 'search' | 'songs' | 'text';

export function Control() {
  const lang = useLang();
  const { toggleColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme('dark');

  const selectedIds = useStore((s) => s.selectedTranslationIds);
  const bookNumber = useStore((s) => s.bookNumber);
  const chapter = useStore((s) => s.chapter);
  const selectedVerses = useStore((s) => s.selectedVerses);
  const live = useStore((s) => s.live);
  const setTranslations = useStore((s) => s.setTranslations);
  const makePrimary = useStore((s) => s.makePrimary);
  const selectBook = useStore((s) => s.selectBook);
  const openBook = useStore((s) => s.openBook);
  const selectChapter = useStore((s) => s.selectChapter);
  const setSelectedVerses = useStore((s) => s.setSelectedVerses);
  const toggleVerse = useStore((s) => s.toggleVerse);
  const setLive = useStore((s) => s.setLive);

  const appearance = useSettings((s) => s.appearance);
  const history = useSettings((s) => s.history);
  const bookmarks = useSettings((s) => s.bookmarks);
  const pushHistory = useSettings((s) => s.pushHistory);
  const removeHistory = useSettings((s) => s.removeHistory);
  const clearHistory = useSettings((s) => s.clearHistory);
  const toggleBookmark = useSettings((s) => s.toggleBookmark);
  const importBookmarks = useSettings((s) => s.importBookmarks);
  const panelPlacement = useSettings((s) => s.panelPlacement);
  const liveFollow = useSettings((s) => s.liveFollow);
  const setLiveFollow = useSettings((s) => s.setLiveFollow);
  const followAlong = useSettings((s) => s.followAlong);
  const followQrCorner = useSettings((s) => s.followQrCorner);
  const followQrStyle = useSettings((s) => s.followQrStyle);
  // the viewers' address as a phone can reach it (LAN IP when opened on localhost)
  const { url: followUrl } = usePhoneUrl('/follow');
  const slideTemplate = useSettings((s) => s.slideTemplate);
  const pushRecentText = useSettings((s) => s.pushRecentText);
  const keymap = useSettings((s) => s.keymap);
  const layout = useSettings((s) => s.layout);
  const setLayout = useSettings((s) => s.setLayout);
  const recentBoxRef = useRef<HTMLDivElement>(null);
  const clampTo = (k: keyof PanelLayout, v: number) =>
    Math.min(LAYOUT_LIMITS[k][1], Math.max(LAYOUT_LIMITS[k][0], v));
  // Panel resize: drags write CSS directly (no re-render of this big page per move);
  // the final size is committed to the persisted store once, on release.
  const panelResize = (panel: 'navbar' | 'aside') => {
    const key = panel === 'navbar' ? 'navWidth' : 'asideWidth';
    return {
      onDrag: (d: number) => setAppShellWidth(panel, clampTo(key, layout[key] + d)),
      onCommit: (d: number) => {
        setLayout({ [key]: layout[key] + d });
        requestAnimationFrame(() => setAppShellWidth(panel, null));
      },
      onReset: () => setLayout({ [key]: DEFAULT_LAYOUT[key] }),
    };
  };
  const recentResize = {
    onDrag: (d: number) => {
      if (recentBoxRef.current)
        recentBoxRef.current.style.height = `${clampTo('recentHeight', layout.recentHeight + d)}px`;
    },
    onCommit: (d: number) => {
      setLayout({ recentHeight: layout.recentHeight + d });
      if (recentBoxRef.current) recentBoxRef.current.style.height = '';
    },
    onReset: () => setLayout({ recentHeight: DEFAULT_LAYOUT.recentHeight }),
  };
  // The display panel below the centre (1.4.6): it had a fixed 340 px and no handle — in a
  // short window it hid the verse list and its own «На екрані» monitor. Its height is the
  // operator's (layout.bottomHeight) as far as the column has room: it gives way first, down
  // to BOTTOM_PANEL_MIN, the verse list keeps BOTTOM_VERSES_MIN. A drag starts from what is
  // shown and, once released, stores what is shown — unless that is a squeezed height the
  // operator did not ask for (bottomHeightAfter).
  const bottomBoxRef = useRef<HTMLDivElement>(null);
  const bottomFrom = useRef<number | null>(null);
  const bottomResize = {
    onDrag: (d: number) => {
      const el = bottomBoxRef.current;
      if (!el) return;
      bottomFrom.current ??= el.offsetHeight;
      el.style.flexBasis = `${clampTo('bottomHeight', bottomFrom.current + d)}px`;
    },
    onCommit: (d: number) => {
      const el = bottomBoxRef.current;
      if (!el) return;
      const from = bottomFrom.current ?? el.offsetHeight;
      bottomFrom.current = null;
      let shown = from;
      if (d !== 0) {
        el.style.flexBasis = `${clampTo('bottomHeight', from + d)}px`;
        // what the column lets it have (a drag past its room would leave a dead stretch)
        shown = clampTo('bottomHeight', el.offsetHeight);
      }
      // a squeezed height never replaces the operator's (a click, ↑ / ↓ with no room)
      const next = bottomHeightAfter(layout.bottomHeight, from, shown, d);
      // React re-renders `flex` only when the height changes: put back what it rendered
      el.style.flexBasis = `${next}px`;
      if (next !== layout.bottomHeight) setLayout({ bottomHeight: next });
    },
    onReset: () => {
      if (bottomBoxRef.current)
        bottomBoxRef.current.style.flexBasis = `${DEFAULT_LAYOUT.bottomHeight}px`;
      setLayout({ bottomHeight: DEFAULT_LAYOUT.bottomHeight });
    },
  };
  // The burgers in the header exist below AppShell's breakpoints: the navigation's below `sm`,
  // the preview panel's below `md`. Read at once, not in an effect: a first render with the
  // wrong value only made the header measure twice.
  const navBreakpoint = useMediaQuery('(min-width: 48em)', true, {
    getInitialValueInEffect: false,
  });
  const asideBreakpoint = useMediaQuery('(min-width: 62em)', true, {
    getInitialValueInEffect: false,
  });
  const asideToggle = panelPlacement === 'aside' && !asideBreakpoint;
  // The header gives way to a narrow window step by step (lib/headerFold.ts): the title, the
  // buttons' text, the go-to field, then whole zones into «Ще» — measured, not breakpoints
  // (80em / 70em left buttons past the window's edge, Mac check of 1.4.1). What else changes
  // the widths — the language, a burger coming or going — makes it measure afresh.
  const header = useHeaderFold(`${lang}|${panelPlacement}|${navBreakpoint}|${asideBreakpoint}`);
  const fold = header.fold;
  const folded = (zone: FoldZone) => fold.folded.includes(zone);

  const queryClient = useQueryClient();
  const playlistItems = usePlaylist((s) => s.items);
  const playlistCurrentId = usePlaylist((s) => s.currentId);
  const playlistSaved = usePlaylist((s) => s.saved);
  const playlistAdd = usePlaylist((s) => s.add);
  const playlistRemove = usePlaylist((s) => s.removeItem);
  const playlistMove = usePlaylist((s) => s.move);
  const playlistReorder = usePlaylist((s) => s.reorder);
  const playlistClear = usePlaylist((s) => s.clear);
  const playlistCleared = usePlaylist((s) => s.cleared?.items.length ?? 0);
  const playlistUndoClear = usePlaylist((s) => s.undoClear);
  const playlistSetCurrent = usePlaylist((s) => s.setCurrent);
  const playlistSaveProgram = usePlaylist((s) => s.saveProgram);
  const playlistLoadProgram = usePlaylist((s) => s.loadProgram);
  const playlistDeleteProgram = usePlaylist((s) => s.deleteProgram);
  const playlistDeleted = usePlaylist((s) => s.deleted);
  const playlistUndoDelete = usePlaylist((s) => s.undoDelete);
  const playlistReplacedBy = usePlaylist((s) => s.replaced?.program ?? null);
  const playlistRelinkSong = usePlaylist((s) => s.relinkSong);
  const playlistUndoLoad = usePlaylist((s) => s.undoLoad);

  const primaryId = selectedIds[0] ?? null;
  const [bookFilter, setBookFilter] = useState('');
  // The centre column holds ONE inline tool at a time (search / songs / own text):
  // stacked, they pushed the verse list off screen. A single slot makes opening one close
  // the others; each keeps a boolean-style setter so call sites stay `setXOpen(o => !o)`.
  // Their content state (open song, stanza, draft) lives outside, so reopening restores it.
  const [inlinePanel, setInlinePanel] = useState<InlinePanel | null>(null);
  const inlineSetter = useCallback(
    (which: InlinePanel) => (v: boolean | ((open: boolean) => boolean)) =>
      setInlinePanel((cur) => {
        const was = cur === which;
        const next = typeof v === 'function' ? v(was) : v;
        return next ? which : was ? null : cur;
      }),
    [],
  );
  const searchOpen = inlinePanel === 'search';
  const songsOpen = inlinePanel === 'songs';
  const textOpen = inlinePanel === 'text';
  const setSearchOpen = useMemo(() => inlineSetter('search'), [inlineSetter]);
  const setSongsOpen = useMemo(() => inlineSetter('songs'), [inlineSetter]);
  const setTextOpen = useMemo(() => inlineSetter('text'), [inlineSetter]);
  const [searchScope, setSearchScope] = useState<SearchScope>('current');
  const [asideMode, setAsideMode] = useState<AsideMode>('preview');
  const [sidebarTab, setSidebarTab] = useState<string | null>('history');
  const [navOpened, { toggle: toggleNav }] = useDisclosure(false);
  const [asideOpened, { toggle: toggleAside }] = useDisclosure(false);
  const [pinnedPreview, { toggle: togglePin }] = useDisclosure(false);
  // When navigating via search/history/concordance, scroll this verse into view.
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);
  // Active Strong number for the concordance panel shown beside the verse list.
  const [concordanceStrong, setConcordanceStrong] = useState<string | null>(null);
  const [goToValue, setGoToValue] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const serverAvailable = useServer((s) => s.available);
  /** The settings panel, opened on «Застосунок» (where «Джерело даних» is). */
  const openAppSettings = () => {
    try {
      const open = JSON.parse(localStorage.getItem('vo:settingsSections') ?? '[]');
      if (Array.isArray(open) && !open.includes('app'))
        localStorage.setItem('vo:settingsSections', JSON.stringify([...open, 'app']));
    } catch {
      /* storage unavailable */
    }
    setSettingsOpen(true);
  };
  // First run with no server and nothing loaded: the library can only come from the
  // browser engine — open the settings on «Джерело даних» and say why.
  useEffect(() => {
    if (serverAvailable !== false || useDataSource.getState().segments.length > 0) return;
    openAppSettings();
    // next tick: on first paint the notifications host may not be mounted yet
    window.setTimeout(() =>
      notifications.show({
        message: tr(
          'Сервера немає — бібліотека працюватиме в браузері. Виберіть переклади в «Джерело даних».',
        ),
        color: 'brand',
        autoClose: 8000,
      }),
    );
  }, [serverAvailable]);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [outputsOpen, setOutputsOpen] = useState(false);
  /** Output windows open right now (they announce themselves — lib/outputs.ts). */
  const outputWindows = useOutputWindows();
  // a slide that failed to draw here or in an output window → a red notice (0.13.0)
  useSlideErrorNotices();
  // a settings change the browser couldn't store (its storage full of images) says so (1.4.1)
  useSettingsSaveNotice();
  // an output window the browser kept out of fullscreen → how to do it by hand (1.2.1)
  useFullscreenRefusedNotices();
  // a newer version on GitHub: a dot on the settings button, no interruption (1.0.0)
  const update = useUpdateState();
  /**
   * One control window in charge (0.4.4, lib/leader.ts): only the leader publishes to the
   * outputs, takes commands and holds the server's control socket; a second control window
   * is on standby — it mirrors what is on screen and can «Взяти керування».
   */
  const { state: leaderState, takeOver, claim } = useControlLeader();
  const isLeader = leaderState === 'leader';
  const leaderRef = useRef(isLeader);
  leaderRef.current = isLeader;
  const standbyNotice = () =>
    notifications.show({
      message: tr(
        'Показом керує інше вікно керування — натисніть «Взяти керування», щоб вести звідси',
      ),
      color: 'orange',
      autoClose: 2500,
    });
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** «Ще» in the header (ToolMore): while open it owns the keyboard, like the palette. */
  const [moreOpen, setMoreOpen] = useState(false);
  const moreShown = moreOpen && fold.folded.length > 0;
  // the window grew and «Ще» went away while open: it must not pop open when it comes back
  useEffect(() => {
    if (fold.folded.length === 0) setMoreOpen(false);
  }, [fold.folded.length]);
  // The song + highlighted stanza in the Songs panel — lifted here so the playlist
  // can open a song and seed its stanza (and so forwarded clicker commands step it).
  const [songsPanelSongId, setSongsPanelSongId] = useState<number | null>(null);
  const [songsPanelStanza, setSongsPanelStanza] = useState<number | null>(null);
  // Switching the open song from search/back resets the stanza highlight.
  const openSong = (id: number | null) => {
    setSongsPanelSongId(id);
    setSongsPanelStanza(null);
  };
  // Active page when a long passage is split across multiple slides.
  const [pageIndex, setPageIndex] = useState(0);
  // How many verses are revealed so far in progressive-reveal mode (1-based).
  const [revealCount, setRevealCount] = useState(1);
  // Last song/text/Strong projection shown in the preview (so the preview reflects
  // songs and free text, not only the verse selection). Cleared on navigation.
  const [previewOverride, setPreviewOverride] = useState<Slide | null>(null);
  // The slide actually published to the output window (for the in-app live monitor).
  const [liveSlide, setLiveSlide] = useState<Slide>(() => readSlide());
  /**
   * The speaker's own preview (0.6.2): the passage a remote picked last, as a slide — the
   * operator sees it next to their own preview; hidden with ✕ until the next pick.
   */
  const [remoteView, setRemoteView] = useState<{
    name: string;
    /** what «Перейти сюди» moves the operator to — none for a free-text item */
    target: RemoteTarget | null;
    slide: Slide;
  } | null>(null);

  // `focus`: hand the keyboard to the verse landed on (search, «Перейти»), so ↩ puts it on
  // screen and the arrows walk on. Mac re-check (0.6.13): after a search pick the panel
  // closed and left the focus on <body> — ↩ did nothing, only ⌘↩ (a page-wide hotkey)
  // projected. Other jumps (history, concordance, sequence, remotes) keep the focus.
  const focusJump = useRef(false);
  const jumpTo = (r: Jumpable, opts?: { focus?: boolean }) => {
    if (selectedIds.length === 0) setTranslations([r.translationId]);
    selectBook(r.bookNumber);
    selectChapter(r.chapter);
    setSelectedVerses([r.verse]);
    setScrollTarget(r.verse);
    focusJump.current = !!opts?.focus;
  };

  // Quick jump bar: resolve a reference/text query and jump to the first hit.
  const goTo = async (q: string) => {
    const query = q.trim();
    if (!query || primaryId == null) return;
    // numbers only («3:16», «16»): a place in the open book (1.4.0)
    if (parseQuickRef(query) && bookNumber != null) {
      if (await quickJump(query)) setGoToValue('');
      return;
    }
    try {
      const res = await api.search(query, [primaryId]);
      if (res.results.length > 0) {
        jumpTo(res.results[0], { focus: true });
        setGoToValue('');
      } else {
        notifications.show({
          message: tr(
            '«{query}» не знайдено. Спробуйте посилання, як-от «Ів 3:16», або слово з тексту',
            {
              query,
            },
          ),
          color: 'gray',
          autoClose: 2500,
        });
      }
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося перейти: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    }
  };

  /**
   * «На екран» pressed while typing numbers (Mac check of 1.4.0): the place gone to — shown
   * once it is the selection and its verses are in (the effect after `sendAndNotify`).
   */
  const showJump = useRef<{ key: string; timer: number } | null>(null);

  /**
   * «3:16» typed straight into the control window, or into «Перейти до посилання» (1.4.0):
   * a place in the open book — the verse (or verses) selected, its row focused, so Enter
   * puts it on screen; on screen at once while the screen follows the selection, or with
   * `show` (⌘↩ / Ctrl+Enter / «На екран» in the typed-number box).
   */
  const quickJump = async (q: string, opts?: { show?: boolean }): Promise<boolean> => {
    const r = parseQuickRef(q);
    const say = (message: string) => {
      notifications.show({ message, color: 'gray', autoClose: 2500 });
      return false;
    };
    if (!r) {
      return say(
        tr('«{query}» — не місце в книзі. Введіть вірш або розділ:вірш, як-от 3:16', { query: q }),
      );
    }
    if (primaryId == null || bookNumber == null) return say(tr('Спершу виберіть книгу'));
    const ch = r.chapter ?? chapter;
    if (ch == null) return say(tr('Спершу виберіть розділ'));
    const book = currentBook;
    if (!chapters.includes(ch)) {
      return say(tr('{book}: розділу {n} немає', { book: book?.longName ?? '', n: ch }));
    }
    const tid = primaryId;
    const bn = bookNumber;
    const verses = await queryClient
      .fetchQuery({ queryKey: ['verses', tid, bn, ch], queryFn: () => api.verses(tid, bn, ch) })
      .catch(() => []);
    const have = verses.map((v) => v.verse);
    const from = r.verse ?? Math.min(...have);
    if (!have.includes(from)) {
      return say(tr('{place}: вірша {n} немає', { place: chapterName(book, ch), n: from }));
    }
    const to = Math.min(r.verseEnd ?? from, Math.max(...have));
    const picked = have.filter((v) => v >= from && v <= to).sort((a, b) => a - b);
    if (opts?.show) {
      if (showJump.current) window.clearTimeout(showJump.current.timer);
      const wait = { key: placeKey(bn, ch, picked), timer: 0 };
      // never late: a slide that isn't ready in 3 s is not shown at some later moment — said
      // so while the place is still the selection (one left meanwhile goes quietly)
      wait.timer = window.setTimeout(() => {
        if (showJump.current !== wait) return;
        showJump.current = null;
        const now = useStore.getState();
        if (placeKey(now.bookNumber, now.chapter, now.selectedVerses) === wait.key) {
          say(tr('Текст ще не завантажився — натисніть «На екран» ще раз'));
        }
      }, 3000);
      showJump.current = wait;
    }
    if (ch !== chapter) selectChapter(ch);
    setSelectedVerses(picked);
    // from its first page and reveal step in the same render as the selection — live-follow
    // must not push it at the old page or step first (review of the Mac fix)
    setPageIndex(0);
    setRevealCount(1);
    setScrollTarget(from);
    focusJump.current = true;
    return true;
  };

  // Numbers typed where no field has the focus start a quick jump (1.4.0): the pill at the
  // bottom shows them, Enter goes, Esc (or any other key) lets go. While typing, «.» and the
  // space are separators, not «Чорний екран» or a verse's selection; Esc only cancels.
  // Mac check of 1.4.0 (lib/quickRef.ts quickKeydown): a lone Shift (before «:») keeps the box;
  // the «.» / «,» keys separate on any layout (Ukrainian: «ю» / «б»); ⌘↩ / Ctrl+Enter or «На
  // екран» goes there and shows it — they projected the old selection; a click lets go.
  const [quick, setQuick] = useState<string | null>(null);
  const quickRef = useRef<string | null>(null);
  quickRef.current = quick;
  const quickJumpRef = useRef(quickJump);
  quickJumpRef.current = quickJump;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const box = quickRef.current;
      const r = quickKeydown(box, e, {
        canStart: bookNumber != null,
        blocked: isFormField(e.target) || paletteOpen || moreShown,
        project: useSettings.getState().keymap.project,
      });
      if (r.box !== box) setQuick(r.box);
      if (r.go) void quickJumpRef.current(r.go.text, { show: r.go.show });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [bookNumber, paletteOpen, moreShown]);
  // a click lets go of the typed numbers: ⌘ / Shift + click in the verse list, then Enter,
  // belongs to the verses clicked, not to a place typed a moment ago (review of the Mac fix)
  useEffect(() => {
    const onPointer = () => {
      if (quickRef.current !== null) setQuick(null);
    };
    window.addEventListener('pointerdown', onPointer, true);
    return () => window.removeEventListener('pointerdown', onPointer, true);
  }, []);
  // forgotten halfway: gone after a few seconds without a key
  useEffect(() => {
    if (quick === null) return;
    const t = window.setTimeout(() => setQuick(null), 6000);
    return () => window.clearTimeout(t);
  }, [quick]);

  const openSearch = (scope: SearchScope) => {
    setSearchScope(scope);
    setSearchOpen(true);
  };

  const translationsQuery = useQuery({
    queryKey: ['translations'],
    queryFn: api.translations,
    // no library on the server: say so at once, not after three retries (0.13.1)
    retry: (n, e) => !(e instanceof ApiFailure && e.key === NO_LIBRARY) && n < 3,
  });
  const translations = translationsQuery.data ?? EMPTY_ARRAY;
  const effectiveSource = useEffectiveSource();
  /** Nothing to read, and why (0.13.1) — the centre then says what to do. */
  const libraryGap: LibraryGap | null =
    translationsQuery.error instanceof ApiFailure && translationsQuery.error.key === NO_LIBRARY
      ? 'missing'
      : translationsQuery.isSuccess && translations.length === 0
        ? effectiveSource === 'local'
          ? 'local'
          : 'empty'
        : null;

  const booksQuery = useQuery({
    queryKey: ['books', primaryId],
    queryFn: () => api.books(primaryId!),
    enabled: primaryId != null,
  });
  const books = booksQuery.data ?? EMPTY_ARRAY;
  const filteredBooks = useMemo(() => {
    const q = bookFilter.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) => b.longName.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q),
    );
  }, [books, bookFilter]);

  const chaptersQuery = useQuery({
    queryKey: ['chapters', primaryId, bookNumber],
    queryFn: () => api.chapters(primaryId!, bookNumber!),
    enabled: primaryId != null && bookNumber != null,
  });
  const chapters = chaptersQuery.data ?? EMPTY_ARRAY;
  /**
   * The book list and the palette (the user's idea, 2026-10-01): a book picked opens its first
   * chapter at once — a one-chapter book needed a click on its only number — and the open
   * book keeps its chapter. Its chapter list, when already loaded, names the first chapter.
   */
  const pickBook = (bn: number) =>
    openBook(
      bn,
      primaryId == null
        ? undefined
        : queryClient.getQueryData<number[]>(['chapters', primaryId, bn]),
    );

  const verseQueries = useQueries({
    queries: selectedIds.map((id) => ({
      queryKey: ['verses', id, bookNumber, chapter],
      queryFn: () => api.verses(id, bookNumber!, chapter!),
      enabled: bookNumber != null && chapter != null,
    })),
  });
  const versesByTranslation = useMemo(() => {
    const map = new Map<number, Verse[]>();
    selectedIds.forEach((id, i) => map.set(id, verseQueries[i]?.data ?? []));
    return map;
  }, [selectedIds, verseQueries]);
  const primaryVerses = useMemo(
    () => (primaryId != null ? (versesByTranslation.get(primaryId) ?? []) : []),
    [primaryId, versesByTranslation],
  );
  /** The open chapter's verses still on their way: the list says nothing about them yet. */
  const versesLoading = bookNumber != null && chapter != null && !!verseQueries[0]?.isPending;

  const currentBook = books.find((b) => b.bookNumber === bookNumber) ?? null;
  const reference = useMemo(
    () => formatReference(currentBook, chapter, selectedVerses),
    [currentBook, chapter, selectedVerses],
  );
  const referenceShort = useMemo(
    () => formatReference(currentBook, chapter, selectedVerses, true),
    [currentBook, chapter, selectedVerses],
  );
  const primaryHasStrong = translations.find((t) => t.id === primaryId)?.hasStrong ?? false;
  const selectedPrimaryVerses = useMemo(
    () => primaryVerses.filter((v) => selectedVerses.includes(v.verse)),
    [primaryVerses, selectedVerses],
  );

  // --- Long-passage pagination -------------------------------------------------
  // Split the selection into pages of `versesPerSlide` verses; the projected slide
  // shows one page and PageDown/arrows step pages. 0 (or a selection that fits) →
  // a single page = the whole selection (current behaviour, zero regression).
  const versesPerSlide = appearance.versesPerSlide ?? 0;
  const pages = useMemo<number[][]>(() => {
    if (selectedVerses.length === 0) return [];
    if (!versesPerSlide || versesPerSlide < 1 || selectedVerses.length <= versesPerSlide) {
      return [selectedVerses];
    }
    const out: number[][] = [];
    for (let i = 0; i < selectedVerses.length; i += versesPerSlide) {
      out.push(selectedVerses.slice(i, i + versesPerSlide));
    }
    return out;
  }, [selectedVerses, versesPerSlide]);
  const pageCount = pages.length;
  const safePageIndex = Math.min(pageIndex, Math.max(0, pageCount - 1));
  const pageVerses = pages[safePageIndex] ?? selectedVerses;
  const pageReference = useMemo(
    () => formatReference(currentBook, chapter, pageVerses),
    [currentBook, chapter, pageVerses],
  );

  // Back to the first page whenever the selection or the page size changes.
  useEffect(() => {
    setPageIndex(0);
  }, [selectedVerses, versesPerSlide]);

  // Hide the Strong tab (and leave it) when the primary translation has no Strong numbers.
  useEffect(() => {
    if (asideMode === 'strong' && !primaryHasStrong) setAsideMode('preview');
  }, [asideMode, primaryHasStrong]);

  // Build slide lines for an arbitrary set of verse numbers in the current chapter
  // (shared by the live slide and the stage "next" preview).
  const buildLines = useCallback(
    (verseNums: number[]): SlideLine[] => {
      if (verseNums.length === 0) return [];
      return selectedIds
        .map((id) => {
          const t = translations.find((x) => x.id === id);
          const verses = versesByTranslation.get(id) ?? [];
          const text = joinVerses(verses, verseNums, appearance.showVerseNumbers);
          if (!text.trim()) return null;
          const segments = redLetterSegments(verses, verseNums, appearance.showVerseNumbers);
          return { translationAbbr: t?.abbr ?? '', text, rtl: !!t?.rtl, segments } as SlideLine;
        })
        .filter((x): x is SlideLine => x !== null);
    },
    [selectedIds, versesByTranslation, translations, appearance.showVerseNumbers],
  );
  const slideLines = useMemo(() => buildLines(pageVerses), [buildLines, pageVerses]);

  const slideStyle: SlideStyle = useMemo(
    () => ({
      font: appearance.scriptureFont,
      color: appearance.textColor,
      align: appearance.textAlign,
      bgColor: appearance.bgColor,
      bgImage: appearance.bgImage,
      showVerseNumbers: appearance.showVerseNumbers,
      padTop: appearance.padTop,
      padRight: appearance.padRight,
      padBottom: appearance.padBottom,
      padLeft: appearance.padLeft,
      padUnit: appearance.padUnit,
      redLetter: appearance.redLetter,
      jesusColor: appearance.jesusColor,
      highlightColor: appearance.highlightColor,
      transition: appearance.transition,
      // the viewers' QR in a corner (0.6.16) — only while the relay is on to read from
      qrCorner: followAlong && followQrCorner ? followUrl : null,
      qrStyle: followQrStyle,
    }),
    [appearance, followAlong, followQrCorner, followUrl, followQrStyle],
  );

  // --- Progressive reveal --------------------------------------------------------
  // Units = the current page's verses (primary translation), revealed one per step.
  const revealUnits = useMemo<string[] | null>(() => {
    if (!appearance.reveal) return null;
    const verses = primaryId != null ? (versesByTranslation.get(primaryId) ?? []) : [];
    const byNum = new Map(verses.map((v) => [v.verse, v]));
    const units: string[] = [];
    for (const n of pageVerses) {
      const t = (byNum.get(n)?.text ?? '').trim();
      if (t) units.push(`${appearance.showVerseNumbers ? `${n} ` : ''}${t}`);
    }
    return units.length ? units : null;
  }, [appearance.reveal, appearance.showVerseNumbers, primaryId, versesByTranslation, pageVerses]);

  const revealForSlide: SlideReveal | undefined =
    appearance.reveal && revealUnits
      ? {
          units: revealUnits,
          count: Math.min(Math.max(1, revealCount), revealUnits.length),
          mode: appearance.revealSpotlight ? 'spotlight' : 'accumulate',
          placeholders: appearance.revealPlaceholders,
        }
      : undefined;

  /** Where a verse slide comes from (0.5.10, SlideSource): the selection, page, reveal step. */
  const verseSource = (
    verses: number[] = selectedVerses,
    page: number = safePageIndex,
    reveal: number = revealCount,
  ): SlideSource | undefined =>
    bookNumber != null && chapter != null && verses.length > 0
      ? { kind: 'verses', translationIds: selectedIds, bookNumber, chapter, verses, page, reveal }
      : undefined;

  // WYSIWYG of the current page — what would be projected for the verse selection.
  const versePreview: Slide = {
    lines: slideLines,
    reference: pageReference,
    blank: false,
    visible: slideLines.length > 0,
    style: slideStyle,
    template: slideTemplate,
    reveal: revealForSlide,
  };
  // Show the last song/text/Strong projection while one is active; otherwise the
  // verse selection. The override is cleared on navigation (effect below).
  const previewSlide: Slide = previewOverride ?? versePreview;

  // What advancing once would project — fed to the stage display's "next" pane.
  // Only meaningful for verse/page navigation; null while an override owns the screen.
  const nextSlide = useMemo<Slide | null>(() => {
    if (previewOverride || selectedVerses.length === 0) return null;
    // Mid-reveal, the next press reveals one more verse of the CURRENT slide — show
    // that on the stage "next" pane, not the following page/verse.
    if (
      appearance.reveal &&
      revealUnits &&
      revealUnits.length > 1 &&
      revealCount < revealUnits.length
    ) {
      return {
        lines: slideLines,
        reference: pageReference,
        blank: false,
        visible: true,
        style: slideStyle,
        template: slideTemplate,
        reveal: {
          units: revealUnits,
          count: revealCount + 1,
          mode: appearance.revealSpotlight ? 'spotlight' : 'accumulate',
          placeholders: appearance.revealPlaceholders,
        },
      };
    }
    let nextVerses: number[] | null = null;
    if (pageCount > 1 && safePageIndex < pageCount - 1) {
      nextVerses = pages[safePageIndex + 1];
    } else if (pageCount <= 1) {
      const all = primaryVerses.map((v) => v.verse);
      const last = selectedVerses[selectedVerses.length - 1];
      const idx = all.indexOf(last);
      if (idx >= 0 && idx < all.length - 1) nextVerses = [all[idx + 1]];
    }
    if (!nextVerses) return null;
    const lines = buildLines(nextVerses);
    if (lines.length === 0) return null;
    return {
      lines,
      reference: formatReference(currentBook, chapter, nextVerses),
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
    };
  }, [
    previewOverride,
    selectedVerses,
    pageCount,
    safePageIndex,
    pages,
    primaryVerses,
    buildLines,
    currentBook,
    chapter,
    slideStyle,
    slideTemplate,
    appearance.reveal,
    appearance.revealSpotlight,
    appearance.revealPlaceholders,
    revealUnits,
    revealCount,
    slideLines,
    pageReference,
  ]);

  // Mirror the next-slide preview to the stage window.
  useEffect(() => {
    if (isLeader) publishNext(nextSlide);
  }, [nextSlide, isLeader]);

  // Publish to the output window AND record it as the live slide (the bus doesn't
  // echo to the sender, so we track it here for the in-app "what's on screen" monitor).
  // When follow-along is on, also mirror a background-stripped copy to the server.
  // Read followAlong through a ref so handlers with frozen deps (the clear/black
  // hotkeys, whose react-hotkeys-hook dep arrays exclude followAlong) still see the
  // current value rather than the one captured when the hotkey was last memoized.
  const followAlongRef = useRef(followAlong);
  followAlongRef.current = followAlong;
  /** The hub's control socket (opened further down); preferred path for publishing. */
  const controlConn = useRef<LiveConnection | null>(null);
  // Audience follow-along goes over the control socket when it's up, HTTP otherwise.
  const publishAudience = (slide: Slide) => {
    if (!leaderRef.current) return; // standby: the leader feeds the phones
    // Only with a confirmed server: at startup (probe pending) the control socket's welcome
    // re-publishes anyway; without a server there is no audience relay at all.
    if (useServer.getState().available !== true) return;
    const s = forAudience(slide);
    if (!controlConn.current?.send({ type: 'publish', slide: s })) void api.livePost(s);
  };
  const pauseAudience = () => {
    if (!leaderRef.current) return;
    if (useServer.getState().available !== true) return; // the relay starts paused anyway
    if (!controlConn.current?.send({ type: 'publish', paused: true })) void api.livePause();
  };
  // What was pushed last. Live-follow re-sends whenever slideLines gets a new identity —
  // every render (useQueries) — which re-published the SAME slide 7–10× per step (0.4.1,
  // measured): each copy re-rendered this window, went to every output window, the
  // remotes' «screen» frame and the phones. An identical slide is now a no-op.
  const lastPushed = useRef<Slide | null>(null);
  /** A takeover still restoring page / reveal (0.5.10): key = the selection it waits for. */
  const adopting = useRef<{
    key: string;
    page: number;
    reveal: number;
    override: Slide | null;
  } | null>(null);
  /** The slide «Очистити» removed, until something else is shown (0.13.2). */
  const clearedRef = useRef<Slide | null>(null);
  /**
   * «Прев’ю: далі / назад» (Alt+arrows, 1.1.0): the preview walked ahead and the screen stays,
   * though «Наживо» is on — until «На екран», a plain step, or «Наживо» switched.
   */
  const [screenHeld, setScreenHeld] = useState(false);
  useEffect(() => setScreenHeld(false), [liveFollow]);
  const pushLive = (slide: Slide, opts?: { audience?: boolean }) => {
    if (!leaderRef.current) return; // standby: never overrides the leader's screen
    if (lastPushed.current && sameSlide(slide, lastPushed.current)) return;
    lastPushed.current = slide;
    if (slide.visible) clearedRef.current = null; // something else is on screen: nothing to take back
    publishSlide(slide);
    setLiveSlide(slide);
    // the QR slide stays off the phones: they are already reading (0.6.16)
    if (followAlongRef.current && opts?.audience !== false) publishAudience(slide);
  };

  // Switching follow-along on pushes the current slide at once (phones already on the
  // page jump to it); switching it OFF pauses the relay, so phones show «paused» instead
  // of freezing on the last slide.
  useEffect(() => {
    if (followAlong) publishAudience(liveSlide);
    else pauseAudience();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followAlong]);

  const send = (overrides?: Partial<Slide>) => {
    const slide: Slide = {
      lines: slideLines,
      reference: pageReference,
      blank: false,
      visible: slideLines.length > 0,
      style: slideStyle,
      template: slideTemplate,
      reveal: revealForSlide,
      source: verseSource(),
      ...overrides,
    };
    pushLive(slide);
    setLive(slide.visible && !slide.blank);
    // Projecting the verse selection ends any song/text/Strong override, so the
    // preview and live-follow track the verses again (no preview/screen desync).
    setPreviewOverride(null);
    setScreenHeld(false); // the screen shows the preview: it follows again
  };

  // Project the Strong-bearing (primary) translation only, with a "word — gloss"
  // subline. Used contextually from the Strong tab; normal navigation reverts it.
  // Scoped to the current page (like `send`/preview) so it stays WYSIWYG when a long
  // passage is split across slides.
  const projectStrong = (subline: string, strong: string) => {
    const t = translations.find((x) => x.id === primaryId);
    const pageStrongVerses = selectedPrimaryVerses.filter((v) => pageVerses.includes(v.verse));
    const text = joinVerses(pageStrongVerses, pageVerses, appearance.showVerseNumbers);
    if (!text.trim()) return;
    const segments = strongHighlightSegments(
      pageStrongVerses,
      pageVerses,
      appearance.showVerseNumbers,
      strong,
    );
    const slide: Slide = {
      lines: [{ translationAbbr: t?.abbr ?? '', text, rtl: !!t?.rtl, segments }],
      reference: pageReference,
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
      subline,
      source: verseSource(),
    };
    pushLive(slide);
    setPreviewOverride(slide);
    setLive(true);
    notifications.show({
      message: tr('На екрані зі Стронгом: {ref}', { ref: pageReference }),
      color: 'live',
      autoClose: 1500,
    });
  };

  // Project a text slide (song stanza). With `faithful`, reproduce the pptx look
  // (its background/colour/font/bold + a positioned quote box, anchored as in the file, and
  // a second box of its own — a title slide's authors, 1.2.1); else use the app style.
  // `look` is the stanza's own style in either mode: its second part (1.3.0) keeps the
  // file's colour with `faithful`, and goes dimmer in the app style.
  const projectText = (
    text: string,
    reference: string,
    faithful?: SongStyle | null,
    source?: SlideSource,
    look?: SongStyle | null,
  ) => {
    if (!text.trim()) return;
    let style = slideStyle;
    let template = slideTemplate;
    let quote = text;
    let subline: string | undefined;
    let line: SlideLine = { translationAbbr: '', text, rtl: false };
    if (faithful) {
      style = {
        ...slideStyle,
        font: faithful.font,
        color: faithful.color,
        align: faithful.align,
        bgColor: faithful.bg,
        bgImage: null,
        redLetter: false,
        bold: faithful.bold,
      };
      template = {
        name: 'pptx',
        objects: [
          {
            kind: 'quote',
            visible: true,
            x: faithful.x,
            y: faithful.y,
            w: faithful.w,
            h: faithful.h,
            align: faithful.align,
            valign: faithful.anchor,
            // Original pptx font size (cqh) → render the stanza "as made", not auto-fit.
            size: faithful.size,
          },
          ...(faithful.sub
            ? [
                {
                  kind: 'subline' as const,
                  visible: true,
                  x: faithful.sub.x,
                  y: faithful.sub.y,
                  w: faithful.sub.w,
                  h: faithful.sub.h,
                  align: faithful.sub.align,
                  valign: faithful.sub.anchor,
                  size: faithful.sub.size || 4, // unknown size: a caption's
                  color: faithful.sub.color,
                },
              ]
            : []),
        ],
      } satisfies SlideTemplate;
      if (faithful.sub) {
        quote = mainText(text, faithful);
        subline = faithful.sub.text;
      }
      line = { ...line, text: quote };
      const second = faithful.second;
      if (second && unmark(second.text) === quote)
        line = withSecond(line, second.text, second.color);
    } else {
      const marked = markedText(text, look);
      if (marked) line = withSecond(line, marked);
    }
    const slide: Slide = {
      lines: [line],
      ...(subline ? { subline } : {}),
      reference,
      blank: false,
      visible: true,
      style,
      template,
      source,
    };
    pushLive(slide);
    setPreviewOverride(slide);
    setLive(true);
    if (reference) {
      notifications.show({
        message: tr('На екрані: {ref}', { ref: reference }),
        color: 'live',
        autoClose: 1500,
      });
    }
  };

  // Project a free-text slide (announcement / note / custom text) and keep it in recents.
  const projectAnnouncement = (title: string, body: string) => {
    if (!body.trim()) return;
    projectText(body, title.trim());
    pushRecentText({ title, body });
    if (!title.trim()) {
      notifications.show({ message: tr('Текст на екрані'), color: 'live', autoClose: 1500 });
    }
  };

  // --- Presentation sequence (playlist) ---------------------------------------
  // Project a saved passage: set the selection (so the list/preview follow) and
  // push the slide directly from freshly-fetched verses (don't wait on the
  // selection-derived `slideLines`, which only updates on the next render/query).
  const activatePassage = async (it: SeqPassage) => {
    setTranslations(it.translationIds);
    selectBook(it.bookNumber);
    selectChapter(it.chapter);
    setSelectedVerses(it.verses);
    setScrollTarget(it.verses[0] ?? null);
    const lines: SlideLine[] = [];
    for (const id of it.translationIds) {
      try {
        const verses = await queryClient.fetchQuery({
          queryKey: ['verses', id, it.bookNumber, it.chapter],
          queryFn: () => api.verses(id, it.bookNumber, it.chapter),
        });
        const text = joinVerses(verses, it.verses, appearance.showVerseNumbers);
        if (!text.trim()) continue;
        const t = translations.find((x) => x.id === id);
        const segments = redLetterSegments(verses, it.verses, appearance.showVerseNumbers);
        lines.push({ translationAbbr: t?.abbr ?? '', text, rtl: !!t?.rtl, segments });
      } catch {
        /* skip a translation that fails to load */
      }
    }
    if (lines.length === 0) {
      // Every translation failed to load (e.g. ids changed after a library rebuild).
      notifications.show({
        message: tr('Уривок недоступний — переклад змінився. Оновіть елемент показу.'),
        color: 'red',
        autoClose: 2500,
      });
      return;
    }
    pushLive({
      lines,
      reference: it.label,
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
      source: {
        kind: 'verses',
        translationIds: it.translationIds,
        bookNumber: it.bookNumber,
        chapter: it.chapter,
        verses: it.verses,
        page: 0,
        reveal: 1,
      },
    });
    setPreviewOverride(null);
    setLive(true);
  };

  // Open a saved song in the Songs panel and project its first stanza; further
  // stanzas are stepped with the arrows inside the panel (existing behaviour).
  const activateSong = async (it: SeqSong) => {
    openSong(it.songId);
    setSongsOpen(true);
    try {
      // by its id — or by its label when the id changed (song bundles, 0.10.0)
      const s = await findSong(it.songId, it.label, it.bundle, {
        song: (id) =>
          queryClient.fetchQuery({ queryKey: ['song', id], queryFn: () => api.song(id) }),
        search: (q) => api.songs(q),
      });
      if (!s) return;
      if (s.id !== it.songId) {
        playlistRelinkSong(it.songId, it.label, s.id, s.bundle);
        openSong(s.id);
      }
      if (s.slides.length > 0) {
        projectText(
          s.slides[0].text,
          `№${s.number ?? ''} ${s.title}`.trim(),
          it.faithful ? s.slides[0].style : null,
          { kind: 'song', songId: s.id, stanza: 0 },
          s.slides[0].style,
        );
        // Seed the panel's stanza highlight to 0 so the first arrow/clicker advances
        // to stanza 1 (not re-projects the title we just put on screen).
        setSongsPanelStanza(0);
      }
    } catch {
      /* ignore a song that fails to load */
    }
  };

  const activateItem = (it: SeqItem) => {
    playlistSetCurrent(it.id);
    if (it.kind === 'passage') void activatePassage(it);
    else if (it.kind === 'text') projectText(it.body, it.title.trim());
    else void activateSong(it);
  };

  const stepPlaylist = (delta: 1 | -1) => {
    if (playlistItems.length === 0) return;
    const idx = playlistItems.findIndex((i) => i.id === playlistCurrentId);
    const next =
      idx < 0
        ? delta > 0
          ? 0
          : playlistItems.length - 1
        : Math.min(playlistItems.length - 1, Math.max(0, idx + delta));
    activateItem(playlistItems[next]);
  };

  const addCurrentPassage = () => {
    if (
      selectedIds.length === 0 ||
      bookNumber == null ||
      chapter == null ||
      selectedVerses.length === 0
    )
      return;
    playlistAdd({
      kind: 'passage',
      label: reference || referenceShort || tr('Уривок'),
      translationIds: selectedIds,
      bookNumber,
      chapter,
      verses: selectedVerses,
    });
    notifications.show({
      message: tr('Додано у показ: {item}', { item: referenceShort || reference }),
      color: 'green',
      autoClose: 1200,
    });
  };

  const addSongToPlaylist = (song: {
    songId: number;
    label: string;
    bundle: string;
    faithful: boolean;
  }) => {
    playlistAdd({
      kind: 'song',
      label: song.label || tr('Пісня'),
      songId: song.songId,
      ...(song.bundle ? { bundle: song.bundle } : {}),
      faithful: song.faithful,
    });
    notifications.show({
      message: tr('Додано у показ: {item}', { item: song.label }),
      color: 'green',
      autoClose: 1200,
    });
  };

  const addTextToPlaylist = (item: { title: string; body: string }) => {
    if (!item.body.trim()) return;
    const label = item.title.trim() || item.body.trim().split('\n')[0].slice(0, 40);
    playlistAdd({ kind: 'text', label, title: item.title, body: item.body });
    notifications.show({ message: tr('Текст додано у показ'), color: 'green', autoClose: 1200 });
  };

  // While following live, republish when the selection, reference, or appearance
  // changes. With follow off, navigation only updates the preview — push with F5/F2.
  // Skip while a song/text/Strong projection (`previewOverride`) owns the screen, or
  // live-follow would clobber it back to the verse selection on the next render
  // (slideLines gets a fresh identity every render via useQueries). Navigating the
  // verses clears the override, after which live-follow resumes.
  useEffect(() => {
    if (adopting.current) return; // taking over: the screen stays until page/reveal are set
    if (liveFollow && live && !screenHeld && slideLines.length > 0 && !previewOverride) send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slideLines,
    reference,
    slideStyle,
    slideTemplate,
    liveFollow,
    screenHeld,
    previewOverride,
    revealCount,
    appearance.reveal,
    appearance.revealSpotlight,
    appearance.revealPlaceholders,
  ]);

  // A song/text/Strong projection takes over the preview; navigating the verse
  // selection reverts the preview to the verses.
  useEffect(() => {
    setPreviewOverride(null);
  }, [selectedVerses, bookNumber, chapter, primaryId]);

  // After a search/history/concordance jump, scroll the target verse to centre.
  // Deferred a tick so the list (and the closing search panel) settle their layout.
  // Clear scrollTarget only inside the timeout — clearing it synchronously would
  // re-run this effect and its cleanup would cancel the pending scroll.
  useEffect(() => {
    if (scrollTarget == null || !primaryVerses.some((v) => v.verse === scrollTarget)) return;
    const verse = scrollTarget;
    const id = window.setTimeout(() => {
      // Instant, not smooth: Mantine/Radix ScrollArea's viewport ignores
      // smooth scrollIntoView (it never scrolls), instant centres reliably.
      const row = document.querySelector<HTMLElement>(`.vo-verse-item[data-verse="${verse}"]`);
      row?.scrollIntoView({ block: 'center' });
      if (focusJump.current) row?.focus({ preventScroll: true });
      focusJump.current = false;
      setScrollTarget(null);
    }, 60);
    return () => window.clearTimeout(id);
  }, [scrollTarget, primaryVerses]);

  // A chapter opened with no verse to bring into view (a book picked, a chapter clicked)
  // starts at its top, not where the last one was scrolled to; a jump has its scroll target.
  // Only another place does — «Зробити головним» keeps the scroll (lib/bookPick.ts opensAtTop).
  const verseViewport = useRef<HTMLDivElement>(null);
  const shownPlace = useRef<OpenPlace>({ bookNumber, chapter });
  useEffect(() => {
    const open = { bookNumber, chapter };
    const top = opensAtTop(shownPlace.current, open, scrollTarget);
    shownPlace.current = open;
    if (top && verseViewport.current) verseViewport.current.scrollTop = 0;
  }, [bookNumber, chapter, scrollTarget]);

  // Record what was opened into history.
  useEffect(() => {
    if (
      reference &&
      primaryId != null &&
      bookNumber != null &&
      chapter != null &&
      selectedVerses.length
    ) {
      pushHistory({
        ref: reference,
        refShort: referenceShort,
        translationId: primaryId,
        bookNumber,
        chapter,
        verse: selectedVerses[0],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  const stepVerse = (delta: number, previewOnly = false): Outcome | Promise<Outcome> => {
    if (primaryVerses.length === 0) return { ok: false, reason: tr('Спершу виберіть розділ') };
    const all = primaryVerses.map((v) => v.verse);
    const current = selectedVerses.length ? selectedVerses[selectedVerses.length - 1] : all[0] - 1;
    const idx = all.indexOf(current);
    const next = all[Math.min(all.length - 1, Math.max(0, idx + delta))];
    if (next == null || next === current) return crossChapter(delta, previewOnly);
    crossArm.current = null;
    setSelectedVerses([next]);
    return { ok: true };
  };

  // At the chapter's edge (0.6.23): the first press says where a second one goes; pressed
  // again within 5 s it opens the next chapter's first verse (the previous one's last going
  // back) — on screen too when the screen follows the selection. At a book's edge the same
  // two presses open the next book (1.4.0).
  const crossArm = useRef<CrossArm | null>(null);
  const crossChapter = async (delta: number, previewOnly = false): Promise<Outcome> => {
    if (primaryId == null || bookNumber == null || chapter == null) {
      return { ok: false, reason: tr('Спершу виберіть розділ') };
    }
    const tid = primaryId;
    const book = bookNumber;
    // armed before anything loads, so a quick second press still counts as the second
    const key = `${tid}:${book}:${chapter}:${delta > 0 ? 1 : -1}`;
    const press = pressAtEdge(crossArm.current, key, Date.now());
    crossArm.current = press.arm;
    const onScreen = !previewOnly && liveFollow && live && !previewOverride;
    const target = await crossTarget(
      { book, chapter },
      chapters,
      books.map((b) => b.bookNumber),
      delta,
      (b) =>
        queryClient.fetchQuery({
          queryKey: ['chapters', tid, b],
          queryFn: () => api.chapters(tid, b),
        }),
    );
    if (!target) {
      crossArm.current = null;
      return { ok: false, reason: translationEdge(delta) };
    }
    const to = target.chapter;
    const toBook = books.find((b) => b.bookNumber === target.book) ?? currentBook;
    if (!press.cross) {
      return {
        ok: false,
        reason: edgeNotice(delta, chapterName(toBook, to), target.newBook),
      };
    }
    const verses = await queryClient.fetchQuery({
      queryKey: ['verses', tid, target.book, to],
      queryFn: () => api.verses(tid, target.book, to),
    });
    const v = landingVerse(
      verses.map((x) => x.verse),
      delta,
    );
    if (v == null) return { ok: false, reason: tr('У цьому розділі немає віршів') };
    const label = formatReference(toBook, to, [v]);
    if (onScreen) {
      await activatePassage({
        kind: 'passage',
        id: `cross-${target.book}-${to}-${v}`,
        label,
        translationIds: selectedIds,
        bookNumber: target.book,
        chapter: to,
        verses: [v],
      });
    } else {
      if (target.newBook) selectBook(target.book);
      selectChapter(to);
      setSelectedVerses([v]);
      setScrollTarget(v);
    }
    return { ok: true, reason: label };
  };
  /** Keys and buttons: say why the show didn't move (at a chapter's edge: what's next). */
  const advanceAndSay = (delta: number, previewOnly = false) => {
    // the first preview-only step while the screen follows: say that the screen stays
    if (previewOnly && liveFollow && live && !screenHeld) {
      notifications.show({
        id: 'screen-held',
        message: tr('Екран стоїть, прев’ю йде далі. Показати прев’ю — «На екран».'),
        color: 'cue',
        autoClose: 3000,
      });
    }
    void Promise.resolve(advance(delta, previewOnly)).then((o) => {
      if (!o.ok && o.reason) {
        notifications.show({ message: o.reason, color: 'gray', autoClose: 2500 });
      }
    });
  };

  // "Next/previous": with a long passage split across pages, step pages; otherwise
  // step the single verse. Drives arrows, the PageDown/PageUp clicker keys, and the
  // preview's page arrows — so the same gesture always means "advance the screen".
  /**
   * One step of the show (reveal → page → verse); says whether anything moved. `previewOnly`
   * (Alt+arrows): the screen stays while «Наживо» is on; a plain step lets it follow again.
   */
  const advance = (delta: number, previewOnly = false): Outcome | Promise<Outcome> => {
    setScreenHeld(previewOnly && liveFollow && live);
    // Progressive reveal first: step through the verses of the current slide before
    // moving on. Only while projecting the verse selection (no song/text override).
    if (appearance.reveal && revealUnits && revealUnits.length > 1 && !previewOverride) {
      if (delta > 0 && revealCount < revealUnits.length) {
        setRevealCount((c) => Math.min(revealUnits.length, c + 1));
        return { ok: true };
      }
      if (delta < 0 && revealCount > 1) {
        setRevealCount((c) => Math.max(1, c - 1));
        return { ok: true };
      }
      // Exhausted in this direction → fall through to step the page/verse.
    }
    if (pageCount > 1) {
      const target = Math.min(pageCount - 1, Math.max(0, safePageIndex + delta));
      if (target === safePageIndex) {
        return {
          ok: false,
          reason: delta > 0 ? tr('Це остання сторінка') : tr('Це перша сторінка'),
        };
      }
      // Moving to a new page: start its reveal fresh in THIS batched update (not via the
      // post-commit reset effect) so live-follow doesn't push the new content at the old
      // reveal count for a frame. Paging also ends any projection override, so
      // live-follow pushes the new page (the page alone doesn't touch the selection).
      setRevealCount(1);
      setPreviewOverride(null);
      setPageIndex(target);
      return { ok: true };
    }
    const moved = stepVerse(delta, previewOnly);
    if (!(moved instanceof Promise) && moved.ok) setRevealCount(1); // same batch as the verse
    return moved;
  };

  // Reset the reveal to the first verse whenever the projected content changes.
  useEffect(() => {
    setRevealCount(1);
  }, [selectedVerses, safePageIndex, primaryId]);

  // Taking over (0.5.10): once the adopted selection is in, restore its page, then its
  // reveal step and a Strong slide — declared after the reset effects above, so it runs
  // after them in the same commit and wins. Live-follow waits until this is done.
  useEffect(() => {
    const a = adopting.current;
    if (!a || JSON.stringify([selectedIds, bookNumber, chapter, selectedVerses]) !== a.key) return;
    const page = Math.min(a.page, Math.max(0, pageCount - 1));
    if (safePageIndex !== page) {
      setPageIndex(page);
      return;
    }
    setRevealCount(a.reveal);
    if (a.override) setPreviewOverride(a.override);
    adopting.current = null;
  }, [selectedIds, bookNumber, chapter, selectedVerses, safePageIndex, pageCount]);

  // Hotkeys are user-rebindable (settingsStore.keymap; defaults in hotkeys.ts).
  // "advanceNext/Prev" default to arrows + PageDown/PageUp (the keys USB clickers emit).
  useHotkeys(keymap.advanceNext, () => advanceAndSay(1), [
    keymap.advanceNext,
    pageCount,
    pageIndex,
    primaryVerses,
    selectedVerses,
    revealCount,
    revealUnits,
    appearance.reveal,
    previewOverride,
    chapters,
    live,
    liveFollow,
    selectedIds,
    currentBook,
  ]);
  useHotkeys(keymap.advancePrev, () => advanceAndSay(-1), [
    keymap.advancePrev,
    pageCount,
    pageIndex,
    primaryVerses,
    selectedVerses,
    revealCount,
    revealUnits,
    appearance.reveal,
    previewOverride,
    chapters,
    live,
    liveFollow,
    selectedIds,
    currentBook,
  ]);
  // «Прев’ю: далі / назад» (1.1.0): the same step, the screen stays. preventDefault: the
  // browser would scroll the list (Ctrl+↑/↓) or, on a Mac with ⌥, move the caret.
  const previewDeps = [
    pageCount,
    pageIndex,
    primaryVerses,
    selectedVerses,
    revealCount,
    revealUnits,
    appearance.reveal,
    previewOverride,
    chapters,
    live,
    liveFollow,
    screenHeld,
    selectedIds,
    currentBook,
  ];
  useHotkeys(keymap.previewNext, () => advanceAndSay(1, true), { preventDefault: true }, [
    keymap.previewNext,
    ...previewDeps,
  ]);
  useHotkeys(keymap.previewPrev, () => advanceAndSay(-1, true), { preventDefault: true }, [
    keymap.previewPrev,
    ...previewDeps,
  ]);
  // Alt+↑/↓ scroll the list under the focus (else the verses) by a line — what Ctrl+↑/↓ did
  // before they became the preview's (1.1.0, the operator's ask); Alt+←/→ do nothing rather
  // than the browser's Back and Forward, which would leave the control window mid-show.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (isFormField(e.target)) return; // the caret's own moves
      if (matchesCombo(e, keymap.previewNext) || matchesCombo(e, keymap.previewPrev)) return;
      e.preventDefault();
      const dy = e.key === 'ArrowDown' ? 40 : e.key === 'ArrowUp' ? -40 : 0;
      if (dy) scrollableAround(document.activeElement, '.vo-verse-item')?.scrollBy({ top: dy });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keymap.previewNext, keymap.previewPrev]);
  // Remove the slide from the output. Drops out of live so the live-follow effect
  // doesn't immediately re-project the selection (pushLive's setLiveSlide re-renders,
  // which would re-run that effect).
  // «QR на екран» (0.6.16): the viewers' QR as a slide; «Прибрати QR» brings back exactly
  // the slide it covered (not the selection — the operator may have browsed meanwhile). The
  // slide carries what it covers (lib/slide.ts `qrOver`, 1.4.2), so any control window that
  // leads now can give it back.
  const showQr = () => {
    const slide = qrOver(liveSlideRef.current, followUrl, slideStyle, tr('QR для глядачів'));
    pushLive(slide, { audience: false });
    setPreviewOverride(slide);
    setLive(true);
  };
  // «Заставка» (1.4.0): the logo and text from Налаштування вигляду → Заставка over whatever
  // is on screen; again — exactly the slide it covered (as «QR на екран» does, `coverOver`).
  // The phones get it without the image: an empty slide, «· · ·».
  const coverToggle = () => {
    if (!leaderRef.current) return standbyNotice();
    const now = liveSlideRef.current;
    if (!now.cover) {
      const cover = { text: appearance.coverText, image: appearance.coverImage };
      const slide = coverOver(now, cover, slideStyle, tr('Заставка'));
      pushLive(slide);
      setPreviewOverride(slide);
      setLive(true);
      if (!appearance.coverText && !appearance.coverImage) {
        notifications.show({
          message: tr(
            'Заставка поки порожня — лише фон. Додайте логотип чи текст: Налаштування вигляду → Заставка',
          ),
          color: 'gray',
          autoClose: 4000,
        });
      }
      return;
    }
    const back = uncover(now);
    if (!back) {
      pushLive({ lines: [], reference: '', blank: false, visible: false, style: slideStyle });
      setLive(false);
      setPreviewOverride(null);
      return;
    }
    pushLive(back);
    afterToggle(back);
  };
  const hideQr = () => {
    const back = uncover(liveSlideRef.current);
    if (!back) {
      pushLive({ lines: [], reference: '', blank: false, visible: false, style: slideStyle });
      setLive(false);
      setPreviewOverride(null);
      return;
    }
    const restored: Slide = {
      ...back,
      style: { ...(back.style ?? slideStyle), qrCorner: slideStyle.qrCorner },
    };
    pushLive(restored);
    setLive(!restored.blank);
    // verses: live-follow picks up again on the next step; a song / text keeps the screen
    setPreviewOverride(restored.source?.kind === 'verses' ? null : restored);
  };
  // The corner QR switched on/off or restyled (0.6.20): show it on what is on screen now,
  // whatever that is (the QR slide itself too).
  useEffect(() => {
    const s = liveSlideRef.current;
    if (!s.visible || s.forceBlack) return;
    const same =
      (s.style?.qrCorner ?? null) === slideStyle.qrCorner &&
      (s.style?.qrStyle ?? null) === (slideStyle.qrStyle ?? null);
    if (same) return;
    pushLive(
      {
        ...s,
        style: {
          ...(s.style ?? slideStyle),
          qrCorner: slideStyle.qrCorner,
          qrStyle: slideStyle.qrStyle,
        },
      },
      { audience: !s.qr },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideStyle.qrCorner, slideStyle.qrStyle]);

  // «Очистити» can be taken back (0.13.2): the slide it removed stays at hand (`clearedRef`)
  // until something else goes on screen. Esc again keeps the screen empty — a panicked double
  // press must not bring back what was just cleared — so taking back is its own key
  // (Ctrl+Z / ⌘Z), the palette, or «Повернути» in the notice.
  const clearScreen = () => {
    const was = liveSlideRef.current;
    const takeBack = leaderRef.current && was.visible;
    pushLive({ lines: [], reference: '', blank: false, visible: false });
    setLive(false);
    if (!takeBack) return;
    clearedRef.current = was;
    notifications.hide(CLEARED_NOTICE);
    notifications.show({
      id: CLEARED_NOTICE,
      color: 'gray',
      autoClose: 6000,
      message: (
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text size="sm">
            {tr('Екран очищено · {key} повертає', {
              key: formatCombo(useSettings.getState().keymap.restore),
            })}
          </Text>
          <Button size="compact-xs" variant="light" onClick={() => restoreRef.current()}>
            {tr('Повернути')}
          </Button>
        </Group>
      ),
    });
  };
  useHotkeys(keymap.blank, () => hideToggle(), [keymap.blank, versePreview, live]);
  // Esc with a floating panel open closes the panel (FloatingPanel) — not the screen too.
  useHotkeys(
    keymap.clear,
    (e) => {
      if (e.key === 'Escape' && floatingPanelOpen()) return;
      clearScreen();
    },
    [keymap.clear],
  );
  useHotkeys(keymap.searchCurrent, () => openSearch('current'), {
    preventDefault: true,
    enableOnFormTags: true,
  });
  useHotkeys(keymap.searchAll, () => openSearch('all'), {
    preventDefault: true,
    enableOnFormTags: true,
  });
  useHotkeys(keymap.palette, () => setPaletteOpen((o) => !o), {
    preventDefault: true,
    enableOnFormTags: true,
  });

  const sendAndNotify = () => {
    if (!leaderRef.current) return standbyNotice();
    send();
    if (slideLines.length > 0) {
      notifications.show({
        message: tr('На екрані: {ref}', { ref: pageReference }),
        color: 'live',
        autoClose: 1500,
      });
    }
  };

  // «На екран» in the typed-number box (showJump, set by quickJump): show the place once it
  // is the selection and every translation's verses are in — from its first page and reveal
  // step (quickJump sets both with the selection; declared after their reset effects, so it
  // runs after them in the same commit)
  useEffect(() => {
    const wait = showJump.current;
    if (!wait) return;
    const step = showStep(wait.key, {
      place: placeKey(bookNumber, chapter, selectedVerses),
      loading: verseQueries.some((q) => q.isPending),
      ready: slideLines.length > 0,
      page: safePageIndex,
      revealStep: appearance.reveal ? revealCount : null,
    });
    if (step === 'firstPage') setPageIndex(0);
    else if (step === 'firstStep') setRevealCount(1);
    if (step !== 'show') return;
    window.clearTimeout(wait.timer);
    showJump.current = null;
    sendAndNotify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bookNumber,
    chapter,
    selectedVerses,
    verseQueries,
    slideLines,
    safePageIndex,
    appearance.reveal,
    revealCount,
  ]);

  // Enter on a verse projects it straight away (no need to enable live-follow / press
  // F5). If it's already part of the selection, project the whole selection; otherwise
  // select just this verse and push it directly (built from the loaded chapter, so we
  // don't wait for the selection-derived slideLines to recompute).
  const projectVerseOnEnter = (verseNum: number) => {
    if (selectedVerses.includes(verseNum)) {
      sendAndNotify();
      return;
    }
    setSelectedVerses([verseNum]);
    const lines = buildLines([verseNum]);
    if (lines.length === 0) return;
    pushLive({
      lines,
      reference: formatReference(currentBook, chapter, [verseNum]),
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
      source: verseSource([verseNum], 0, 1),
    });
    setLive(true);
    setPreviewOverride(null);
    notifications.show({
      message: tr('На екрані: {ref}', {
        ref: formatReference(currentBook, chapter, [verseNum], true),
      }),
      color: 'live',
      autoClose: 1500,
    });
  };

  // "project" (default F5/F2): push the current selection to the screen (the way to
  // project when live-follow is off; harmless while following).
  useHotkeys(
    keymap.project,
    () => sendAndNotify(),
    { preventDefault: true, enableOnFormTags: true },
    [
      keymap.project,
      slideLines,
      reference,
      slideStyle,
      revealCount,
      appearance.reveal,
      appearance.revealSpotlight,
      appearance.revealPlaceholders,
    ],
  );

  // «Сховати текст» / «Чорний екран» (0.6.18): switches over what is on screen — the same
  // slide comes back on the second press (lib/slide.ts). Hiding: the text fades, the
  // background and the corner QR stay (B). Black: an instant cut, everything (.).
  const afterToggle = (s: Slide) => {
    // «Заставка» counts (1.4.1): black or hidden over it and back used to read as nothing
    if (!showsSomething(s)) {
      setLive(false);
      return;
    }
    // back on screen: follow the selection again only if it is what came back
    const verses = s.source?.kind === 'verses';
    setLive(verses && sameContent(s, versePreview));
    setPreviewOverride(verses ? null : s);
  };
  const hideToggle = () => {
    if (!leaderRef.current) return standbyNotice();
    const next = toggleHidden(liveSlideRef.current);
    if (!next) {
      notifications.show({
        message: tr('На екрані нічого ховати'),
        color: 'gray',
        autoClose: 1200,
      });
      return;
    }
    pushLive(next);
    afterToggle(next);
    notifications.show(
      next.blank
        ? { message: tr('Текст сховано — фон лишається'), color: 'cue', autoClose: 1500 }
        : { message: tr('Текст знову на екрані'), color: 'live', autoClose: 1200 },
    );
  };
  const blackToggle = () => {
    if (!leaderRef.current) return standbyNotice();
    const next = toggleBlack(liveSlideRef.current);
    pushLive(next);
    afterToggle(next);
    notifications.show(
      next.forceBlack
        ? { message: tr('Чорний екран'), color: 'dark', autoClose: 1200 }
        : { message: tr('Чорний екран знято'), color: 'live', autoClose: 1200 },
    );
  };
  useHotkeys(keymap.black, () => blackToggle(), [keymap.black, versePreview]);
  useHotkeys(keymap.cover, () => coverToggle(), [keymap.cover, versePreview, appearance]);

  /** Take back «Очистити» (0.13.2): exactly the slide it removed, as the toggles do. */
  const restoreCleared = () => {
    if (!leaderRef.current) return standbyNotice();
    const back = clearedRef.current;
    notifications.hide(CLEARED_NOTICE);
    if (!back || liveSlideRef.current.visible) {
      clearedRef.current = null;
      notifications.show({
        message: tr('Немає чого повертати на екран'),
        color: 'gray',
        autoClose: 1200,
      });
      return;
    }
    pushLive(back);
    afterToggle(back);
    notifications.show({ message: tr('Знову на екрані'), color: 'live', autoClose: 1200 });
  };
  // the notice's button and the key run the latest one (it reads the current preview)
  const restoreRef = useRef(restoreCleared);
  restoreRef.current = restoreCleared;
  useHotkeys(keymap.restore, () => restoreRef.current(), { preventDefault: true }, [
    keymap.restore,
  ]);

  // «Далі» after a song's last stanza (0.6.24): an empty slide — the stanza's text goes, its
  // background stays (the same slide, hidden, as «Сховати текст»); «Назад» or any stanza
  // brings text back. Only over a song: after a song the screen shows nothing to read.
  const songEnd = (): Outcome => {
    if (!leaderRef.current) return { ok: false, reason: tr('Показом керує інше вікно керування') };
    const s = liveSlideRef.current;
    if (s.source?.kind !== 'song' || !s.visible) {
      return { ok: false, reason: tr('На екрані не пісня — ховати нічого') };
    }
    if (s.blank || s.forceBlack) return { ok: true }; // nothing to read already
    const next: Slide = { ...s, blank: true };
    pushLive(next);
    afterToggle(next);
    return { ok: true };
  };

  // Show commands from outside the operator's keyboard — an output window's keys (a
  // clicker on the 2nd monitor) and speaker remotes — all go through one dispatcher
  // (lib/commands.ts). This is the default handler; an open song registers a
  // higher-priority one for next/prev (SongsPanel).
  useCommandHandler((cmd, _source, args) => {
    if (cmd === 'next') return advance(1);
    if (cmd === 'prev') return advance(-1);
    const by = _source.name ?? tr('Пульт');
    // an item of the shared running order (0.6.9)
    if (args.item && (cmd === 'show' || cmd === 'pick')) {
      const it = playlistItems.find((i) => i.id === args.item);
      if (!it) return { ok: false, reason: tr('Цього елемента вже немає в послідовності') };
      return playlistItemSlide(it, by).then((slide) => {
        if (cmd === 'show') {
          if (!leaderRef.current)
            return { ok: false, reason: tr('Показом керує інше вікно керування') };
          pushLive(slide);
          setLive(false);
          playlistSetCurrent(it.id);
        }
        setRemoteView({ name: by, target: itemTarget(it), slide });
        return { ok: true };
      });
    }
    if (cmd === 'queue') {
      return args.passage || args.song
        ? queueFromRemote(
            args.passage
              ? { kind: 'verses', passage: args.passage }
              : { kind: 'song', song: args.song! },
            by,
          )
        : { ok: false, reason: tr('Нічого додати') };
    }
    const target: RemoteTarget | null = args.passage
      ? { kind: 'verses', passage: args.passage }
      : args.song
        ? { kind: 'song', song: args.song }
        : null;
    if (cmd === 'show') return target ? showRemote(target, by) : showPreview();
    if (cmd === 'pick') {
      return target
        ? buildRemote(target, by).then((slide) => {
            setRemoteView({ name: by, target, slide });
            return { ok: true };
          })
        : { ok: false, reason: tr('Не вибрано вірш') };
    }
    // the switches: B, «.» and (1.4.1) L pressed in an output window, a remote's buttons —
    // each by name (lib/commands.ts toggleOf), none by default
    const toggle = toggleOf(cmd);
    if (!toggle) return null;
    const flip: Record<ShowToggle, () => void> = {
      hide: hideToggle,
      black: blackToggle,
      cover: coverToggle,
    };
    flip[toggle]();
    return { ok: true };
  }, PRIORITY.verses);

  /**
   * A remote's «На екран» (0.6.0): what the preview shows goes on screen — the operator's
   * F5. A song stanza / free text / Strong slide in the preview is what's shown then.
   */
  /**
   * A passage chosen on a speaker's phone (0.6.1, the remote's own cursor) as a slide —
   * built here, in the operator's style, from the library; the operator's selection is
   * not touched. Throws «Уривок недоступний» when none of its translations has it.
   */
  async function remoteSlide(p: RemotePassage, by: string): Promise<Slide> {
    const lines: SlideLine[] = [];
    for (const id of p.translationIds) {
      const verses = await queryClient.fetchQuery({
        queryKey: ['verses', id, p.bookNumber, p.chapter],
        queryFn: () => api.verses(id, p.bookNumber, p.chapter),
      });
      const text = joinVerses(verses, p.verses, appearance.showVerseNumbers);
      if (!text.trim()) continue;
      const t = translations.find((x) => x.id === id);
      const segments = redLetterSegments(verses, p.verses, appearance.showVerseNumbers);
      lines.push({ translationAbbr: t?.abbr ?? '', text, rtl: !!t?.rtl, segments });
    }
    if (lines.length === 0) throw new Error(tr('Уривок недоступний'));
    const first = p.translationIds[0];
    const bookList = await queryClient.fetchQuery({
      queryKey: ['books', first],
      queryFn: () => api.books(first),
    });
    return {
      lines,
      reference: formatReference(
        bookList.find((b) => b.bookNumber === p.bookNumber) ?? null,
        p.chapter,
        p.verses,
      ),
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
      source: { kind: 'verses', ...p, page: 0, reveal: 1, by },
    };
  }

  /** A song stanza chosen on a remote (0.6.3), in the operator's style (not «як у pptx»). */
  async function remoteSongSlide(p: RemoteSong, by: string): Promise<Slide> {
    const s = await queryClient.fetchQuery({
      queryKey: ['song', p.songId],
      queryFn: () => api.song(p.songId),
    });
    const stanza = s.slides[p.stanza];
    if (!stanza) throw new Error(tr('Такої строфи немає'));
    const line: SlideLine = { translationAbbr: '', text: stanza.text, rtl: false };
    const marked = markedText(stanza.text, stanza.style);
    return {
      // its second part dimmer, as in «Простий текст» (1.3.0)
      lines: [marked ? withSecond(line, marked) : line],
      reference: `№${s.number ?? ''} ${s.title}`.trim(),
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
      source: { kind: 'song', songId: p.songId, stanza: p.stanza, by },
    };
  }

  const buildRemote = (t: RemoteTarget, by: string) =>
    t.kind === 'verses' ? remoteSlide(t.passage, by) : remoteSongSlide(t.song, by);

  /** A running-order item as a remote target (a free-text item has none). */
  const itemTarget = (it: SeqItem): RemoteTarget | null =>
    it.kind === 'passage'
      ? {
          kind: 'verses',
          passage: {
            translationIds: it.translationIds,
            bookNumber: it.bookNumber,
            chapter: it.chapter,
            verses: it.verses,
          },
        }
      : it.kind === 'song'
        ? { kind: 'song', song: { songId: it.songId, stanza: 0 } }
        : null;

  /**
   * A running-order item shown from a remote (0.6.9) — built like the speaker's own choice
   * (the operator's style, their selection untouched); a free-text item as the operator
   * projects it.
   */
  function playlistItemSlide(it: SeqItem, by: string): Promise<Slide> {
    const t = itemTarget(it);
    if (t) return buildRemote(t, by);
    const text = it.kind === 'text' ? it : null;
    return Promise.resolve({
      lines: [{ translationAbbr: '', text: text?.body ?? '', rtl: false }],
      reference: text?.title.trim() ?? '',
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
    });
  }

  /** The speaker adds their choice to the shared running order (0.6.9). */
  async function queueFromRemote(t: RemoteTarget, by: string): Promise<Outcome> {
    let label: string;
    if (t.kind === 'verses') {
      const p = t.passage;
      const first = p.translationIds[0];
      const bookList = await queryClient.fetchQuery({
        queryKey: ['books', first],
        queryFn: () => api.books(first),
      });
      label =
        formatReference(
          bookList.find((b) => b.bookNumber === p.bookNumber) ?? null,
          p.chapter,
          p.verses,
        ) || tr('Уривок');
      playlistAdd({ kind: 'passage', label, ...p });
    } else {
      const s = await queryClient.fetchQuery({
        queryKey: ['song', t.song.songId],
        queryFn: () => api.song(t.song.songId),
      });
      label = `№${s.number ?? ''} ${s.title}`.trim();
      playlistAdd({ kind: 'song', label, songId: t.song.songId, faithful: false });
    }
    notifications.show({
      message: tr('Пульт «{remote}» додав у показ: {item}', { remote: by, item: label }),
      color: 'brand',
      autoClose: 2000,
    });
    return { ok: true };
  }

  /**
   * The remote puts its passage / stanza on screen. The screen is the speaker's now: the
   * operator's selection stops following live (`live` off) — they keep preparing, and
   * their F5 / «На екран» takes the screen back.
   */
  async function showRemote(t: RemoteTarget, by: string): Promise<Outcome> {
    const slide = await buildRemote(t, by);
    if (!leaderRef.current) return { ok: false, reason: tr('Показом керує інше вікно керування') };
    pushLive(slide);
    setLive(false);
    setRemoteView({ name: by, target: t, slide });
    return { ok: true };
  }

  function showPreview(): Outcome {
    if (previewOverride) {
      pushLive(previewOverride);
      setLive(true);
      return { ok: true };
    }
    if (slideLines.length === 0) return { ok: false, reason: tr('У передпоказі нічого немає') };
    const onScreen =
      liveSlide.visible && !liveSlide.blank && !liveSlide.forceBlack && liveSlide.lines.length > 0;
    if (onScreen && sameContent(liveSlide, versePreview))
      return { ok: true, reason: tr('Уже на екрані') };
    send();
    return { ok: true };
  }
  useEffect(
    () =>
      subscribeCommand((cmd, id) => {
        if (!leaderRef.current) return;
        void commands.dispatch(id, cmd, { kind: 'output' }).then((o) => {
          // a clicker at the output window can't see why nothing moved — the operator can
          // (at a chapter's edge: where a second press goes, 0.6.23)
          if (!o.ok && !o.duplicate && o.reason) {
            notifications.show({ message: o.reason, color: 'gray', autoClose: 2500 });
          }
        });
      }),
    [],
  );

  // Speaker remotes: this window holds the hub's control socket; paired phones' commands
  // (already scope-checked by the server) run through the same handler as the output
  // window's forwarded keys. A 'remotes' frame means the pairing list changed.
  // Remotes get compact summaries (lib/slide.ts) of what's on screen and what «Далі» shows.
  const screenFrame = () => ({
    type: 'screen',
    screen: summarize(liveSlideRef.current),
    next: nextSlideRef.current ? summarize(nextSlideRef.current) : null,
    // what the remote's «На екран» would put there (0.6.0)
    preview: JSON.parse(previewSummary.current) as ReturnType<typeof summarize>,
  });
  // the preview gets a new identity every render: compare its summary instead
  const previewSummary = useRef('');
  previewSummary.current = JSON.stringify(summarize(previewSlide));
  const liveSlideRef = useRef(liveSlide);
  liveSlideRef.current = liveSlide;
  const nextSlideRef = useRef(nextSlide);
  nextSlideRef.current = nextSlide;

  // Leader ⇄ standby (0.4.4). Standby: publish nothing and mirror what the leader shows
  // (the «На екрані» monitor stays true). Becoming leader — at start, when the leading
  // window closes, or on «Взяти керування»: take the screen over as it is (republished
  // under this window's session, nothing visibly changes) and publish this window's «next».
  //
  // Taking over after another window led (0.5.10) — not at start, when nobody else did —
  // also stands this window on what is on screen (lib/takeover.ts): the selection, page
  // and reveal step, or the song and stanza, so its first «Далі» continues the show.
  const mirrored = useRef(false);
  /** A song taken over: «live» goes on only once its slide is the preview override. */
  const songTakeover = useRef<Slide | null>(null);
  const adoptScreen = (screen: Slide) => {
    const t = planTakeover(screen);
    if (t.kind === 'verses') {
      const a = {
        key: JSON.stringify([t.translationIds, t.bookNumber, t.chapter, t.verses]),
        page: t.page,
        reveal: t.reveal,
        override: t.override,
      };
      adopting.current = a;
      setTranslations(t.translationIds);
      selectBook(t.bookNumber);
      selectChapter(t.chapter);
      setSelectedVerses(t.verses);
      setLive(t.live);
      setScrollTarget(t.verses[0]);
      // never stuck: give up restoring page/reveal if the selection doesn't arrive
      window.setTimeout(() => {
        if (adopting.current === a) adopting.current = null;
      }, 2000);
    } else if (t.kind === 'song') {
      openSong(t.songId);
      setSongsPanelStanza(t.stanza);
      setSongsOpen(true);
      // «live» now would render before the override lands (the store updates first) and
      // live-follow would push this window's verses over the song for a moment
      songTakeover.current = t.override;
      setPreviewOverride(t.override);
    }
  };
  useEffect(() => {
    if (!songTakeover.current || previewOverride !== songTakeover.current) return;
    songTakeover.current = null;
    setLive(true);
  }, [previewOverride, setLive]);
  useEffect(() => {
    setPublishing(isLeader);
    if (!isLeader) {
      return subscribeSlide((s) => {
        mirrored.current = true; // another window leads and publishes
        setLiveSlide(s);
      });
    }
    lastPushed.current = null;
    pushLive(liveSlideRef.current);
    publishNext(nextSlideRef.current);
    if (mirrored.current) adoptScreen(liveSlideRef.current);
    mirrored.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeader]);
  /** Audience phones currently on /follow (pushed by the hub). */
  const [viewers, setViewers] = useState(0);
  /**
   * Is this the control window the server listens to (0.6.8)? With control windows in two
   * browsers, remotes, their «На екрані» and the phones follow one — the first; the other
   * shows a note and can take over («Слухати тут»).
   */
  const [hubActive, setHubActive] = useState(true);
  /**
   * The browser a control window «Відкрити в … зараз» opened in took charge (the hub names it):
   * this window says control went there.
   */
  const [hubMovedTo, setHubMovedTo] = useState<string | null>(null);
  // Opened by «Відкрити в … зараз» (lib/handover.ts) while another control window of this browser
  // leads here: take over from it — for a token the server still holds — so this window's hello
  // carries the token and the hub puts it in charge.
  useEffect(() => {
    let current = true;
    void claimForHandover(takeHandover(), api.checkHandover, () => (current ? claim() : undefined));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /**
   * The socket to the hub has been down for more than a blink (0.6.25). Then nobody can say
   * which window is in charge: the Mac test saw «Слухати тут» stay up (and do nothing) after
   * the server had stopped — the last word from the hub, never taken back.
   */
  const [hubLost, setHubLost] = useState(false);
  // The window in charge has its own title (1.1.0): the start file finds it by that
  // (shortcut.ts CONTROL_TITLES) instead of opening a second one, and among the browser's
  // windows it is the one to pick. One on standby, or not in charge of the hub, keeps the plain
  // name, so the start file never brings that one forward.
  const inCharge = isLeader && hubActive;
  useEffect(() => {
    document.title = inCharge ? `VerseOrchestrator — ${tr('керування')}` : 'VerseOrchestrator';
    return () => {
      document.title = 'VerseOrchestrator';
    };
  }, [inCharge, lang]);
  /** The hub said the app is being switched off on purpose («Вимкнути повністю», 0.7.1). */
  const [appOff, setAppOff] = useState(false);
  useEffect(() => {
    // No server (static deployment / stopped): there is no hub to talk to. Standby: the
    // leading window holds the control socket, so remote commands reach one window only.
    if (serverAvailable !== true || !isLeader) return;
    let lostTimer: number | undefined;
    const c = connectLive({
      // the first hello of a window «Відкрити в … зараз» opened carries its one-time token
      hello: controlHello,
      // a restart of the server (≈1–2 s) shouldn't flash a warning; a real outage should
      onStatus: (open) => {
        window.clearTimeout(lostTimer);
        if (open) {
          setHubLost(false);
          setAppOff(false); // started again
        } else lostTimer = window.setTimeout(() => setHubLost(true), HUB_LOST_MS);
      },
      onMessage: (f) => {
        // In charge of the hub (at connect, after «Слухати тут», or when the other browser's
        // control window closed): give remotes the current screen straight away and, after a
        // server restart (the relay starts paused), restore what phones should see.
        if (f.type === 'hub') {
          setHubActive(f.active === true);
          if (f.active === true) {
            c.send(screenFrame());
            c.send({ type: 'playlist', playlist: sharedPlaylistRef.current });
            if (followAlongRef.current)
              c.send({ type: 'publish', slide: forAudience(liveSlideRef.current) });
          }
        }
        // «Відкрити в … зараз»: control moved to another browser (`hub`), or this window was
        // opened there and now knows which browser it is in (`handover`)
        applyHandoverFrame(f, setHubMovedTo);
        if (f.type === 'viewers' && typeof f.count === 'number') setViewers(f.count);
        if (f.type === 'shutdown') setAppOff(true);
        // `songs` is a permission, never a command (the server doesn't forward it)
        if (
          f.type === 'command' &&
          typeof f.cmd === 'string' &&
          f.cmd in REMOTE_LABEL &&
          f.cmd !== 'songs' &&
          f.cmd !== 'playlist'
        ) {
          const cmd = f.cmd as Exclude<RemoteCommand, 'songs' | 'playlist'>;
          const from = String(f.from ?? '');
          const id = typeof f.id === 'string' ? f.id : `ws-${Date.now()}`;
          const passage = asPassage(f.passage);
          const song = passage ? undefined : asSong(f.song);
          const item = typeof f.item === 'string' ? f.item : undefined;
          void commands
            .dispatch(id, cmd, { kind: 'remote', name: from }, { passage, song, item })
            .then((outcome) => {
              // The remote is acked with what really happened (server/src/live.ts onCommand).
              if (typeof f.id === 'string') c.send({ type: 'result', id: f.id, ...outcome });
              // the speaker walking their own preview isn't news for the operator
              if (outcome.duplicate || (cmd === 'pick' && outcome.ok)) return;
              notifications.show({
                message:
                  tr('Пульт «{remote}»: {command}', {
                    remote: from,
                    command: tr(REMOTE_LABEL[cmd]),
                  }) + (outcome.ok ? '' : ` — ${outcome.reason ?? tr('не виконано')}`),
                color: outcome.ok ? 'brand' : 'orange',
                autoClose: 1200,
              });
            });
        } else if (f.type === 'remotes') {
          void queryClient.invalidateQueries({ queryKey: ['remotes'] });
        } else if (f.type === 'ui-state') {
          // a backup restored or undone (1.5.0), maybe from another window: its state, now
          void takeServerUiState().then((ok) => {
            if (!ok) return;
            // the restore replaced the song bundles and the pictures as well
            for (const key of ['backup-state', ...SONG_KEYS, 'images'])
              void queryClient.invalidateQueries({ queryKey: [key] });
            notifications.show({
              message: tr('Налаштування й програми замінено з резервної копії.'),
              color: 'gray',
              autoClose: 4000,
            });
          });
        } else if (f.type === 'suggested') {
          // the hub's answer to «Запропонувати пульту» (0.6.4)
          const name =
            queryClient.getQueryData<Pairing[]>(['remotes'])?.find((p) => p.id === f.to)?.name ??
            tr('пульт');
          notifications.show(
            typeof f.delivered === 'number' && f.delivered > 0
              ? {
                  message: tr('Запропоновано: «{remote}»', { remote: name }),
                  color: 'green',
                  autoClose: 1500,
                }
              : {
                  message: `«${name}»: ${f.reason ? tr(String(f.reason)) : tr('не доставлено')}`,
                  color: 'orange',
                },
          );
        }
      },
    });
    controlConn.current = c;
    return () => {
      controlConn.current = null;
      window.clearTimeout(lostTimer);
      setHubActive(true);
      setHubMovedTo(null);
      setHubLost(false);
      c.stop();
    };
  }, [queryClient, serverAvailable, isLeader]);
  // The shared running order (0.6.9): a summary of «Послідовність показу» for remotes
  // allowed «Послідовність» (the hub relays it to them only) — ids, labels, the current
  // item, and what a phone needs to walk a passage / song with its own cursor.
  const sharedPlaylist: SharedPlaylist = useMemo(
    () => ({
      items: playlistItems.map((it) =>
        it.kind === 'passage'
          ? {
              id: it.id,
              kind: 'passage',
              label: it.label,
              translationIds: it.translationIds,
              bookNumber: it.bookNumber,
              chapter: it.chapter,
              verses: it.verses,
            }
          : it.kind === 'song'
            ? { id: it.id, kind: 'song', label: it.label, songId: it.songId }
            : { id: it.id, kind: 'text', label: it.label },
      ),
      currentId: playlistCurrentId,
    }),
    [playlistItems, playlistCurrentId],
  );
  const sharedPlaylistRef = useRef(sharedPlaylist);
  sharedPlaylistRef.current = sharedPlaylist;
  useEffect(() => {
    if (hubActive) controlConn.current?.send({ type: 'playlist', playlist: sharedPlaylist });
  }, [sharedPlaylist, hubActive]);

  // «Запропонувати пульту» (0.6.4): the operator's preview — a verse page or a song stanza —
  // to a speaker's remote allowed to choose that kind and online now.
  const remotesQuery = useQuery({
    queryKey: ['remotes'],
    queryFn: api.remotes,
    enabled: serverAvailable === true && isLeader,
  });
  const suggestTarget: RemoteTarget | null = (() => {
    const src = previewOverride ? previewOverride.source : verseSource(pageVerses);
    if (src?.kind === 'song')
      return { kind: 'song', song: { songId: src.songId, stanza: src.stanza } };
    if (src?.kind === 'verses') {
      const { translationIds, bookNumber, chapter } = src;
      return {
        kind: 'verses',
        passage: {
          translationIds,
          bookNumber,
          chapter,
          verses: previewOverride ? src.verses : pageVerses,
        },
      };
    }
    return null; // free text: nothing a remote could choose
  })();
  const suggestRemotes = suggestTarget
    ? (remotesQuery.data ?? []).filter(
        (p) => p.online && p.allowed.includes(suggestTarget.kind === 'verses' ? 'pick' : 'songs'),
      )
    : [];
  const suggestion =
    suggestTarget && suggestRemotes.length > 0
      ? {
          remotes: suggestRemotes.map((p) => ({ id: p.id, name: p.name })),
          onSend: (id: string) => {
            const sent = controlConn.current?.send({
              type: 'suggest',
              to: id,
              ...targetArgs(suggestTarget),
              reference: previewSlide.reference,
              text: previewSlide.lines[0]?.text ?? '',
            });
            if (!sent)
              notifications.show({ message: tr('Немає зв’язку з сервером'), color: 'red' });
          },
        }
      : null;

  // Keep remotes' «На екрані» / «Передпоказ» / «Далі» in step (independent of follow-along).
  const previewKey = previewSummary.current;
  useEffect(() => {
    controlConn.current?.send(screenFrame());
  }, [liveSlide, nextSlide, previewKey]);

  const openPresenter = async () => {
    // «Кілька вікон показу» (Вікна виводу): another window instead of the open one.
    const win = await openPresenterWindow(useSettings.getState().outputs.multiple);
    notifications.show(
      win
        ? { message: tr('Вікно показу відкрито'), color: 'brand', autoClose: 1500 }
        : { message: tr('Не вдалося відкрити вікно (перевірте блокувальник)'), color: 'red' },
    );
  };

  const openStage = async () => {
    const win = await openStageWindow();
    notifications.show(
      win
        ? { message: tr('Вікно сцени відкрито'), color: 'brand', autoClose: 1500 }
        : { message: tr('Не вдалося відкрити вікно (перевірте блокувальник)'), color: 'red' },
    );
  };

  // In-app "what's on screen now" monitor — reflects the actually-published slide.
  const textHidden = liveSlide.blank && !liveSlide.forceBlack;
  const blackOn = !!liveSlide.forceBlack;
  const coverOn = !!liveSlide.cover && !liveSlide.forceBlack;
  const liveActive =
    liveSlide.visible &&
    !liveSlide.blank &&
    !liveSlide.forceBlack &&
    (liveSlide.lines.length > 0 || !!liveSlide.qr || !!liveSlide.cover);
  const liveLabel = liveSlide.forceBlack
    ? tr('Чорний екран')
    : liveSlide.blank
      ? tr('Текст сховано')
      : liveActive
        ? liveSlide.reference || tr('На екрані')
        : tr('Порожньо');

  // Operator actions exposed in the command palette (Ctrl+K). Fresh closures each
  // render so they never go stale; the palette only reads this while open.
  const paletteCommands: CommandItem[] = [
    {
      id: 'project',
      label: tr('На екран'),
      hint: tr('Показати вибір'),
      keywords: 'project show project',
      icon: <IconDeviceTv size={16} />,
      run: sendAndNotify,
    },
    {
      id: 'blank',
      label: tr('Сховати / показати текст'),
      keywords: 'blank zatemnyty',
      icon: <IconSquareOff size={16} />,
      run: hideToggle,
    },
    {
      id: 'black',
      label: tr('Чорний екран'),
      keywords: 'black chornyi',
      icon: <IconSquareFilled size={16} />,
      run: blackToggle,
    },
    { id: 'clear', label: tr('Прибрати з екрана'), keywords: 'clear ochystyty', run: clearScreen },
    {
      id: 'restore',
      label: tr('Повернути прибраний слайд'),
      keywords: 'undo restore povernuty',
      run: () => restoreRef.current(),
    },
    {
      id: 'addPassage',
      label: tr('Додати уривок у показ'),
      keywords: 'playlist add',
      icon: <IconPlaylistAdd size={16} />,
      run: addCurrentPassage,
    },
    {
      id: 'playlist',
      label: tr('Послідовність показу'),
      keywords: 'playlist sequence',
      icon: <IconList size={16} />,
      run: () => setPlaylistOpen(true),
    },
    {
      id: 'songs',
      label: tr('Пісні'),
      keywords: 'songs pisni',
      icon: <IconMusic size={16} />,
      run: () => setSongsOpen(true),
    },
    {
      id: 'text',
      label: tr('Власний текст'),
      keywords: 'text tekst',
      icon: <IconLetterT size={16} />,
      run: () => setTextOpen(true),
    },
    {
      id: 'search',
      label: tr('Пошук в усіх модулях'),
      keywords: 'search poshuk',
      icon: <IconSearch size={16} />,
      run: () => openSearch('all'),
    },
    {
      id: 'presenter',
      label: tr('Відкрити вікно показу'),
      keywords: 'presenter output',
      icon: <IconScreenShare size={16} />,
      run: () => void openPresenter(),
    },
    {
      id: 'stage',
      label: tr('Сцена'),
      keywords: 'stage monitor',
      icon: <IconLayoutDashboard size={16} />,
      run: () => void openStage(),
    },
    {
      id: 'follow',
      label: tr('Глядачі (QR)'),
      keywords: 'follow qr phones',
      icon: <IconQrcode size={16} />,
      run: () => setFollowOpen(true),
    },
    {
      id: 'remote',
      label: tr('Пульт доповідача'),
      keywords: 'remote speaker phone pult',
      icon: <IconDeviceMobile size={16} />,
      run: () => setRemoteOpen(true),
    },
    {
      id: 'outputs',
      label: tr('Вікна виводу'),
      keywords: 'windows screens monitors outputs vikna ekrany',
      icon: <IconAppWindow size={16} />,
      run: () => setOutputsOpen(true),
    },
    {
      id: 'settings',
      label: tr('Налаштування вигляду'),
      keywords: 'settings nalashtuvannia',
      icon: <IconAdjustments size={16} />,
      run: () => setSettingsOpen(true),
    },
    {
      id: 'liveFollow',
      label: liveFollow ? tr('Наживо: вимкнути') : tr('Наживо: увімкнути'),
      keywords: 'live follow',
      run: () => setLiveFollow(!liveFollow),
    },
    {
      id: 'feedback',
      label: tr('Надіслати відгук'),
      keywords: 'feedback bug issue idea report vidguk pomylka',
      icon: <IconMessageReport size={16} />,
      run: () => openFeedback(lang),
    },
    {
      id: 'docs',
      label: tr('Довідка'),
      keywords: 'help docs guide manual dovidka posibnyk',
      icon: <IconHelp size={16} />,
      run: () => window.open(docsUrl(lang), '_blank', 'noopener'),
    },
    {
      id: 'theme',
      label: colorScheme === 'dark' ? tr('Світла тема') : tr('Темна тема'),
      keywords: 'theme tema dark light',
      icon: <IconSun size={16} />,
      run: () => toggleColorScheme(),
    },
  ];

  const exportBookmarks = () => {
    const blob = new Blob([JSON.stringify(bookmarks, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'verseorchestrator-saved.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBookmarksFile = async (file: File | null) => {
    if (!file) return;
    try {
      const items = JSON.parse(await file.text());
      if (Array.isArray(items)) {
        importBookmarks(items);
        notifications.show({
          message: tr('Імпортовано записів: {n}', { n: items.length }),
          color: 'green',
        });
      }
    } catch {
      notifications.show({
        message: tr(
          'Не вдалося прочитати файл закладок. Потрібен .json, збережений кнопкою «Експорт»',
        ),
        color: 'red',
      });
    }
  };

  const currentRef: RefItem | null =
    reference && primaryId != null && bookNumber != null && chapter != null && selectedVerses.length
      ? {
          ref: reference,
          refShort: referenceShort,
          translationId: primaryId,
          bookNumber,
          chapter,
          verse: selectedVerses[0],
        }
      : null;
  const isSaved = currentRef ? bookmarks.some((b) => refKey(b) === refKey(currentRef)) : false;

  const renderStudyPanels = (compact: boolean) => (
    <StudyPanels
      mode={asideMode}
      setMode={setAsideMode}
      primaryHasStrong={primaryHasStrong}
      reference={reference}
      liveSlide={liveSlide}
      liveActive={liveActive}
      liveLabel={liveLabel}
      isSaved={isSaved}
      currentRef={currentRef}
      onToggleBookmark={toggleBookmark}
      slideLines={slideLines}
      scriptureFont={appearance.scriptureFont}
      previewSlide={previewSlide}
      selectedPrimaryVerses={selectedPrimaryVerses}
      books={books}
      onProjectStrong={projectStrong}
      onShowConcordance={(strong) =>
        // Tag the lexicon (H/G) from where the word was clicked — the bare number is
        // ambiguous (H2424 ≠ G2424); a Greek OT (LXX) module uses G throughout.
        setConcordanceStrong(
          /^[GH]/i.test(strong)
            ? strong.toUpperCase()
            : `${strongLangFor(bookNumber ?? 0, translations.find((t) => t.id === primaryId)?.language)}${strong}`,
        )
      }
      onPickRef={jumpTo}
      suggest={suggestion}
      remote={
        remoteView && {
          name: remoteView.name,
          slide: remoteView.slide,
          onShow: () => {
            if (!leaderRef.current) return standbyNotice();
            pushLive(remoteView.slide);
            setLive(false);
          },
          onAdopt: remoteView.target
            ? () => {
                const t = remoteView.target!;
                if (t.kind === 'song') {
                  // the song panel at that stanza, its slide in the operator's preview
                  openSong(t.song.songId);
                  setSongsPanelStanza(t.song.stanza);
                  setSongsOpen(true);
                  setPreviewOverride(remoteView.slide);
                  return;
                }
                const p = t.passage;
                setTranslations(p.translationIds);
                selectBook(p.bookNumber);
                selectChapter(p.chapter);
                setSelectedVerses(p.verses);
                setScrollTarget(p.verses[0]);
              }
            : undefined,
          onClose: () => setRemoteView(null),
        }
      }
      pinned={pinnedPreview}
      onTogglePin={togglePin}
      compact={compact}
    />
  );

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
  const settingsTool: ToolProps = {
    label: tr('Налаштування вигляду'),
    hint:
      update?.available && update.latest
        ? tr('Доступна версія {version} — див. «Застосунок» → «Оновлення»', {
            version: update.latest.version,
          })
        : tr('Шрифт, кольори, шаблон слайда, пресети, клавіші'),
    icon: <IconAdjustments size={18} stroke={1.5} />,
    dot: !!update?.available,
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
    sources: { label: tr('Джерела'), tools: [songsTool, textTool, playlistTool] },
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

  return (
    <>
      <AppShell
        header={{ height: 56 }}
        navbar={{ width: layout.navWidth, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
        aside={
          panelPlacement === 'aside'
            ? { width: layout.asideWidth, breakpoint: 'md', collapsed: { mobile: !asideOpened } }
            : undefined
        }
        padding={0}
      >
        <AppShell.Header>
          {/* Zones, left → right: navigate · sources | windows · live output · app. A narrow
              window folds them step by step, zones into «Ще» (lib/headerFold.ts); the row
              scrolls sideways only if even the last step doesn't fit (a huge root font), with
              «Ще» moved before the go-live zone and a thin scrollbar. */}
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
                  <ToolIcon {...playlistTool} />
                </ToolZone>
              )}
            </Group>

            <Group gap={rowGap} wrap="nowrap" style={{ flexShrink: 0 }}>
              {!folded('windows') && (
                <ToolZone label={tr('Вікна')} divider={false}>
                  <ToolButton
                    {...presenterTool}
                    text={tr('Вікно показу')}
                    compact={fold.iconsOnly}
                  />
                  <ToolIcon {...stageTool} />
                  <ToolIcon {...outputsTool} />
                  <ToolIcon {...viewersTool} />
                  <ToolIcon {...remoteTool} />
                </ToolZone>
              )}
              {moreFirst && moreButton}
              <ToolZone label={tr('Вихід на екран')} divider={!folded('windows') || moreFirst}>
                <Tooltip
                  label={tr(
                    'Увімкнено: екран одразу повторює вибір. Вимкнено: лише прев’ю, показ кнопкою «На екран»',
                  )}
                  multiline
                  w={240}
                  withArrow
                  openDelay={250}
                >
                  <Switch
                    size="sm"
                    color="live"
                    checked={liveFollow}
                    onChange={(e) => setLiveFollow(e.currentTarget.checked)}
                    label={fold.noGoTo ? undefined : tr('Наживо')}
                    aria-label={tr('Наживо')}
                    styles={{ label: { paddingInlineStart: 6, whiteSpace: 'nowrap' } }}
                  />
                </Tooltip>
                <ToolButton
                  label={tr('На екран')}
                  hint={tr('Показати поточний вибір')}
                  text={tr('На екран')}
                  compact={fold.projectIconOnly}
                  variant="filled"
                  color="live"
                  combo={keymap.project}
                  icon={<IconDeviceTv size={18} stroke={1.5} />}
                  disabled={slideLines.length === 0 || !isLeader}
                  onClick={sendAndNotify}
                />
                <ToolButton
                  label={textHidden ? tr('Показати текст') : tr('Сховати текст')}
                  hint={
                    textHidden
                      ? tr('Повернути той самий слайд')
                      : tr('Текст згасає, фон лишається; ще раз — той самий слайд назад')
                  }
                  text={textHidden ? tr('Показати текст') : tr('Сховати текст')}
                  compact={fold.iconsOnly}
                  variant={textHidden ? 'filled' : 'default'}
                  active={textHidden}
                  color={textHidden ? 'cue' : undefined}
                  combo={keymap.blank}
                  icon={<IconSquareOff size={18} stroke={1.5} />}
                  disabled={!isLeader}
                  onClick={hideToggle}
                />
                <ToolIcon
                  label={blackOn ? tr('Зняти чорний екран') : tr('Чорний екран')}
                  hint={
                    blackOn
                      ? tr('Повернути те, що було')
                      : tr('Одразу все чорне, навіть фон; ще раз — усе назад')
                  }
                  combo={keymap.black}
                  icon={<IconSquareFilled size={16} />}
                  color="dark"
                  active={blackOn}
                  disabled={!isLeader}
                  onClick={blackToggle}
                />
                <ToolIcon
                  label={coverOn ? tr('Прибрати заставку') : tr('Заставка')}
                  hint={
                    coverOn
                      ? tr('Повернути те, що було')
                      : tr('Логотип і текст між елементами; ще раз — те, що було')
                  }
                  combo={keymap.cover}
                  icon={<IconPhoto size={18} stroke={1.5} />}
                  active={coverOn}
                  disabled={!isLeader}
                  onClick={coverToggle}
                />
              </ToolZone>
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
        </AppShell.Header>

        <AppShell.Navbar>
          <Box visibleFrom="sm">
            <ResizeHandle
              axis="x"
              edge="right"
              label={tr('Ширина бічної панелі')}
              {...panelResize('navbar')}
            />
          </Box>
          {/* a short window (Safari's 800×600 in the Mac test) squeezed the books to nothing and
              their hint ran over the history tabs: the books keep a few rows, the rest scrolls */}
          <Box
            style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}
          >
            <TranslationPicker
              translations={translations}
              selectedIds={selectedIds}
              onChange={setTranslations}
              onMakePrimary={makePrimary}
            />
            <Divider />
            <Box p="xs" pb={4}>
              <TextInput
                size="xs"
                placeholder={tr('Фільтр книг…')}
                value={bookFilter}
                onChange={(e) => setBookFilter(e.currentTarget.value)}
                leftSection={<IconSearch size={14} />}
              />
            </Box>
            <Box style={{ flex: 1, minHeight: BOOKS_MIN_HEIGHT, padding: '0 8px' }}>
              <VirtualList
                items={filteredBooks}
                getKey={(b) => b.bookNumber}
                isSelected={(b) => b.bookNumber === bookNumber}
                onSelect={(b) => pickBook(b.bookNumber)}
                renderRow={(b) => b.longName || b.shortName}
                estimateSize={30}
                empty={
                  libraryGap
                    ? tr('Перекладів ще немає')
                    : primaryId == null
                      ? tr('Позначте переклад угорі, щоб побачити його книги')
                      : bookFilter.trim()
                        ? tr('Немає книг, що збігаються з «{filter}»', {
                            filter: bookFilter.trim(),
                          })
                        : tr('У цьому перекладі немає книг')
                }
              />
            </Box>
            <Divider />
            <Tabs
              value={sidebarTab}
              onChange={setSidebarTab}
              variant="default"
              style={{ position: 'relative' }}
            >
              <ResizeHandle axis="y" edge="top" label={tr('Висота історії')} {...recentResize} />
              <Tabs.List grow>
                <Tabs.Tab value="history" leftSection={<IconHistory size={14} />}>
                  {tr('Історія')}
                </Tabs.Tab>
                <Tabs.Tab value="saved" leftSection={<IconBookmark size={14} />}>
                  {tr('Збережене')}
                </Tabs.Tab>
              </Tabs.List>
              <Group justify="flex-end" gap={4} px="xs" py={4} h={30} wrap="nowrap">
                {sidebarTab === 'history' && history.length > 0 && (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    leftSection={<IconTrash size={12} />}
                    onClick={clearHistory}
                  >
                    {tr('Очистити')}
                  </Button>
                )}
                {sidebarTab === 'saved' && (
                  <>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      leftSection={<IconDownload size={12} />}
                      disabled={bookmarks.length === 0}
                      onClick={exportBookmarks}
                    >
                      {tr('Експорт')}
                    </Button>
                    <FileButton accept="application/json" onChange={importBookmarksFile}>
                      {(props) => (
                        <Button
                          {...props}
                          size="compact-xs"
                          variant="subtle"
                          color="gray"
                          leftSection={<IconUpload size={12} />}
                        >
                          {tr('Імпорт')}
                        </Button>
                      )}
                    </FileButton>
                  </>
                )}
              </Group>
              <Box ref={recentBoxRef} style={{ height: layout.recentHeight }}>
                <ScrollArea h="100%" scrollbars="y" className="vo-scroll-rows">
                  <Tabs.Panel value="history">
                    <RefList
                      items={history}
                      onPick={jumpTo}
                      onRemove={removeHistory}
                      empty={tr('Тут з’являтимуться місця, які ви відкривали')}
                    />
                  </Tabs.Panel>
                  <Tabs.Panel value="saved">
                    <RefList
                      items={bookmarks}
                      onPick={jumpTo}
                      onRemove={(it) => toggleBookmark(it)}
                      empty={tr('Збережіть вірш кнопкою-закладкою над прев’ю')}
                    />
                  </Tabs.Panel>
                </ScrollArea>
              </Box>
            </Tabs>
          </Box>
        </AppShell.Navbar>

        <AppShell.Main>
          {/* the header's height is in rem (AppShell): with a 20 px root font a fixed 56 px left
              the column's last 14 px below the window */}
          <Box
            style={{
              display: 'flex',
              flexDirection: 'column',
              height: 'calc(100vh - var(--app-shell-header-height, 3.5rem))',
            }}
          >
            {!isLeader && (
              <Group
                gap="sm"
                wrap="nowrap"
                px="md"
                py={6}
                role="status"
                style={{
                  background: 'var(--mantine-color-default-hover)',
                  borderBottom: '1px solid var(--mantine-color-default-border)',
                }}
              >
                <Text size="sm" style={{ flex: 1 }}>
                  {tr(
                    'Показом керує інше вікно керування. Тут можна готувати наступне — на екран іде лише звідти.',
                  )}
                </Text>
                <Button size="xs" variant="subtle" color="gray" onClick={closeThisWindow}>
                  {tr('Закрити це вікно')}
                </Button>
                <Button size="xs" variant="light" onClick={takeOver}>
                  {tr('Взяти керування')}
                </Button>
              </Group>
            )}
            {isLeader && appOff && (
              <Group
                gap="sm"
                wrap="nowrap"
                px="md"
                py={6}
                role="status"
                style={{
                  background: 'var(--mantine-color-default-hover)',
                  borderBottom: '1px solid var(--mantine-color-default-border)',
                }}
              >
                <IconPower
                  size={16}
                  color="var(--mantine-color-dimmed)"
                  aria-hidden
                  style={{ flex: 'none' }}
                />
                <Text size="sm" style={{ flex: 1 }}>
                  {tr(
                    'Застосунок вимкнено: пульти й телефони глядачів відключено, вікна виводу закрито.',
                  )}{' '}
                  {tr(START_AGAIN)}
                </Text>
              </Group>
            )}
            {isLeader && hubLost && !appOff && (
              <Group
                gap="sm"
                wrap="nowrap"
                px="md"
                py={6}
                role="status"
                style={{
                  background: 'var(--mantine-color-default-hover)',
                  borderBottom: '1px solid var(--mantine-color-default-border)',
                }}
              >
                <IconPlugConnectedX
                  size={16}
                  color="var(--mantine-color-orange-filled)"
                  aria-hidden
                  style={{ flex: 'none' }}
                />
                <Text size="sm" style={{ flex: 1 }}>
                  {tr(
                    'Немає зв’язку із сервером застосунку: пульти й телефони глядачів зараз не чують цього вікна, вікна виводу працюють далі. Перевірте, чи запущено застосунок, — зв’язок відновиться сам.',
                  )}
                </Text>
              </Group>
            )}
            {isLeader && !hubLost && !appOff && !hubActive && (
              <Group
                gap="sm"
                wrap="nowrap"
                px="md"
                py={6}
                role="status"
                style={{
                  background: 'var(--mantine-color-default-hover)',
                  borderBottom: '1px solid var(--mantine-color-default-border)',
                }}
              >
                <Text size="sm" style={{ flex: 1 }}>
                  {hubMovedTo
                    ? tr(
                        'Вікно керування перейшло в {browser}. Звідси показ іде лише на вікна виводу цього браузера.',
                        { browser: hubMovedTo },
                      )
                    : tr(
                        'Пульти й телефони глядачів слухають вікно керування в іншому браузері. Звідси показ іде лише на вікна виводу цього браузера.',
                      )}
                </Text>
                <Button size="xs" variant="subtle" color="gray" onClick={closeThisWindow}>
                  {tr('Закрити це вікно')}
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => controlConn.current?.send({ type: 'take-control' })}
                >
                  {tr('Слухати тут')}
                </Button>
              </Group>
            )}
            <SearchPanel
              open={searchOpen}
              onClose={() => setSearchOpen(false)}
              primaryId={primaryId}
              scope={searchScope}
              onScopeChange={setSearchScope}
              onPick={(r) => jumpTo(r, { focus: true })}
            />
            <SongsPanel
              open={songsOpen}
              onClose={() => setSongsOpen(false)}
              onProjectStanza={projectText}
              songId={songsPanelSongId}
              onSongIdChange={openSong}
              activeStanza={songsPanelStanza}
              onActiveStanzaChange={setSongsPanelStanza}
              onAddToPlaylist={addSongToPlaylist}
              keysPaused={paletteOpen || moreShown}
              onSongEnd={songEnd}
            />
            <TextPanel
              open={textOpen}
              onClose={() => setTextOpen(false)}
              onProject={projectAnnouncement}
              onAddToPlaylist={addTextToPlaylist}
            />
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
                {selectedVerses.length > 0 && <Badge variant="light">{reference}</Badge>}
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
            <Divider />
            <div
              style={{
                display: 'flex',
                flex: 1,
                minHeight: panelPlacement === 'bottom' ? BOTTOM_VERSES_MIN : 0,
              }}
            >
              <ScrollArea style={{ flex: 1 }} px="md" py="xs" viewportRef={verseViewport}>
                <Stack gap={2}>
                  {primaryVerses.map((v) => (
                    <div
                      key={v.verse}
                      className="vo-verse-item vo-verse-row"
                      role="button"
                      tabIndex={0}
                      data-verse={v.verse}
                      data-selected={selectedVerses.includes(v.verse) ? 'true' : undefined}
                      onClick={(e) =>
                        e.ctrlKey || e.metaKey || e.shiftKey
                          ? toggleVerse(v.verse)
                          : setSelectedVerses([v.verse])
                      }
                      onKeyDown={(e) => {
                        const mod = e.ctrlKey || e.metaKey || e.shiftKey;
                        if (e.key === ' ') {
                          e.preventDefault();
                          if (mod) toggleVerse(v.verse);
                          else setSelectedVerses([v.verse]);
                        } else if (e.key === 'Enter') {
                          // bound to «На екран» (⌘↩ on a Mac): that hotkey projects
                          if (matchesCombo(e.nativeEvent, keymap.project)) return;
                          e.preventDefault();
                          // Enter projects to the screen immediately (no need to enable
                          // live-follow or press F5); modifier+Enter extends the selection.
                          if (mod) toggleVerse(v.verse);
                          else projectVerseOnEnter(v.verse);
                        }
                      }}
                    >
                      <span className="vo-verse-num">{v.verse}</span>
                      <span>
                        {appearance.redLetter
                          ? parseRedLetter(v.textRaw ?? v.text ?? '').map((s, j, arr) => (
                              <Text
                                span
                                key={j}
                                style={{
                                  // a light tint toward the accent: the whole Gospel is often red-letter, so a
                                  // strong tint turns the reading list into a wall of red (the slide keeps 50%)
                                  color: s.jesus
                                    ? `color-mix(in srgb, currentColor 70%, ${appearance.jesusColor})`
                                    : undefined,
                                }}
                              >
                                {s.text}
                                {j < arr.length - 1 ? ' ' : ''}
                              </Text>
                            ))
                          : v.text}
                      </span>
                    </div>
                  ))}
                  {primaryVerses.length === 0 &&
                    (libraryGap ? (
                      <NoLibrary gap={libraryGap} onOpenSettings={openAppSettings} />
                    ) : versesLoading ? null : (
                      <Text c="dimmed" size="sm" p="sm">
                        {currentBook == null
                          ? tr('Оберіть книгу ліворуч — відкриється її перший розділ.')
                          : chapter == null
                            ? tr('Оберіть розділ угорі.')
                            : tr('У цьому розділі немає віршів у головному перекладі.')}
                      </Text>
                    ))}
                </Stack>
              </ScrollArea>
              {concordanceStrong && (
                <ConcordancePanel
                  strong={concordanceStrong}
                  primaryId={primaryId}
                  onPick={jumpTo}
                  onClose={() => setConcordanceStrong(null)}
                />
              )}
            </div>
            {panelPlacement === 'bottom' && (
              <Box
                ref={bottomBoxRef}
                style={{
                  position: 'relative',
                  // it shrinks, not the chapters or an inline tool above (shrink is weighted)
                  flex: `0 1000 ${layout.bottomHeight}px`,
                  minHeight: BOTTOM_PANEL_MIN,
                  borderTop: '1px solid var(--mantine-color-default-border)',
                }}
              >
                <ResizeHandle
                  axis="y"
                  edge="top"
                  label={tr('Висота панелі показу')}
                  {...bottomResize}
                />
                {renderStudyPanels(true)}
              </Box>
            )}
          </Box>
        </AppShell.Main>

        {panelPlacement === 'aside' && (
          <AppShell.Aside>
            <Box visibleFrom="md">
              <ResizeHandle
                axis="x"
                edge="left"
                label={tr('Ширина правої панелі')}
                {...panelResize('aside')}
              />
            </Box>
            {renderStudyPanels(false)}
          </AppShell.Aside>
        )}
      </AppShell>

      <FloatingPanel
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={tr('Налаштування вигляду')}
        storageKey={SETTINGS_PANEL_KEY}
        width={400}
        icon={<IconAdjustments size={16} />}
      >
        <SettingsPanel onDetach={() => setSettingsOpen(false)} />
      </FloatingPanel>

      <FloatingPanel
        opened={playlistOpen}
        onClose={() => setPlaylistOpen(false)}
        title={tr('Послідовність показу')}
        storageKey="vo:playlistPanelPos"
        width={340}
        icon={<IconList size={16} />}
      >
        <PlaylistPanel
          items={playlistItems}
          currentId={playlistCurrentId}
          saved={playlistSaved}
          onActivate={activateItem}
          onRemove={playlistRemove}
          onMove={playlistMove}
          onReorder={playlistReorder}
          onClear={playlistClear}
          cleared={playlistCleared}
          onUndoClear={playlistUndoClear}
          onNext={() => stepPlaylist(1)}
          onPrev={() => stepPlaylist(-1)}
          onSave={(n) => {
            const exists = playlistSaved.some((p) => p.name === n.trim());
            playlistSaveProgram(n);
            notifications.show({
              message: exists
                ? tr('Програму оновлено: {name}', { name: n })
                : tr('Програму збережено: {name}', { name: n }),
              color: 'green',
              autoClose: 1500,
            });
          }}
          onLoad={(n) => {
            playlistLoadProgram(n);
            notifications.show({
              message: tr('Відкрито програму: {name}', { name: n }),
              color: 'brand',
              autoClose: 1500,
            });
          }}
          onDelete={playlistDeleteProgram}
          deletedProgram={
            playlistDeleted
              ? { name: playlistDeleted.program.name, index: playlistDeleted.index }
              : null
          }
          onUndoDelete={playlistUndoDelete}
          replacedBy={playlistReplacedBy}
          onUndoLoad={playlistUndoLoad}
        />
      </FloatingPanel>

      <FloatingPanel
        opened={followOpen}
        onClose={() => setFollowOpen(false)}
        title={tr('Глядачі')}
        storageKey="vo:followPanelPos"
        width={320}
        icon={<IconQrcode size={16} />}
      >
        <FollowPanel
          viewers={viewers}
          qrOnScreen={!!liveSlide.qr}
          onToggleQr={() => (liveSlide.qr ? hideQr() : showQr())}
        />
      </FloatingPanel>

      <FloatingPanel
        opened={outputsOpen}
        onClose={() => setOutputsOpen(false)}
        title={tr('Вікна виводу')}
        storageKey="vo:outputsPanelPos"
        width={380}
        icon={<IconAppWindow size={16} />}
      >
        <OutputsPanel />
      </FloatingPanel>

      <FloatingPanel
        opened={remoteOpen}
        onClose={() => setRemoteOpen(false)}
        title={tr('Пульт доповідача')}
        storageKey="vo:remotePanelPos"
        width={340}
        icon={<IconDeviceMobile size={16} />}
      >
        <RemotePanel />
      </FloatingPanel>

      {quick !== null && <QuickRefPill value={quick} place={currentBook?.longName ?? ''} />}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
        books={books}
        onJumpBook={pickBook}
        onOpenSong={(id) => {
          openSong(id);
          setSongsOpen(true);
        }}
        onGoReference={(q) => void goTo(q)}
      />
    </>
  );
}

/** Marker inserted between non-contiguous selected verses so a skip reads as a skip. */
const GAP = '…';
/** The book list keeps about four rows however short the window (0.6.26). */
const BOOKS_MIN_HEIGHT = 120;

/**
 * The display panel below the centre in a short column (1.4.6): it gives way down to 10rem
 * (two fifths of a very short column) — its monitors shrink with it — while the verse list
 * keeps 7.5rem, three or four verses.
 */
const BOTTOM_PANEL_MIN = 'min(10rem, 40%)';
const BOTTOM_VERSES_MIN = '7.5rem';
/**
 * How long the socket to the hub may be down before the operator is told (0.6.25), counted
 * from the drop (0.6.29: a failed retry no longer restarts it — with retries every 2 s it
 * never ran out). The retries 0.5 / 1.5 / 3.5 s after the drop catch a restart of up to
 * ~3.5 s before this.
 */
const HUB_LOST_MS = 4000;

/** Displayed text for the selected verses (chapter order), with gaps between non-contiguous ones. */
function joinVerses(verses: Verse[], selected: number[], showNum: boolean): string {
  const parts: string[] = [];
  let prev: number | null = null;
  for (const v of verses) {
    if (!selected.includes(v.verse)) continue;
    const t = (v.text ?? '').trim();
    if (!t) continue;
    if (prev != null && v.verse > prev + 1) parts.push(GAP);
    parts.push(`${showNum ? `${v.verse} ` : ''}${t}`);
    prev = v.verse;
  }
  return parts.join(' ');
}

/** Build red-letter (words of Jesus) segments for a translation's selected verses. */
/**
 * A song line with its second part (1.3.0): `marked` is the line's text with the second part
 * marked (shared/src/songs/pptx.ts); it keeps `color` — the file's — or, without one, goes
 * dimmer. The pieces are the text itself, so they join without spaces.
 */
function withSecond(line: SlideLine, marked: string, color?: string): SlideLine {
  if (unmark(marked) !== line.text) return line;
  const segments: TextSpan[] = secondParts(marked).map((p) =>
    p.second ? { text: p.text, ...(color ? { color } : { soft: true }) } : { text: p.text },
  );
  return { ...line, segments, exact: true };
}

function redLetterSegments(verses: Verse[], selected: number[], showNum: boolean): TextSpan[] {
  const out: TextSpan[] = [];
  let prev: number | null = null;
  for (const v of verses) {
    if (!selected.includes(v.verse)) continue;
    if (prev != null && v.verse > prev + 1) out.push({ text: GAP });
    if (showNum) out.push({ text: String(v.verse) });
    for (const s of parseRedLetter(v.textRaw ?? v.text ?? '')) {
      out.push(s.jesus ? { text: s.text, jesus: true } : { text: s.text });
    }
    prev = v.verse;
  }
  return out;
}

/** Build segments with the word(s) carrying `strong` emphasised (the projected Strong word). */
function strongHighlightSegments(
  verses: Verse[],
  selected: number[],
  showNum: boolean,
  strong: string,
): TextSpan[] {
  const out: TextSpan[] = [];
  let prev: number | null = null;
  for (const v of verses) {
    if (!selected.includes(v.verse)) continue;
    if (prev != null && v.verse > prev + 1) out.push({ text: GAP });
    if (showNum) out.push({ text: String(v.verse) });
    const tokens = parseStrongTokens(v.textRaw ?? '');
    if (tokens.length === 0) {
      const t = (v.text ?? '').trim();
      if (t) out.push({ text: t });
    } else {
      for (const tk of tokens) {
        out.push(tk.strong === strong ? { text: tk.text, hot: true } : { text: tk.text });
      }
    }
    prev = v.verse;
  }
  return out;
}
