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
import { type Slide, type SlideCountdown, type SlideCover } from '../presenterBus';
import { type CountdownPlace } from '../lib/countdown';
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
import { usePlaylist, type SeqItem } from '../playlistStore';
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
import { useRunningOrder } from './control/useRunningOrder';
import { type PastItem } from '../lib/orderFlow';
import { useTimers } from './control/useTimers';
import { useVerseDeck } from './control/useVerseDeck';
import { useJumps } from './control/useJumps';
import { useShowSteps } from './control/useShowSteps';
import { useShowJumpWhenReady } from './control/useShowJumpWhenReady';
import { usePublishNext, useAdoptRestore, useLeaderTakeover } from './control/useTakeover';
import { useShowCommands } from './control/useShowCommands';
import { useHub } from './control/useHub';
import { useOrderCurrentMirror } from './control/useOrderCurrentMirror';
import { ControlHeader } from './control/ControlHeader';
import { ControlNavbar } from './control/ControlNavbar';
import { HubBanners } from './control/HubBanners';
import { ChapterBar } from './control/ChapterBar';
import { VerseList } from './control/VerseList';
import { PlaylistDocked } from './control/PlaylistDocked';
import { ShowList, type ShowTab } from '../components/ShowList';
import { SearchField } from './control/SearchField';

/** What the control window works with (1.8.12-beta.7, F1005-12 / 15). */
export type Workspace = 'bible' | 'songs' | 'media';
type Toggle = boolean | ((open: boolean) => boolean);
const toggled = (v: Toggle, was: boolean) => (typeof v === 'function' ? v(was) : v);

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
  // «Простий вигляд» (1.8.12-beta.7): fewer tools in the header, only the preview on the right
  const simpleView = useSettings((s) => s.simpleView);
  const pushHistory = useSettings((s) => s.pushHistory);
  const removeHistory = useSettings((s) => s.removeHistory);
  const clearHistory = useSettings((s) => s.clearHistory);
  const toggleBookmark = useSettings((s) => s.toggleBookmark);
  const importBookmarks = useSettings((s) => s.importBookmarks);
  const panelPlacement = useSettings((s) => s.panelPlacement);
  const liveFollow = useSettings((s) => s.liveFollow);
  const orderFlow = useSettings((s) => s.orderFlow);
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
  // One workspace at a time (1.8.12-beta.7): see the setters below
  const [place, setPlace] = useState<{ ws: Workspace; tab: MediaTab }>({
    ws: 'bible',
    tab: 'images',
  });
  const workspace = place.ws;
  const mediaTab = place.tab;
  // the search field above the verses («Над віршами», 1.8.12-beta.9): only in «Біблія»
  const fieldInCentre = searchPrefs.place === 'verses' && workspace === 'bible';
  const header = useHeaderFold(
    `${lang}|${panelPlacement}|${navBreakpoint}|${asideBreakpoint}|${simpleView}|${searchPrefs.place}|${fieldInCentre}`,
  );
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
  // One workspace at a time (1.8.12-beta.7, F1005-12 / 15 — the author's call): the Bible, the
  // songs, or the media (pictures, albums, videos, own text); the left column and the centre change
  // with it. The setters kept their boolean shape, so the call sites still say `setSongsOpen(true)`;
  // closing one goes back to the Bible. The search results overlay any of them. Their content state
  // (open song, stanza, draft) lives outside, so coming back restores it.
  // (the workspace's state itself stands above the header's fold: the search field's place
  // depends on it — 1.8.12-beta.9)
  const [searchOpen, setSearchOpen] = useState(false);
  const songsOpen = workspace === 'songs';
  const textOpen = workspace === 'media' && mediaTab === 'text';
  const imagesOpen = workspace === 'media' && mediaTab !== 'text';
  const setWorkspace = useCallback(
    (ws: Workspace) => setPlace((p) => (p.ws === ws ? p : { ...p, ws })),
    [],
  );
  const toBible = useCallback(() => setWorkspace('bible'), [setWorkspace]);
  const setMediaTab = useCallback(
    (tab: MediaTab) => setPlace((p) => (p.tab === tab ? p : { ...p, tab })),
    [],
  );
  const setSongsOpen = useCallback(
    (v: Toggle) =>
      setPlace((p) => {
        const was = p.ws === 'songs';
        return toggled(v, was) ? { ...p, ws: 'songs' } : was ? { ...p, ws: 'bible' } : p;
      }),
    [],
  );
  const setTextOpen = useCallback(
    (v: Toggle) =>
      setPlace((p) => {
        const was = p.ws === 'media' && p.tab === 'text';
        return toggled(v, was) ? { ws: 'media', tab: 'text' } : was ? { ...p, ws: 'bible' } : p;
      }),
    [],
  );
  const setImagesOpen = useCallback(
    (v: Toggle) =>
      setPlace((p) => {
        const was = p.ws === 'media' && p.tab !== 'text';
        if (toggled(v, was)) return { ws: 'media', tab: p.tab === 'text' ? 'images' : p.tab };
        return was ? { ...p, ws: 'bible' } : p;
      }),
    [],
  );
  const openAlbumsTab = useCallback(() => setMediaTab('albums'), [setMediaTab]);
  const openVideosTab = useCallback(() => setMediaTab('videos'), [setMediaTab]);
  // the running order's item takes the operator to its mode (the author's call); a song, an album
  // and a video open theirs on their own
  const followItem = useCallback(
    (kind: SeqItem['kind']) => {
      if (kind === 'passage') toBible();
      else if (kind === 'text') setTextOpen(true);
      else if (kind === 'image') setPlace({ ws: 'media', tab: 'images' });
      // a «Заставка», «Відлік» or «Цикл» has no panel of its own (1.10.5, the Mac's round): it
      // leaves «Пісні» and an open album — they kept ←/→, the clicker and the remote, and their next
      // stanza or photo went over the item instead of the running order moving on
      else if (kind === 'cover' || kind === 'countdown' || kind === 'loop')
        setPlace((p) =>
          p.ws === 'songs' || (p.ws === 'media' && p.tab === 'albums') ? { ...p, ws: 'bible' } : p,
        );
    },
    [toBible, setTextOpen],
  );
  // «Текст на екран» picked by the operator (not by a running order item): the caret goes there
  const [textFocus, setTextFocus] = useState(0);
  const pickMediaTab = useCallback(
    (tab: MediaTab) => {
      setMediaTab(tab);
      if (tab === 'text') setTextFocus((n) => n + 1);
    },
    [setMediaTab],
  );
  const pickText = useCallback(() => {
    setTextOpen(true);
    setTextFocus((n) => n + 1);
  }, [setTextOpen]);
  /** the left column's place for the song list in «Пісні» (SongsPanel draws it there) */
  const [songListSlot, setSongListSlot] = useState<HTMLElement | null>(null);
  const [asideMode, setAsideMode] = useState<AsideMode>('preview');
  // under the monitors (1.8.12-beta.6): the running order, the bookmarks or the slide's text
  const [showTab, setShowTab] = useState<ShowTab>('order');
  const [navOpened, { toggle: toggleNav }] = useDisclosure(false);
  const [asideOpened, { toggle: toggleAside, open: openAside }] = useDisclosure(false);
  const [pinnedPreview, { toggle: togglePin }] = useDisclosure(false);
  // When navigating via search/history/concordance, scroll this verse into view.
  const [scrollTarget, setScrollTarget] = useState<number | null>(null);
  // Active Strong number for the concordance panel shown beside the verse list.
  const [concordanceStrong, setConcordanceStrong] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const serverAvailable = useServer((s) => s.available);
  const openAppSettings = useAppSettingsOpener({ setSettingsOpen, serverAvailable });
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
  // «Ще» exists while zones fold, or always in «Простий вигляд» (1.8.12-beta.7)
  const moreExists = fold.folded.length > 0 || simpleView;
  const moreShown = moreOpen && moreExists;
  // the window grew and «Ще» went away while open: it must not pop open when it comes back
  useEffect(() => {
    if (!moreExists) setMoreOpen(false);
  }, [moreExists]);
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
    stageMessageRef,
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
  /** …and «Повідомлення на сцену» (1.9.0-beta.11): its field takes letters the keys use */
  const [stageMessageOpen, setStageMessageOpen] = useState(false);
  const toolOpen = countdownOpen || stageTimerOpen || stageMessageOpen;
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
    toBible,
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

  // No effects in these: the screen switches (QR, «Заставка», hide, black, clear and back),
  // songs, pictures, then (after the album and the video) the running order on screen and its
  // adding — in this order, each taking what the one before returns (songEnd: afterToggle;
  // activateItem: projectText, projectPicture)
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
  // the running order's answer past an item's end (1.10.0-beta.1): filled by useRunningOrder, asked
  // by the album, the verse steps and the songs — the album comes before it
  const pastItemRef = useRef<PastItem | null>(null);
  // «Відлік» (useTimers, called later) for a «Відлік» item of the running order (1.10.0-beta.3)
  const countdownStartRef = useRef<
    ((countdown: SlideCountdown, place?: CountdownPlace, onCover?: SlideCover) => void) | null
  >(null);
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
    pastItemRef,
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
  // the running order on screen: an item put on, one step on or back (no effects)
  const { activatePassage, activateItem, stepPlaylist, playlistStepRef } = useRunningOrder({
    followItem,
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
    playlistNextRef,
    liveSlideRef,
    orderFlow,
    pastItemRef,
    liveSlide,
    isLeader,
    leaderRef,
    countdownStartRef,
  });
  const {
    addCurrentPassage,
    addSongToPlaylist,
    addAlbumToPlaylist,
    addVideoToPlaylist,
    addTextToPlaylist,
  } = usePlaylistActions({
    playlistAdd,
    selectedIds,
    bookNumber,
    chapter,
    selectedVerses,
    reference,
    referenceShort,
  });

  // The steps of the show (useShowSteps): «На екран», Strong, Enter on a verse, live-follow, one
  // step forward or back — E9, E11, E12, E16. After useRunningOrder: crossChapter takes
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
    pastItemRef,
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
    countdownRemote,
    timerRemote,
    stageTimerSet,
    stageMessageSet,
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
    stageMessageRef,
    liveSlideRef,
    lastPushed,
    slideStyle,
    pushLive,
    setPreviewOverride,
    setLive,
    takeCoverOff,
  });
  countdownStartRef.current = countdownStart;
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
    playlistStepRef,
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
    followItem,
    advance,
    playlistItems,
    leaderRef,
    liveSlideRef,
    countdownStart,
    pushLive,
    setLive,
    playlistSetCurrent,
    setRemoteView,
    hideToggle,
    blackToggle,
    coverToggle,
    countdownRemote,
    timerRemote,
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
    toBible,
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
  // «Сцена»'s running-order strip (1.9.0-beta.11): the item on screen, under its own key — after
  // the hub (E26–E30); it only writes localStorage
  useOrderCurrentMirror({ isLeader, currentId: playlistCurrentId });

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
    showOrder: () => {
      // the running order under the monitors (1.8.12-beta.6): the preview's tab, the aside opened
      setAsideMode('preview');
      setShowTab('order');
      openAside();
    },
    setSongsOpen,
    setTextOpen: (v: boolean) => (v ? pickText() : setTextOpen(false)),
    toMedia: () => setWorkspace('media'),
    toBible,
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

  // a bookmark into the running order (1.8.12-beta.6, «Збережене» under the monitors)
  const addBookmarkToShow = (b: RefItem) => {
    playlistAdd({
      kind: 'passage',
      label: b.ref,
      translationIds: selectedIds.length ? selectedIds : [b.translationId],
      bookNumber: b.bookNumber,
      chapter: b.chapter,
      verses: [b.verse],
    });
    notifications.show({
      message: tr('Додано у показ: {item}', { item: b.refShort || b.ref }),
      color: 'green',
      autoClose: 1200,
    });
  };

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
      mode={simpleView ? 'preview' : asideMode}
      simple={simpleView}
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
                toBible();
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
      // no pin in «Простий вигляд»: the monitors stay on top
      pinned={pinnedPreview && !simpleView}
      onTogglePin={togglePin}
      compact={compact}
      showList={(text) => (
        <ShowList
          tab={showTab}
          onTab={setShowTab}
          orderCount={playlistItems.length}
          order={
            <PlaylistDocked
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
          }
          saved={{
            items: bookmarks,
            onPick: jumpTo,
            onAdd: addBookmarkToShow,
            onRemove: toggleBookmark,
            onExport: exportBookmarks,
            onImport: importBookmarksFile,
          }}
          text={text}
        />
      )}
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
            fieldInCentre={fieldInCentre}
            keysBusy={paletteOpen || moreShown || toolOpen}
            workspace={workspace}
            setWorkspace={setWorkspace}
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
              stageMessageSet,
              setStageMessageOpen,
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
            recentResize={recentResize}
            history={history}
            clearHistory={clearHistory}
            recentBoxRef={recentBoxRef}
            layout={layout}
            jumpTo={jumpTo}
            removeHistory={removeHistory}
            workspace={workspace}
            songListSlot={setSongListSlot}
            mediaTab={mediaTab}
            onMediaTab={pickMediaTab}
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
            {fieldInCentre && (
              <Box px="sm" pt="sm">
                <SearchField
                  fieldRef={searchFieldRef}
                  value={goToValue}
                  setValue={setGoToValue}
                  goTo={goTo}
                  clearSearch={clearSearch}
                  keysRef={searchKeysRef}
                  focusKey={keymap.searchFocus}
                  width="min(100%, 32rem)"
                />
              </Box>
            )}
            <SearchPanel
              open={searchOpen}
              onClose={() => setSearchOpen(false)}
              primaryId={primaryId}
              scope={searchScope}
              onScopeChange={setSearchScope}
              onPick={(r, opts) => jumpTo(r, { focus: true, show: opts?.show })}
              query={goToValue}
              setQuery={setGoToValue}
              ownField={header.fold.noGoTo && !fieldInCentre}
              keysRef={searchKeysRef}
              translations={translations}
              dedupe={searchPrefs.dedupe}
              onEnter={(q, opts) => void goTo(q, opts)}
              onDone={clearSearch}
            />
            {/* the modes (1.8.12-beta.7): «Пісні» and «Медіа» take the centre, the Bible's chapter bar
                and verses stay mounted underneath (their scroll and measures kept) */}
            <SongsPanel
              open={songsOpen}
              listSlot={songListSlot}
              onProjectStanza={projectText}
              songId={songsPanelSongId}
              onSongIdChange={openSong}
              activeStanza={songsPanelStanza}
              onActiveStanzaChange={setSongsPanelStanza}
              onAddToPlaylist={addSongToPlaylist}
              keysPaused={paletteOpen || moreShown || toolOpen}
              onSongEnd={songEnd}
              onPastEnd={(dir, songId, held) =>
                pastItemRef.current?.(dir, { kind: 'song', songId }, held) ?? null
              }
            />
            <TextPanel
              open={textOpen}
              focusKey={textFocus}
              onProject={projectAnnouncement}
              onAddToPlaylist={addTextToPlaylist}
            />
            <ImagesPanel
              open={imagesOpen}
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
              videos={videoShow}
              onAddVideoToPlaylist={addVideoToPlaylist}
              onAddAlbumToPlaylist={addAlbumToPlaylist}
            />
            <Box style={{ display: workspace === 'bible' ? 'contents' : 'none' }}>
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
            </Box>
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
