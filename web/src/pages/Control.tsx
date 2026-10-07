import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppShell,
  Box,
  Divider,
  useMantineColorScheme,
  useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { IconAdjustments, IconQrcode, IconDeviceMobile, IconAppWindow } from '@tabler/icons-react';

import { useStore } from '../store';
import {
  useSettings,
  refKey,
  videoEndOf,
  videoPhonesOf,
  videoVolumeOf,
  type RefItem,
} from '../settingsStore';
import { type Slide } from '../presenterBus';
import { strongLangFor } from '@vo/shared';
import { SearchPanel } from '../components/SearchPanel';
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
import { QuickRefPill } from '../components/QuickRefPill';
import { type RemoteTarget } from '../lib/commands';
import { useServer } from '../serverStore';
import { tr, useLang } from '../i18n';
import { useEffectiveSource } from '../dataSourceStore';
import { useCodeState, useUpdateState } from '../lib/updates';
import { CommandPalette } from '../components/CommandPalette';
import { useHeaderFold } from '../lib/headerFold';
import { ResizeHandle } from '../components/ResizeHandle';
import { SETTINGS_PANEL_KEY } from '../lib/panelBox';
import { usePlaylist } from '../playlistStore';
import { ImagesPanel } from '../components/ImagesPanel';
import { standbyNotice } from './control/standby';
import { usePanelResize } from './control/usePanelResize';
import { useAppSettingsOpener } from './control/useAppSettingsOpener';
import { useVerseListEffects } from './control/useVerseListEffects';
import { useControlHotkeys } from './control/useControlHotkeys';
import { useTimerSignals } from './control/useTimerSignals';
import { usePaletteCommands } from './control/usePaletteCommands';
import { useLivePipeline, useFollowAlongRelay } from './control/useLivePipeline';
import { useScreenSwitches } from './control/useScreenSwitches';
import { useQrCornerFollow } from './control/useQrCornerFollow';
import { useSongProjection } from './control/useSongProjection';
import { usePictures } from './control/usePictures';
import { useAlbum } from './control/useAlbum';
import { useVideo } from './control/useVideo';
import { type MediaTab } from '../components/ImagesPanel';
import { usePlaylistActions } from './control/usePlaylistActions';
import { useTimers } from './control/useTimers';
import { useVerseDeck } from './control/useVerseDeck';
import { useJumps } from './control/useJumps';
import { useShowSteps } from './control/useShowSteps';
import { useShowJumpWhenReady } from './control/useShowJumpWhenReady';
import { usePublishNext, useAdoptRestore, useLeaderTakeover } from './control/useTakeover';
import { useShowCommands } from './control/useShowCommands';
import { useHub } from './control/useHub';
import { ControlHeader } from './control/ControlHeader';
import { ControlNavbar } from './control/ControlNavbar';
import { HubBanners } from './control/HubBanners';
import { ChapterBar } from './control/ChapterBar';
import { VerseList } from './control/VerseList';
import { PlaylistFloating } from './control/PlaylistFloating';

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
  const searchPrefs = useSettings((s) => s.search);
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
  // «Зображення» shows pictures, albums (1.8.12) or videos (1.8.12-beta.3)
  const [mediaTab, setMediaTab] = useState<MediaTab>('images');
  const openAlbumsTab = useCallback(() => setMediaTab('albums'), []);
  const openVideosTab = useCallback(() => setMediaTab('videos'), []);
  const [asideMode, setAsideMode] = useState<AsideMode>('preview');
  const [sidebarTab, setSidebarTab] = useState<string | null>('history');
  const [navOpened, { toggle: toggleNav }] = useDisclosure(false);
  const [asideOpened, { toggle: toggleAside }] = useDisclosure(false);
  const [pinnedPreview, { toggle: togglePin }] = useDisclosure(false);
  // When navigating via search/history/concordance, scroll this verse into view.
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);
  // Active Strong number for the concordance panel shown beside the verse list.
  const [concordanceStrong, setConcordanceStrong] = useState<string | null>(null);
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
  // Last song/text/Strong projection shown in the preview (so the preview reflects
  // songs and free text, not only the verse selection). Cleared on navigation.
  const [previewOverride, setPreviewOverride] = useState<Slide | null>(null);
  // the slide on screen and the one push pipeline (vo-sync) — before the verse code; the
  // standby sync of the timer refs runs in it during render, right after the slide
  const {
    liveSlide,
    setLiveSlide,
    stageTimerRef,
    cornerRef,
    liveSlideRef,
    followAlongRef,
    controlConn,
    publishAudience,
    pauseAudience,
    lastPushed,
    clearedRef,
    pushLive,
  } = useLivePipeline({ isLeader, leaderRef, followAlong });
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

  // The verses (useVerseDeck): the page and reveal step, the queries and what they give — the
  // slide, the preview, «Далі». Its queries' subscriptions and E6 now run before the jumps'
  // E3–E5 (the plan's relocation: E3–E5 register listeners and a timer, none reads a query).
  const effectiveSource = useEffectiveSource();
  const {
    pageIndex,
    setPageIndex,
    revealCount,
    setRevealCount,
    translations,
    libraryGap,
    books,
    chapters,
    verseQueries,
    primaryVerses,
    versesLoading,
    currentBook,
    reference,
    referenceShort,
    primaryHasStrong,
    selectedPrimaryVerses,
    pageCount,
    safePageIndex,
    pageVerses,
    pageReference,
    buildLines,
    slideLines,
    slideStyle,
    revealUnits,
    revealForSlide,
    verseSource,
    versePreview,
    previewSlide,
    nextSlide,
    nextSlideRef,
  } = useVerseDeck({
    selectedIds,
    primaryId,
    bookNumber,
    chapter,
    selectedVerses,
    appearance,
    effectiveSource,
    followAlong,
    followQrCorner,
    followUrl,
    followQrStyle,
    slideTemplate,
    previewOverride,
  });

  /** «Відлік» open (1.5.0): its fields and buttons own the keys, as the palette's do */
  const [countdownOpen, setCountdownOpen] = useState(false);
  /** …and «Таймер доповідача» (1.8.4) */
  const [stageTimerOpen, setStageTimerOpen] = useState(false);
  const toolOpen = countdownOpen || stageTimerOpen;
  // Finding the place (useJumps, vo-search): jumps, the go-to bar, the typed numbers (E3–E5)
  // and the search panel's scope — after toolOpen, which E3 reads
  const {
    searchScope,
    setSearchScope,
    goToValue,
    setGoToValue,
    clearSearch,
    searchFieldRef,
    searchKeysRef,
    focusJump,
    jumpTo,
    goTo,
    showJump,
    quick,
    openSearch,
  } = useJumps({
    selectedIds,
    setTranslations,
    selectBook,
    selectChapter,
    setSelectedVerses,
    setScrollTarget,
    primaryId,
    bookNumber,
    chapter,
    currentBook,
    chapters,
    queryClient,
    setPageIndex,
    setRevealCount,
    paletteOpen,
    moreShown,
    toolOpen,
    setSearchOpen,
  });

  const filteredBooks = useMemo(() => {
    const q = bookFilter.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) => b.longName.toLowerCase().includes(q) || b.shortName.toLowerCase().includes(q),
    );
  }, [books, bookFilter]);

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

  // Hide the Strong tab (and leave it) when the primary translation has no Strong numbers.
  useEffect(() => {
    if (asideMode === 'strong' && !primaryHasStrong) setAsideMode('preview');
  }, [asideMode, primaryHasStrong]);

  // E8: what one step would show, to «Сцена» (the leader only)
  usePublishNext({ isLeader, nextSlide });

  /** A takeover still restoring page / reveal (0.5.10): key = the selection it waits for. */
  const adopting = useRef<{
    key: string;
    page: number;
    reveal: number;
    override: Slide | null;
  } | null>(null);

  // E10: the phones' relay follows the follow-along switch
  useFollowAlongRelay({ followAlong, publishAudience, liveSlide, pauseAudience });

  // No effects in these four: the screen switches (QR, «Заставка», hide, black, clear and
  // back), songs, pictures and the running order's actions — in this order, each taking what
  // the one before returns (songEnd: afterToggle; activateItem: projectText, projectPicture)
  const {
    showQr,
    hideQr,
    coverToggle,
    takeCoverOff,
    afterToggle,
    hideToggle,
    blackToggle,
    clearScreen,
    restoreRef,
  } = useScreenSwitches({
    leaderRef,
    liveSlideRef,
    pushLive,
    clearedRef,
    slideStyle,
    followUrl,
    appearance,
    versePreview,
    setLive,
    setPreviewOverride,
  });
  const { projectText, projectAnnouncement, songEnd } = useSongProjection({
    slideStyle,
    slideTemplate,
    pushLive,
    setPreviewOverride,
    setLive,
    pushRecentText,
    leaderRef,
    liveSlideRef,
    afterToggle,
  });
  const { projectPicture, refitPicture, pictureDeleted, addImageToPlaylist, pictureOf } =
    usePictures({
      slideStyle,
      pushLive,
      setPreviewOverride,
      setLive,
      liveSlideRef,
      previewOverride,
      clearedRef,
      playlistAdd,
    });
  // an album in turn (1.8.12): its keys, commands and «Міняти кожні N с» (three effects of its
  // own, independent of the others) — before the takeover, which opens it
  const albumShow = useAlbum({
    slideStyle,
    pushLive,
    setPreviewOverride,
    setLive,
    liveSlideRef,
    isLeader,
    leaderRef,
    imagesOpen,
    setImagesOpen,
    albumsTab: mediaTab === 'albums',
    openAlbumsTab,
    keysPaused: paletteOpen || moreShown || toolOpen,
    serverAvailable,
  });
  // a video (1.8.12-beta.3): the list, the clock on the slide, the sound in the leader, the end and
  // the posters (three effects of its own) — before the running order, which starts one
  const playlistNextRef = useRef<(() => boolean) | null>(null);
  const videoShow = useVideo({
    slideStyle,
    pushLive,
    setPreviewOverride,
    setLive,
    liveSlide,
    lastPushed,
    liveSlideRef,
    isLeader,
    leaderRef,
    videosTab: imagesOpen && mediaTab === 'videos',
    openVideosTab,
    setImagesOpen,
    serverAvailable,
    videoEnd: videoEndOf(appearance.videoEnd),
    videoPhones: videoPhonesOf(appearance.videoPhones),
    volume: videoVolumeOf(appearance.videoVolume),
    playlistCurrent: playlistItems.find((i) => i.id === playlistCurrentId) ?? null,
    playlistNextRef,
  });
  const {
    activatePassage,
    activateItem,
    stepPlaylist,
    addCurrentPassage,
    addSongToPlaylist,
    addAlbumToPlaylist,
    addVideoToPlaylist,
    addTextToPlaylist,
  } = usePlaylistActions({
    setTranslations,
    selectBook,
    selectChapter,
    setSelectedVerses,
    setScrollTarget,
    queryClient,
    appearance,
    translations,
    slideStyle,
    slideTemplate,
    pushLive,
    setPreviewOverride,
    setLive,
    openSong,
    setSongsOpen,
    setSongsPanelStanza,
    playlistRelinkSong,
    projectText,
    projectPicture,
    pictureOf,
    startAlbum: albumShow.startAlbum,
    startVideo: videoShow.startVideo,
    playlistSetCurrent,
    playlistItems,
    playlistCurrentId,
    playlistAdd,
    selectedIds,
    bookNumber,
    chapter,
    selectedVerses,
    reference,
    referenceShort,
  });
  playlistNextRef.current = () => {
    const at = playlistItems.findIndex((i) => i.id === playlistCurrentId);
    if (at < 0 || at >= playlistItems.length - 1) return false;
    stepPlaylist(1);
    return true;
  };

  // The steps of the show (useShowSteps): «На екран», Strong, Enter on a verse, live-follow, one
  // step forward or back — E9, E11, E12, E16. After usePlaylistActions: crossChapter takes
  // activatePassage.
  const {
    screenHeld,
    send,
    sendAndNotify,
    projectStrong,
    projectVerseOnEnter,
    advanceAndSay,
    advance,
  } = useShowSteps({
    liveFollow,
    live,
    adopting,
    slideLines,
    pageReference,
    slideStyle,
    slideTemplate,
    revealForSlide,
    verseSource,
    pushLive,
    setLive,
    setPreviewOverride,
    translations,
    primaryId,
    selectedPrimaryVerses,
    pageVerses,
    appearance,
    reference,
    previewOverride,
    revealCount,
    selectedVerses,
    bookNumber,
    chapter,
    primaryVerses,
    setSelectedVerses,
    chapters,
    books,
    queryClient,
    currentBook,
    activatePassage,
    selectedIds,
    selectBook,
    selectChapter,
    setScrollTarget,
    revealUnits,
    setRevealCount,
    pageCount,
    safePageIndex,
    setPageIndex,
    leaderRef,
    buildLines,
  });
  // E17: a takeover restores its page and reveal step — after the steps' reset effects (E12,
  // E16), so it runs after them in the same commit and wins
  useAdoptRestore({
    adopting,
    selectedIds,
    bookNumber,
    chapter,
    selectedVerses,
    safePageIndex,
    pageCount,
    setPageIndex,
    setRevealCount,
    setPreviewOverride,
  });

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

  // the viewers' countdown and the speaker's timer (vo-timer): their switches and E19 (a new
  // look taken at once) — where E19 was: after E13–E15, before E20
  const {
    countdownStart,
    countdownChange,
    countdownStartSaved,
    countdownShift,
    quietEnd,
    countdownPause,
    countdownKey,
    stageTimerSet,
    stageTimerStart,
    stageTimerPause,
    stageTimerShift,
    stageTimerAfterZero,
    countdownAfterZero,
  } = useTimers({
    leaderRef,
    isLeader,
    appearance,
    cornerRef,
    stageTimerRef,
    liveSlideRef,
    lastPushed,
    slideStyle,
    pushLive,
    setPreviewOverride,
    setLive,
  });
  // E20: the corner QR follows its settings on what is on screen — after E19, before E21
  useQrCornerFollow({ liveSlideRef, slideStyle, pushLive });

  // E21: a typed place sent with «На екран» goes on screen once it is in — after E19 and E20
  useShowJumpWhenReady({
    showJump,
    bookNumber,
    chapter,
    selectedVerses,
    verseQueries,
    slideLines,
    safePageIndex,
    appearance,
    revealCount,
    setPageIndex,
    setRevealCount,
    sendAndNotify,
  });

  // The 14 page hotkeys (their order kept) and Alt+arrows (E18) — here, below the handlers they
  // take: after the timers' effects, the corner QR's and showJump's (E19–E21).
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

  // Show commands from outside the keyboard (E22, E23): an output window's keys and the
  // remotes, through lib/commands.ts — right after the hotkeys, before the takeover and the hub
  useShowCommands({
    advance,
    playlistItems,
    leaderRef,
    pushLive,
    setLive,
    playlistSetCurrent,
    setRemoteView,
    hideToggle,
    blackToggle,
    coverToggle,
    queryClient,
    appearance,
    translations,
    slideStyle,
    slideTemplate,
    pictureOf,
    startAlbum: albumShow.startAlbum,
    startVideo: videoShow.startVideo,
    playlistAdd,
    previewOverride,
    slideLines,
    liveSlide,
    versePreview,
    send,
  });

  // Leader ⇄ standby (E24, E25) — after the timers' E19 and E8, before the hub's E28
  useLeaderTakeover({
    adopting,
    setTranslations,
    selectBook,
    selectChapter,
    setSelectedVerses,
    setLive,
    setScrollTarget,
    openSong,
    setSongsPanelStanza,
    setSongsOpen,
    openAlbum: albumShow.openAlbum,
    openVideosTab,
    setImagesOpen,
    setPreviewOverride,
    previewOverride,
    isLeader,
    setLiveSlide,
    lastPushed,
    pushLive,
    liveSlideRef,
    nextSlideRef,
  });

  // The hub (E26–E30): the control socket, the shared running order, «Запропонувати пульту»
  // and the remotes' screen frame — after the takeover (E25 before E28), before the timer signals
  const { viewers, hubActive, hubMovedTo, hubLost, appOff, suggestion } = useHub({
    liveSlideRef,
    nextSlideRef,
    previewSlide,
    isLeader,
    claim,
    lang,
    serverAvailable,
    followAlongRef,
    controlConn,
    queryClient,
    playlistItems,
    playlistCurrentId,
    previewOverride,
    verseSource,
    pageVerses,
    liveSlide,
    nextSlide,
  });

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
            clearSearch={clearSearch}
            searchFieldRef={searchFieldRef}
            searchKeysRef={searchKeysRef}
            focusOnReturn={searchPrefs.focusOnReturn}
            keysBusy={paletteOpen || moreShown || toolOpen}
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
              query={goToValue}
              setQuery={setGoToValue}
              ownField={header.fold.noGoTo}
              keysRef={searchKeysRef}
              translations={translations}
              dedupe={searchPrefs.dedupe}
              onEnter={(q) => void goTo(q)}
              onDone={clearSearch}
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
              onRefit={(fit) => {
                refitPicture(fit);
                videoShow.refit(fit);
              }}
              onAddToPlaylist={addImageToPlaylist}
              onDeleted={pictureDeleted}
              onScreen={
                liveSlide.visible && !liveSlide.blank ? (liveSlide.picture?.src ?? null) : null
              }
              albums={albumShow}
              tab={mediaTab}
              onTab={setMediaTab}
              videos={videoShow}
              onAddVideoToPlaylist={addVideoToPlaylist}
              onAddAlbumToPlaylist={addAlbumToPlaylist}
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
