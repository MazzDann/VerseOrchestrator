import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppShell,
  Group,
  Button,
  Text,
  Box,
  Divider,
  useMantineColorScheme,
  useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAdjustments, IconQrcode, IconDeviceMobile, IconAppWindow } from '@tabler/icons-react';

import {
  api,
  ApiFailure,
  type Verse,
  type SongStyle,
  type RemoteCommand,
  type Pairing,
} from '../api';
import { useStore } from '../store';
import { useSettings, refKey, type RefItem } from '../settingsStore';
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
  type SlideCountdown,
  type SlidePicture,
} from '../presenterBus';
import { warmAudio } from '../lib/countdownSound';
import {
  afterZeroOf,
  isPaused,
  savedLength,
  shiftCountdown,
  showsTime,
  hasLook,
  stageTimerLook,
  timerLook,
  togglePause,
  untilFor,
  type AfterZero,
  freshTimer,
  type CountdownPlace,
  type StageTimer,
} from '../lib/countdown';
import { NO_LIBRARY, mainText, markedText, strongLangFor, unmark } from '@vo/shared';
import { findSong } from '../lib/songLink';
import { SearchPanel, type SearchScope } from '../components/SearchPanel';
import { StudyPanels, type AsideMode } from '../components/StudyPanels';
import { SongsPanel } from '../components/SongsPanel';
import { TextPanel } from '../components/TextPanel';
import { FloatingPanel } from '../components/FloatingPanel';
import { SettingsPanel } from '../components/SettingsPanel';
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
import { useServer } from '../serverStore';
import { tr, useLang } from '../i18n';
import { useEffectiveSource } from '../dataSourceStore';
import { type LibraryGap } from '../components/NoLibrary';
import { useCodeState, useUpdateState } from '../lib/updates';
import {
  countdownOver,
  coverOver,
  forAudience,
  pictureSlide,
  qrOver,
  sameContent,
  sameSlide,
  showsSomething,
  summarize,
  toggleBlack,
  toggleHidden,
  uncover,
} from '../lib/slide';
import { CommandPalette } from '../components/CommandPalette';
import { takeServerUiState } from '../lib/uiState';
import { SONG_KEYS } from '../lib/songKeys';
import { useHeaderFold } from '../lib/headerFold';
import { ResizeHandle } from '../components/ResizeHandle';
import { SETTINGS_PANEL_KEY } from '../lib/panelBox';
import { formatCombo } from '../hotkeys';
import { isFormField } from '../lib/keyScroll';
import { applyHandoverFrame, claimForHandover, controlHello, takeHandover } from '../lib/handover';
import {
  usePlaylist,
  type SeqImage,
  type SeqItem,
  type SeqPassage,
  type SeqSong,
} from '../playlistStore';
import { ImagesPanel } from '../components/ImagesPanel';
import { type ImageInfo } from '../api';
import { joinVerses, redLetterSegments, strongHighlightSegments } from './control/slideText';
import { withSecond } from './control/songSlides';
import { standbyNotice } from './control/standby';
import { usePanelResize } from './control/usePanelResize';
import { useAppSettingsOpener } from './control/useAppSettingsOpener';
import { useVerseListEffects } from './control/useVerseListEffects';
import { useControlHotkeys } from './control/useControlHotkeys';
import { useTimerSignals } from './control/useTimerSignals';
import { usePaletteCommands } from './control/usePaletteCommands';
import { ControlHeader } from './control/ControlHeader';
import { ControlNavbar } from './control/ControlNavbar';
import { HubBanners } from './control/HubBanners';
import { ChapterBar } from './control/ChapterBar';
import { VerseList } from './control/VerseList';
import { PlaylistFloating } from './control/PlaylistFloating';

const EMPTY_ARRAY: never[] = [];
/** One «Екран очищено» notice at a time (0.13.2): a new clear replaces the last one. */
const CLEARED_NOTICE = 'screen-cleared';
type Jumpable = { translationId: number; bookNumber: number; chapter: number; verse: number };

type InlinePanel = 'search' | 'songs' | 'text' | 'images';

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
  const { recentBoxRef, panelResize, recentResize, bottomBoxRef, bottomResize } = usePanelResize({
    layout,
    setLayout,
  });
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
  const imagesOpen = inlinePanel === 'images';
  const setSearchOpen = useMemo(() => inlineSetter('search'), [inlineSetter]);
  const setSongsOpen = useMemo(() => inlineSetter('songs'), [inlineSetter]);
  const setTextOpen = useMemo(() => inlineSetter('text'), [inlineSetter]);
  const setImagesOpen = useMemo(() => inlineSetter('images'), [inlineSetter]);
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
  const openAppSettings = useAppSettingsOpener({ setSettingsOpen, serverAvailable });
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
  // …or a copy of the repository whose code changed under it: «Перезапустити» (upd2, 1.6.0)
  const code = useCodeState();
  /**
   * One control window in charge (0.4.4, lib/leader.ts): only the leader publishes to the
   * outputs, takes commands and holds the server's control socket; a second control window
   * is on standby — it mirrors what is on screen and can «Взяти керування».
   */
  const { state: leaderState, takeOver, claim } = useControlLeader();
  const isLeader = leaderState === 'leader';
  const leaderRef = useRef(isLeader);
  leaderRef.current = isLeader;
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
  // «Таймер доповідача» (1.8.4): the leader sets it and every slide it pushes carries it
  // (`pushLive`); a window that waits follows the leader's, so taking over keeps it running
  const stageTimerRef = useRef<StageTimer | null>(freshTimer(liveSlide.stageTimer));
  if (!isLeader) stageTimerRef.current = freshTimer(liveSlide.stageTimer);
  // «Відлік» in a corner (1.8.7): the same way — over whatever is on screen, so it rides along
  const cornerRef = useRef<SlideCountdown | null>(freshTimer(liveSlide.cornerCountdown));
  if (!isLeader) cornerRef.current = freshTimer(liveSlide.cornerCountdown);
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
  /** «Відлік» open (1.5.0): its fields and buttons own the keys, as the palette's do */
  const [countdownOpen, setCountdownOpen] = useState(false);
  /** …and «Таймер доповідача» (1.8.4) */
  const [stageTimerOpen, setStageTimerOpen] = useState(false);
  const toolOpen = countdownOpen || stageTimerOpen;
  const quickRef = useRef<string | null>(null);
  quickRef.current = quick;
  const quickJumpRef = useRef(quickJump);
  quickJumpRef.current = quickJump;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const box = quickRef.current;
      const r = quickKeydown(box, e, {
        canStart: bookNumber != null,
        blocked: isFormField(e.target) || paletteOpen || moreShown || toolOpen,
        project: useSettings.getState().keymap.project,
      });
      if (r.box !== box) setQuick(r.box);
      if (r.go) void quickJumpRef.current(r.go.text, { show: r.go.show });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [bookNumber, paletteOpen, moreShown, toolOpen]);
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
  const pushLive = (pushed: Slide, opts?: { audience?: boolean }) => {
    if (!leaderRef.current) return; // standby: never overrides the leader's screen
    // the speaker's timer rides on every slide (1.8.4) — the one now, not one a slide kept
    // from before (a cleared or covered slide coming back)
    const slide: Slide = {
      ...pushed,
      // one countdown for the viewers (1.8.7): a corner one takes the time off «Заставка» —
      // whatever brings a cover countdown back (review of 1.8.7)
      countdown: cornerRef.current && pushed.countdown ? null : pushed.countdown,
      stageTimer: stageTimerRef.current ?? undefined,
      cornerCountdown: cornerRef.current ?? undefined,
    };
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

  // «Зображення» (1.5.0): a picture on screen, as a stanza is — the preview shows it too, and
  // «Наживо» leaves it until the verses are navigated
  const projectPicture = (picture: SlidePicture) => {
    const slide = pictureSlide(picture, slideStyle);
    pushLive(slide);
    setPreviewOverride(slide);
    setLive(true);
    notifications.show({
      message: tr('На екрані: {ref}', { ref: picture.name }),
      color: 'live',
      autoClose: 1500,
    });
  };
  // «Вписати / Заповнити» (1.7.1, the user's call): the picture on screen takes the switch at once
  // — quietly, it is the same picture. Only its fit changes: a black screen stays black (the
  // picture under it waits with the new fit); the preview follows when it shows that picture too
  const refitPicture = (fit: SlidePicture['fit']) => {
    const now = liveSlideRef.current;
    if (!now.picture || now.picture.fit === fit) return;
    pushLive({ ...now, picture: { ...now.picture, fit } });
    if (previewOverride?.picture?.src === now.picture.src)
      setPreviewOverride({ ...previewOverride, picture: { ...previewOverride.picture, fit } });
  };
  // a picture deleted in «Зображення» (1.7.2) leaves the screen with it — nothing shown points at a
  // file that is gone (a black screen stays black; «Заставка» over it gives back nothing)
  const pictureDeleted = (src: string) => {
    const now = liveSlideRef.current;
    if (now.picture?.src === src) {
      pushLive(
        now.forceBlack
          ? { lines: [], reference: '', blank: false, visible: true, forceBlack: true }
          : { lines: [], reference: '', blank: false, visible: false },
      );
      if (!now.forceBlack) setLive(false);
      clearedRef.current = null;
    } else if (now.returnTo?.picture?.src === src) pushLive({ ...now, returnTo: undefined });
    // what Esc took away can't come back as a picture that is gone
    if (clearedRef.current?.picture?.src === src) clearedRef.current = null;
    if (previewOverride?.picture?.src === src) setPreviewOverride(null);
  };
  const addImageToPlaylist = (img: ImageInfo, fit: SlidePicture['fit']) => {
    playlistAdd({
      kind: 'image',
      label: img.name,
      imageId: img.id,
      src: img.src,
      small: img.small,
      fit,
    });
    notifications.show({
      message: tr('Зображення додано у показ'),
      color: 'green',
      autoClose: 1200,
    });
  };
  const pictureOf = (it: SeqImage): SlidePicture => ({
    src: it.src,
    small: it.small,
    name: it.label,
    fit: it.fit,
  });

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
    else if (it.kind === 'image') projectPicture(pictureOf(it));
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

  // the verse list's scroll and the history (E13–E15) — after the steps' effects above
  const { verseViewport } = useVerseListEffects({
    scrollTarget,
    setScrollTarget,
    primaryVerses,
    focusJump,
    bookNumber,
    chapter,
    reference,
    referenceShort,
    primaryId,
    selectedVerses,
    pushHistory,
  });

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
    takeCoverOff();
  };
  /** «Заставка» (with «Відлік» too) off: exactly the slide it covered, or an empty screen. */
  const takeCoverOff = () => {
    const back = uncover(liveSlideRef.current);
    if (!back) {
      pushLive({ lines: [], reference: '', blank: false, visible: false, style: slideStyle });
      setLive(false);
      setPreviewOverride(null);
      return;
    }
    pushLive(back);
    afterToggle(back);
  };
  // «Відлік» (1.5.0, components/CountdownTool): «Заставка» with the time left under it, over
  // whatever is on screen; L or «Прибрати відлік» gives that back, as from «Заставка».
  const countdownStart = (
    countdown: SlideCountdown,
    place: CountdownPlace = appearance.countdownPlace,
  ) => {
    if (!leaderRef.current) return standbyNotice();
    // a click or a key starts it: the moment a browser lets the page sound later (1.8.5)
    if (appearance.countdownBeeps) warmAudio();
    const cover = { text: appearance.coverText, image: appearance.coverImage };
    // the time's look from the settings (1.8.2 colours, 1.8.3 the rest)
    const timed = { ...countdown, ...timerLook(appearance) };
    // in a corner (1.8.7): over what is on screen, which stays as it is
    if (place === 'corner') {
      cornerRef.current = timed;
      pushCorner();
      return;
    }
    // one countdown for the viewers at a time
    cornerRef.current = null;
    const slide = countdownOver(liveSlideRef.current, cover, timed, slideStyle, tr('Відлік'));
    pushLive(slide);
    setPreviewOverride(slide);
    setLive(true);
  };
  /** The viewers' countdown now (1.8.7): in a corner, or on «Заставка». */
  const viewersCountdown = (): { corner: boolean; c: SlideCountdown } | null => {
    if (cornerRef.current) return { corner: true, c: cornerRef.current };
    const s = liveSlideRef.current;
    return s.cover && s.countdown ? { corner: false, c: s.countdown } : null;
  };
  /**
   * The same countdown with a new end: what it covers and the cover stay. In a corner (1.8.7)
   * it goes out with the slide on screen now — the one pushed last.
   */
  const countdownChange = (countdown: SlideCountdown | null, corner = !!cornerRef.current) => {
    if (!leaderRef.current) return standbyNotice();
    if (corner) {
      cornerRef.current = countdown;
      pushCorner();
      return;
    }
    const now = liveSlideRef.current;
    if (!now.cover || !now.countdown) return;
    const slide: Slide = countdown
      ? { ...now, countdown }
      : { ...now, countdown: null, reference: tr('Заставка') };
    pushLive(slide);
    // the preview follows only while it shows the cover: a passage the operator got ready
    // meanwhile stays there for «На екран» and the stage display (review of #45)
    setPreviewOverride((p) => (p?.cover ? slide : p));
  };
  /** A new countdown of what «Відлік» last chose: the palette's line and the key (1.8.1). */
  const countdownStartSaved = () =>
    countdownStart({
      until: untilFor(savedLength(appearance.countdownMinutes), Date.now()),
      caption: appearance.countdownCaption.trim() || tr('Починаємо за'),
      afterZero: appearance.countdownAfterZero,
    });
  const countdownShift = (minutes: number) => {
    const v = viewersCountdown();
    if (v) countdownChange(shiftCountdown(v.c, minutes, Date.now()), v.corner);
  };
  // going on from zero or past it (1.8.1): that zero was said already — the end notice keeps quiet
  const quietEnd = useRef<number | null>(null);
  /** «Пауза» / «Продовжити» (1.8.1): the time on screen stands still, then goes on from there. */
  const countdownPause = () => {
    const v = viewersCountdown();
    if (!v) return;
    if (appearance.countdownBeeps) warmAudio();
    const now = Date.now();
    const next = togglePause(v.c, now);
    if (!isPaused(next) && next.until <= now) quietEnd.current = next.until;
    countdownChange(next, v.corner);
    return next;
  };
  /**
   * The key «Відлік: пауза / далі» (1.8.1, T): the countdown on screen stops or goes on; with
   * none showing its time, a new one starts. Under «Чорний екран» it pauses the countdown there
   * and the screen stays black — never a new one over it (review of 1.8.1).
   */
  const countdownKey = () => {
    if (!leaderRef.current) return standbyNotice();
    const v = viewersCountdown();
    if (v && showsTime(v.c, Date.now())) {
      const next = countdownPause();
      notifications.show({
        message: next && isPaused(next) ? tr('Відлік: пауза') : tr('Відлік іде далі'),
        color: 'gray',
        autoClose: 1500,
      });
      return;
    }
    countdownStartSaved();
  };
  // The time's look changed (1.8.2 colours, 1.8.3 size, font, format, words; Налаштування
  // вигляду → Відлік, maybe from the settings window): the countdown on screen takes it at once —
  // its time and its end stay
  const look = timerLook(appearance);
  // the speaker's timer has its own (1.8.6, Налаштування вигляду → Таймер доповідача)
  const stageLook = stageTimerLook(appearance);
  const lookKey = JSON.stringify([look, stageLook]);
  useEffect(() => {
    if (!leaderRef.current) return;
    const t = stageTimerRef.current;
    const timerChanged = !!t && !hasLook(t, stageLook);
    if (t && timerChanged) stageTimerRef.current = { ...t, ...stageLook };
    const k = cornerRef.current;
    const cornerChanged = !!k && !hasLook(k, look);
    if (k && cornerChanged) cornerRef.current = { ...k, ...look };
    const s = liveSlideRef.current;
    const c = s.countdown;
    // one push carries them all: the countdown's change takes the timers along
    if (s.cover && c && !hasLook(c, look)) countdownChange({ ...c, ...look }, false);
    else if (cornerChanged) pushCorner();
    else if (timerChanged) pushTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey, isLeader]);
  /**
   * «Таймер доповідача» (1.8.4): a new state of the speaker's timer goes out with the slide on
   * screen now — the one pushed last (the render's copy may be a push behind; review of 1.8.4) —
   * and never to the phones: they have nothing new, and over the QR slide they would go blank.
   */
  const pushTimer = () =>
    pushLive({ ...(lastPushed.current ?? liveSlideRef.current) }, { audience: false });
  /**
   * The corner countdown's new state (1.8.7) goes out with the slide on screen now — to the phones
   * too, but not over the QR slide: they would go blank (the 1.8.4 lesson; review of 1.8.7). They
   * get it with the next slide.
   */
  const pushCorner = () => {
    const s = lastPushed.current ?? liveSlideRef.current;
    pushLive({ ...s }, { audience: !s.qr });
  };
  const stageTimerSet = (timer: StageTimer | null) => {
    if (!leaderRef.current) return standbyNotice();
    stageTimerRef.current = timer;
    pushTimer();
  };
  const stageTimerStart = (ms: number, afterZero: AfterZero) =>
    stageTimerSet({ until: untilFor(ms, Date.now()), afterZero, ...stageTimerLook(appearance) });
  const stageTimerPause = () => {
    const t = stageTimerRef.current;
    if (t) stageTimerSet(togglePause(t, Date.now()));
  };
  const stageTimerShift = (minutes: number) => {
    const t = stageTimerRef.current;
    if (t) stageTimerSet(shiftCountdown(t, minutes, Date.now()));
  };
  const stageTimerAfterZero = (afterZero: AfterZero) => {
    const t = stageTimerRef.current;
    if (t && afterZeroOf(t) !== afterZero) stageTimerSet({ ...t, afterZero });
  };
  /** «Після нуля» (1.8.0) for the countdown on screen: its time, the end and the cover stay. */
  const countdownAfterZero = (afterZero: AfterZero) => {
    const v = viewersCountdown();
    if (v && afterZeroOf(v.c) !== afterZero) countdownChange({ ...v.c, afterZero }, v.corner);
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
  // The 14 page hotkeys (their order kept) and Alt+arrows (E18) — here, below the last handler
  // they take (restoreRef): after the timers' effects, the corner QR's and showJump's (E19–E21).
  useControlHotkeys({
    keymap,
    advanceAndSay,
    hideToggle,
    clearScreen,
    openSearch,
    setPaletteOpen,
    sendAndNotify,
    blackToggle,
    coverToggle,
    countdownKey,
    restoreRef,
    pageCount,
    pageIndex,
    primaryVerses,
    selectedVerses,
    revealCount,
    revealUnits,
    appearance,
    previewOverride,
    chapters,
    live,
    liveFollow,
    screenHeld,
    selectedIds,
    currentBook,
    versePreview,
    slideLines,
    reference,
    slideStyle,
  });

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
    if (it.kind === 'image') return Promise.resolve(pictureSlide(pictureOf(it), slideStyle));
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
            : it.kind === 'image'
              ? { id: it.id, kind: 'image', label: it.label }
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

  // In-app "what's on screen now" monitor — reflects the actually-published slide.
  const textHidden = liveSlide.blank && !liveSlide.forceBlack;
  const blackOn = !!liveSlide.forceBlack;
  const coverOn = !!liveSlide.cover && !liveSlide.forceBlack;
  // the viewers' countdown: its sound, the wake, the end notice (E31–E33)
  const { viewersTimer, cornerOn } = useTimerSignals({
    liveSlide,
    coverOn,
    appearance,
    isLeader,
    quietEnd,
  });
  const liveActive =
    liveSlide.visible &&
    !liveSlide.blank &&
    !liveSlide.forceBlack &&
    (liveSlide.lines.length > 0 || !!liveSlide.qr || !!liveSlide.cover || !!liveSlide.picture);
  const liveLabel = liveSlide.forceBlack
    ? tr('Чорний екран')
    : liveSlide.blank
      ? tr('Текст сховано')
      : liveActive
        ? liveSlide.reference || tr('На екрані')
        : tr('Порожньо');

  const paletteCommands = usePaletteCommands({
    sendAndNotify,
    hideToggle,
    blackToggle,
    appearance,
    countdownStartSaved,
    clearScreen,
    restoreRef,
    addCurrentPassage,
    setPlaylistOpen,
    setSongsOpen,
    setTextOpen,
    openSearch,
    setFollowOpen,
    setRemoteOpen,
    setOutputsOpen,
    setSettingsOpen,
    liveFollow,
    setLiveFollow,
    colorScheme,
    toggleColorScheme,
  });

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
          <ControlHeader
            header={header}
            navOpened={navOpened}
            toggleNav={toggleNav}
            navBreakpoint={navBreakpoint}
            keymap={keymap}
            openSearch={openSearch}
            goToValue={goToValue}
            setGoToValue={setGoToValue}
            goTo={goTo}
            songsOpen={songsOpen}
            setSongsOpen={setSongsOpen}
            textOpen={textOpen}
            setTextOpen={setTextOpen}
            imagesOpen={imagesOpen}
            setImagesOpen={setImagesOpen}
            playlistOpen={playlistOpen}
            setPlaylistOpen={setPlaylistOpen}
            outputWindows={outputWindows}
            outputsOpen={outputsOpen}
            setOutputsOpen={setOutputsOpen}
            followAlong={followAlong}
            viewers={viewers}
            serverAvailable={serverAvailable}
            followOpen={followOpen}
            setFollowOpen={setFollowOpen}
            remoteOpen={remoteOpen}
            setRemoteOpen={setRemoteOpen}
            update={update}
            code={code}
            settingsOpen={settingsOpen}
            setSettingsOpen={setSettingsOpen}
            colorScheme={colorScheme}
            toggleColorScheme={toggleColorScheme}
            asideOpened={asideOpened}
            toggleAside={toggleAside}
            asideToggle={asideToggle}
            moreShown={moreShown}
            setMoreOpen={setMoreOpen}
            panelPlacement={panelPlacement}
            live={{
              liveFollow,
              setLiveFollow,
              slideLines,
              isLeader,
              sendAndNotify,
              textHidden,
              hideToggle,
              blackOn,
              blackToggle,
              coverOn,
              coverToggle,
              viewersTimer,
              cornerOn,
              countdownStart,
              countdownShift,
              leaderRef,
              countdownPause,
              countdownAfterZero,
              countdownChange,
              takeCoverOff,
              setCountdownOpen,
              liveSlide,
              stageTimerStart,
              stageTimerPause,
              stageTimerShift,
              stageTimerAfterZero,
              stageTimerSet,
              setStageTimerOpen,
            }}
          />
        </AppShell.Header>

        <AppShell.Navbar>
          <ControlNavbar
            panelResize={panelResize}
            translations={translations}
            selectedIds={selectedIds}
            setTranslations={setTranslations}
            makePrimary={makePrimary}
            bookFilter={bookFilter}
            setBookFilter={setBookFilter}
            filteredBooks={filteredBooks}
            bookNumber={bookNumber}
            pickBook={pickBook}
            libraryGap={libraryGap}
            primaryId={primaryId}
            sidebarTab={sidebarTab}
            setSidebarTab={setSidebarTab}
            recentResize={recentResize}
            history={history}
            clearHistory={clearHistory}
            bookmarks={bookmarks}
            exportBookmarks={exportBookmarks}
            importBookmarksFile={importBookmarksFile}
            recentBoxRef={recentBoxRef}
            layout={layout}
            jumpTo={jumpTo}
            removeHistory={removeHistory}
            toggleBookmark={toggleBookmark}
          />
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
            <HubBanners
              isLeader={isLeader}
              appOff={appOff}
              hubLost={hubLost}
              hubActive={hubActive}
              hubMovedTo={hubMovedTo}
              takeOver={takeOver}
              controlConn={controlConn}
            />
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
              keysPaused={paletteOpen || moreShown || toolOpen}
              onSongEnd={songEnd}
            />
            <TextPanel
              open={textOpen}
              onClose={() => setTextOpen(false)}
              onProject={projectAnnouncement}
              onAddToPlaylist={addTextToPlaylist}
            />
            <ImagesPanel
              open={imagesOpen}
              onClose={() => setImagesOpen(false)}
              onProject={projectPicture}
              onRefit={refitPicture}
              onAddToPlaylist={addImageToPlaylist}
              onDeleted={pictureDeleted}
              onScreen={
                liveSlide.visible && !liveSlide.blank ? (liveSlide.picture?.src ?? null) : null
              }
            />
            <ChapterBar
              currentBook={currentBook}
              chapter={chapter}
              liveActive={liveActive}
              liveSlide={liveSlide}
              liveLabel={liveLabel}
              pageCount={pageCount}
              safePageIndex={safePageIndex}
              advance={advance}
              selectedVerses={selectedVerses}
              addCurrentPassage={addCurrentPassage}
              reference={reference}
              chapters={chapters}
              selectChapter={selectChapter}
            />
            <Divider />
            <VerseList
              panelPlacement={panelPlacement}
              verseViewport={verseViewport}
              primaryVerses={primaryVerses}
              selectedVerses={selectedVerses}
              toggleVerse={toggleVerse}
              setSelectedVerses={setSelectedVerses}
              keymap={keymap}
              projectVerseOnEnter={projectVerseOnEnter}
              appearance={appearance}
              libraryGap={libraryGap}
              openAppSettings={openAppSettings}
              versesLoading={versesLoading}
              currentBook={currentBook}
              chapter={chapter}
              concordanceStrong={concordanceStrong}
              primaryId={primaryId}
              jumpTo={jumpTo}
              setConcordanceStrong={setConcordanceStrong}
            />
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

      <PlaylistFloating
        playlistOpen={playlistOpen}
        setPlaylistOpen={setPlaylistOpen}
        playlistItems={playlistItems}
        playlistCurrentId={playlistCurrentId}
        playlistSaved={playlistSaved}
        activateItem={activateItem}
        playlistRemove={playlistRemove}
        playlistMove={playlistMove}
        playlistReorder={playlistReorder}
        playlistClear={playlistClear}
        playlistCleared={playlistCleared}
        playlistUndoClear={playlistUndoClear}
        stepPlaylist={stepPlaylist}
        playlistSaveProgram={playlistSaveProgram}
        playlistLoadProgram={playlistLoadProgram}
        playlistDeleteProgram={playlistDeleteProgram}
        playlistDeleted={playlistDeleted}
        playlistUndoDelete={playlistUndoDelete}
        playlistReplacedBy={playlistReplacedBy}
        playlistUndoLoad={playlistUndoLoad}
      />

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

/**
 * The display panel below the centre in a short column (1.4.6): it gives way down to 10rem
 * (two fifths of a very short column) — its monitors shrink with it — while the verse list
 * keeps 7.5rem, three or four verses.
 */
const BOTTOM_PANEL_MIN = 'min(10rem, 40%)';
/**
 * How long the socket to the hub may be down before the operator is told (0.6.25), counted
 * from the drop (0.6.29: a failed retry no longer restarts it — with retries every 2 s it
 * never ran out). The retries 0.5 / 1.5 / 3.5 s after the drop catch a restart of up to
 * ~3.5 s before this.
 */
const HUB_LOST_MS = 4000;
