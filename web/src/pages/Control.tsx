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
  IconChevronLeft,
  IconChevronRight,
  IconAdjustments,
  IconList,
  IconPlaylistAdd,
  IconLayoutDashboard,
  IconQrcode,
  IconDeviceMobile,
} from '@tabler/icons-react';

import { api, type Book, type Verse, type SongStyle, type RemoteCommand } from '../api';
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
  type PresenterCommand,
  type Slide,
  type SlideLine,
  type SlideStyle,
  type SlideTemplate,
  type SlideReveal,
  type TextSpan,
} from '../presenterBus';
import { parseRedLetter, strongLangFor } from '@vo/shared';
import { parseStrongTokens } from '../lib/strong';
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
import { SettingsPanel } from '../components/SettingsPanel';
import { PlaylistPanel } from '../components/PlaylistPanel';
import { FollowPanel } from '../components/FollowPanel';
import { RemotePanel } from '../components/RemotePanel';
import { connectLive, type LiveConnection } from '../lib/liveSocket';
import { REMOTE_LABEL } from '../lib/remote';
import { summarize } from '../lib/slide';
import { CommandPalette, type CommandItem } from '../components/CommandPalette';
import { ToolButton, ToolIcon, ToolZone } from '../components/Toolbar';
import { ResizeHandle } from '../components/ResizeHandle';
import { setAppShellWidth } from '../lib/appShell';
import { formatCombo } from '../hotkeys';
import { usePlaylist, type SeqItem, type SeqPassage, type SeqSong } from '../playlistStore';

const EMPTY_ARRAY: never[] = [];
type Jumpable = { translationId: number; bookNumber: number; chapter: number; verse: number };

type InlinePanel = 'search' | 'songs' | 'text';

export function Control() {
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
  // Below ~1280px the text buttons in the header collapse to icons so the zones fit.
  const wideHeader = useMediaQuery('(min-width: 80em)') ?? true;
  // Below ~1120px also drop the title, the go-to field and the «Наживо» caption.
  const midHeader = useMediaQuery('(min-width: 70em)') ?? true;

  const queryClient = useQueryClient();
  const playlistItems = usePlaylist((s) => s.items);
  const playlistCurrentId = usePlaylist((s) => s.currentId);
  const playlistSaved = usePlaylist((s) => s.saved);
  const playlistAdd = usePlaylist((s) => s.add);
  const playlistRemove = usePlaylist((s) => s.removeItem);
  const playlistMove = usePlaylist((s) => s.move);
  const playlistReorder = usePlaylist((s) => s.reorder);
  const playlistClear = usePlaylist((s) => s.clear);
  const playlistSetCurrent = usePlaylist((s) => s.setCurrent);
  const playlistSaveProgram = usePlaylist((s) => s.saveProgram);
  const playlistLoadProgram = usePlaylist((s) => s.loadProgram);
  const playlistDeleteProgram = usePlaylist((s) => s.deleteProgram);

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
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
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

  const jumpTo = (r: Jumpable) => {
    if (selectedIds.length === 0) setTranslations([r.translationId]);
    selectBook(r.bookNumber);
    selectChapter(r.chapter);
    setSelectedVerses([r.verse]);
    setScrollTarget(r.verse);
  };

  // Quick jump bar: resolve a reference/text query and jump to the first hit.
  const goTo = async (q: string) => {
    const query = q.trim();
    if (!query || primaryId == null) return;
    try {
      const res = await api.search(query, [primaryId]);
      if (res.results.length > 0) {
        jumpTo(res.results[0]);
        setGoToValue('');
      } else {
        notifications.show({
          message: `«${query}» не знайдено. Спробуйте посилання, як-от «Ів 3:16», або слово з тексту`,
          color: 'gray',
          autoClose: 2500,
        });
      }
    } catch (e) {
      notifications.show({ message: `Не вдалося перейти: ${(e as Error).message}`, color: 'red' });
    }
  };

  const openSearch = (scope: SearchScope) => {
    setSearchScope(scope);
    setSearchOpen(true);
  };

  const translationsQuery = useQuery({ queryKey: ['translations'], queryFn: api.translations });
  const translations = translationsQuery.data ?? EMPTY_ARRAY;

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
    }),
    [appearance],
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
    publishNext(nextSlide);
  }, [nextSlide]);

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
    const s = stripBg(slide);
    if (!controlConn.current?.send({ type: 'publish', slide: s })) void api.livePost(s);
  };
  const pauseAudience = () => {
    if (!controlConn.current?.send({ type: 'publish', paused: true })) void api.livePause();
  };
  const pushLive = (slide: Slide) => {
    publishSlide(slide);
    setLiveSlide(slide);
    if (followAlongRef.current) publishAudience(slide);
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
      ...overrides,
    };
    pushLive(slide);
    setLive(slide.visible && !slide.blank);
    // Projecting the verse selection ends any song/text/Strong override, so the
    // preview and live-follow track the verses again (no preview/screen desync).
    setPreviewOverride(null);
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
    };
    pushLive(slide);
    setPreviewOverride(slide);
    setLive(true);
    notifications.show({
      message: `На екрані зі Стронгом: ${pageReference}`,
      color: 'live',
      autoClose: 1500,
    });
  };

  // Project a text slide (song stanza). With `faithful`, reproduce the pptx look
  // (its background/colour/font/bold + a positioned quote box); else use the app style.
  const projectText = (text: string, reference: string, faithful?: SongStyle | null) => {
    if (!text.trim()) return;
    let style = slideStyle;
    let template = slideTemplate;
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
            // Original pptx font size (cqh) → render the stanza "as made", not auto-fit.
            size: faithful.size,
          },
        ],
      } satisfies SlideTemplate;
    }
    const slide: Slide = {
      lines: [{ translationAbbr: '', text, rtl: false }],
      reference,
      blank: false,
      visible: true,
      style,
      template,
    };
    pushLive(slide);
    setPreviewOverride(slide);
    setLive(true);
    if (reference) {
      notifications.show({ message: `На екрані: ${reference}`, color: 'live', autoClose: 1500 });
    }
  };

  // Project a free-text slide (announcement / note / custom text) and keep it in recents.
  const projectAnnouncement = (title: string, body: string) => {
    if (!body.trim()) return;
    projectText(body, title.trim());
    pushRecentText({ title, body });
    if (!title.trim()) {
      notifications.show({ message: 'Текст на екрані', color: 'live', autoClose: 1500 });
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
        message: 'Уривок недоступний — переклад змінився. Оновіть елемент показу.',
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
      const s = await queryClient.fetchQuery({
        queryKey: ['song', it.songId],
        queryFn: () => api.song(it.songId),
      });
      if (s.slides.length > 0) {
        projectText(
          s.slides[0].text,
          `№${s.number ?? ''} ${s.title}`.trim(),
          it.faithful ? s.slides[0].style : null,
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
      label: reference || referenceShort || 'Уривок',
      translationIds: selectedIds,
      bookNumber,
      chapter,
      verses: selectedVerses,
    });
    notifications.show({
      message: `Додано у показ: ${referenceShort || reference}`,
      color: 'green',
      autoClose: 1200,
    });
  };

  const addSongToPlaylist = (song: { songId: number; label: string; faithful: boolean }) => {
    playlistAdd({
      kind: 'song',
      label: song.label || 'Пісня',
      songId: song.songId,
      faithful: song.faithful,
    });
    notifications.show({
      message: `Додано у показ: ${song.label}`,
      color: 'green',
      autoClose: 1200,
    });
  };

  const addTextToPlaylist = (item: { title: string; body: string }) => {
    if (!item.body.trim()) return;
    const label = item.title.trim() || item.body.trim().split('\n')[0].slice(0, 40);
    playlistAdd({ kind: 'text', label, title: item.title, body: item.body });
    notifications.show({ message: 'Текст додано у показ', color: 'green', autoClose: 1200 });
  };

  // While following live, republish when the selection, reference, or appearance
  // changes. With follow off, navigation only updates the preview — push with F5/F2.
  // Skip while a song/text/Strong projection (`previewOverride`) owns the screen, or
  // live-follow would clobber it back to the verse selection on the next render
  // (slideLines gets a fresh identity every render via useQueries). Navigating the
  // verses clears the override, after which live-follow resumes.
  useEffect(() => {
    if (liveFollow && live && slideLines.length > 0 && !previewOverride) send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    slideLines,
    reference,
    slideStyle,
    slideTemplate,
    liveFollow,
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
      document
        .querySelector(`.vo-verse-item[data-verse="${verse}"]`)
        ?.scrollIntoView({ block: 'center' });
      setScrollTarget(null);
    }, 60);
    return () => window.clearTimeout(id);
  }, [scrollTarget, primaryVerses]);

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

  const stepVerse = (delta: number) => {
    if (primaryVerses.length === 0) return;
    const all = primaryVerses.map((v) => v.verse);
    const current = selectedVerses.length ? selectedVerses[selectedVerses.length - 1] : all[0] - 1;
    const idx = all.indexOf(current);
    const next = all[Math.min(all.length - 1, Math.max(0, idx + delta))];
    if (next != null) setSelectedVerses([next]);
  };

  // "Next/previous": with a long passage split across pages, step pages; otherwise
  // step the single verse. Drives arrows, the PageDown/PageUp clicker keys, and the
  // preview's page arrows — so the same gesture always means "advance the screen".
  const advance = (delta: number) => {
    // Progressive reveal first: step through the verses of the current slide before
    // moving on. Only while projecting the verse selection (no song/text override).
    if (appearance.reveal && revealUnits && revealUnits.length > 1 && !previewOverride) {
      if (delta > 0 && revealCount < revealUnits.length) {
        setRevealCount((c) => Math.min(revealUnits.length, c + 1));
        return;
      }
      if (delta < 0 && revealCount > 1) {
        setRevealCount((c) => Math.max(1, c - 1));
        return;
      }
      // Exhausted in this direction → fall through to step the page/verse.
    }
    // Moving to a new verse/page: start its reveal fresh in THIS batched update (not
    // via the post-commit reset effect) so live-follow doesn't push the new content at
    // the old reveal count for a frame.
    setRevealCount(1);
    if (pageCount > 1) {
      // Paging the verse selection ends any active projection override; clear it so
      // live-follow pushes the new page (changing the page alone doesn't touch the
      // selection, which is what otherwise clears the override).
      setPreviewOverride(null);
      setPageIndex((i) => Math.min(pageCount - 1, Math.max(0, Math.min(i, pageCount - 1) + delta)));
    } else {
      stepVerse(delta);
    }
  };

  // Reset the reveal to the first verse whenever the projected content changes.
  useEffect(() => {
    setRevealCount(1);
  }, [selectedVerses, safePageIndex, primaryId]);

  // Hotkeys are user-rebindable (settingsStore.keymap; defaults in hotkeys.ts).
  // "advanceNext/Prev" default to arrows + PageDown/PageUp (the keys USB clickers emit).
  useHotkeys(keymap.advanceNext, () => advance(1), [
    keymap.advanceNext,
    pageCount,
    pageIndex,
    primaryVerses,
    selectedVerses,
    revealCount,
    revealUnits,
    appearance.reveal,
    previewOverride,
  ]);
  useHotkeys(keymap.advancePrev, () => advance(-1), [
    keymap.advancePrev,
    pageCount,
    pageIndex,
    primaryVerses,
    selectedVerses,
    revealCount,
    revealUnits,
    appearance.reveal,
    previewOverride,
  ]);
  // Remove the slide from the output. Drops out of live so the live-follow effect
  // doesn't immediately re-project the selection (pushLive's setLiveSlide re-renders,
  // which would re-run that effect).
  const clearScreen = () => {
    pushLive({ lines: [], reference: '', blank: false, visible: false });
    setLive(false);
  };
  useHotkeys(keymap.blank, () => (live ? send({ blank: true }) : undefined), [
    keymap.blank,
    live,
    slideLines,
    reference,
  ]);
  useHotkeys(keymap.clear, () => clearScreen(), [keymap.clear]);
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
    send();
    if (slideLines.length > 0) {
      notifications.show({
        message: `На екрані: ${pageReference}`,
        color: 'live',
        autoClose: 1500,
      });
    }
  };

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
    });
    setLive(true);
    setPreviewOverride(null);
    notifications.show({
      message: `На екрані: ${formatReference(currentBook, chapter, [verseNum], true)}`,
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

  const blankScreen = () => {
    pushLive({ lines: slideLines, reference, blank: true, visible: true, style: slideStyle });
    setLive(false);
    notifications.show({ message: 'Екран затемнено', color: 'gray', autoClose: 1500 });
  };

  // Pure-black screen, ignoring the background — distinct from "Затемнити" (blank),
  // which keeps the background image/colour and only hides the text. Bound to ".".
  const blackScreen = () => {
    pushLive({
      lines: [],
      reference: '',
      blank: false,
      visible: true,
      forceBlack: true,
      style: slideStyle,
    });
    setLive(false);
    notifications.show({ message: 'Чорний екран', color: 'dark', autoClose: 1200 });
  };
  useHotkeys(keymap.black, () => blackScreen(), [keymap.black, slideStyle]);

  // Commands forwarded from the presenter window (clicker/keyboard pressed while
  // the 2nd-monitor output window has focus). A ref keeps the latest closures so we
  // subscribe once instead of re-binding the channel on every render.
  const commandHandler = useRef<(cmd: PresenterCommand) => void>(() => {});
  commandHandler.current = (cmd: PresenterCommand) => {
    // While a song is open it owns next/prev (SongsPanel steps its stanzas off the
    // same command channel); don't also advance the verse selection underneath it.
    const songMode = songsOpen && songsPanelSongId != null;
    if (cmd === 'next') {
      if (!songMode) advance(1);
    } else if (cmd === 'prev') {
      if (!songMode) advance(-1);
    } else if (cmd === 'blank') blankScreen();
    else if (cmd === 'black') blackScreen();
  };
  useEffect(() => subscribeCommand((cmd) => commandHandler.current(cmd)), []);

  // Speaker remotes: this window holds the hub's control socket; paired phones' commands
  // (already scope-checked by the server) run through the same handler as the output
  // window's forwarded keys. A 'remotes' frame means the pairing list changed.
  // Remotes get compact summaries (lib/slide.ts) of what's on screen and what «Далі» shows.
  const screenFrame = () => ({
    type: 'screen',
    screen: summarize(liveSlideRef.current),
    next: nextSlideRef.current ? summarize(nextSlideRef.current) : null,
  });
  const liveSlideRef = useRef(liveSlide);
  liveSlideRef.current = liveSlide;
  const nextSlideRef = useRef(nextSlide);
  nextSlideRef.current = nextSlide;
  /** Audience phones currently on /follow (pushed by the hub). */
  const [viewers, setViewers] = useState(0);
  useEffect(() => {
    const c = connectLive({
      hello: { role: 'control' },
      onMessage: (f) => {
        // (Re)connected as control: give remotes the current screen straight away.
        if (f.type === 'welcome') {
          c.send(screenFrame());
          // After a server restart the relay starts paused — restore what phones should see.
          if (followAlongRef.current)
            c.send({ type: 'publish', slide: stripBg(liveSlideRef.current) });
        }
        if (f.type === 'viewers' && typeof f.count === 'number') setViewers(f.count);
        if (f.type === 'command' && typeof f.cmd === 'string' && f.cmd in REMOTE_LABEL) {
          const cmd = f.cmd as RemoteCommand;
          commandHandler.current(cmd);
          notifications.show({
            message: `Пульт «${String(f.from ?? '')}»: ${REMOTE_LABEL[cmd]}`,
            color: 'brand',
            autoClose: 1200,
          });
        } else if (f.type === 'remotes') {
          void queryClient.invalidateQueries({ queryKey: ['remotes'] });
        }
      },
    });
    controlConn.current = c;
    return () => {
      controlConn.current = null;
      c.stop();
    };
  }, [queryClient]);
  // Keep remotes' «На екрані» / «Далі» in step with the output (independent of follow-along).
  useEffect(() => {
    controlConn.current?.send(screenFrame());
  }, [liveSlide, nextSlide]);

  const openPresenter = async () => {
    const win = await openPresenterWindow();
    notifications.show(
      win
        ? { message: 'Вікно показу відкрито', color: 'brand', autoClose: 1500 }
        : { message: 'Не вдалося відкрити вікно (перевірте блокувальник)', color: 'red' },
    );
  };

  const openStage = async () => {
    const win = await openStageWindow();
    notifications.show(
      win
        ? { message: 'Вікно сцени відкрито', color: 'brand', autoClose: 1500 }
        : { message: 'Не вдалося відкрити вікно (перевірте блокувальник)', color: 'red' },
    );
  };

  // In-app "what's on screen now" monitor — reflects the actually-published slide.
  const liveActive =
    liveSlide.visible && !liveSlide.blank && !liveSlide.forceBlack && liveSlide.lines.length > 0;
  const liveLabel = liveSlide.forceBlack
    ? 'Чорний екран'
    : liveSlide.blank
      ? 'Затемнено'
      : liveActive
        ? liveSlide.reference || 'На екрані'
        : 'Порожньо';

  // Operator actions exposed in the command palette (Ctrl+K). Fresh closures each
  // render so they never go stale; the palette only reads this while open.
  const paletteCommands: CommandItem[] = [
    {
      id: 'project',
      label: 'На екран',
      hint: 'Показати вибір',
      keywords: 'project show project',
      icon: <IconDeviceTv size={16} />,
      run: sendAndNotify,
    },
    {
      id: 'blank',
      label: 'Затемнити екран',
      keywords: 'blank zatemnyty',
      icon: <IconSquareOff size={16} />,
      run: blankScreen,
    },
    {
      id: 'black',
      label: 'Чорний екран',
      keywords: 'black chornyi',
      icon: <IconSquareFilled size={16} />,
      run: blackScreen,
    },
    { id: 'clear', label: 'Прибрати з екрана', keywords: 'clear ochystyty', run: clearScreen },
    {
      id: 'addPassage',
      label: 'Додати уривок у показ',
      keywords: 'playlist add',
      icon: <IconPlaylistAdd size={16} />,
      run: addCurrentPassage,
    },
    {
      id: 'playlist',
      label: 'Послідовність показу',
      keywords: 'playlist sequence',
      icon: <IconList size={16} />,
      run: () => setPlaylistOpen(true),
    },
    {
      id: 'songs',
      label: 'Пісні',
      keywords: 'songs pisni',
      icon: <IconMusic size={16} />,
      run: () => setSongsOpen(true),
    },
    {
      id: 'text',
      label: 'Власний текст',
      keywords: 'text tekst',
      icon: <IconLetterT size={16} />,
      run: () => setTextOpen(true),
    },
    {
      id: 'search',
      label: 'Пошук в усіх модулях',
      keywords: 'search poshuk',
      icon: <IconSearch size={16} />,
      run: () => openSearch('all'),
    },
    {
      id: 'presenter',
      label: 'Відкрити вікно показу',
      keywords: 'presenter output',
      icon: <IconScreenShare size={16} />,
      run: () => void openPresenter(),
    },
    {
      id: 'stage',
      label: 'Сцена',
      keywords: 'stage monitor',
      icon: <IconLayoutDashboard size={16} />,
      run: () => void openStage(),
    },
    {
      id: 'follow',
      label: 'Глядачі (QR)',
      keywords: 'follow qr phones',
      icon: <IconQrcode size={16} />,
      run: () => setFollowOpen(true),
    },
    {
      id: 'remote',
      label: 'Пульт доповідача',
      keywords: 'remote speaker phone pult',
      icon: <IconDeviceMobile size={16} />,
      run: () => setRemoteOpen(true),
    },
    {
      id: 'settings',
      label: 'Налаштування вигляду',
      keywords: 'settings nalashtuvannia',
      icon: <IconAdjustments size={16} />,
      run: () => setSettingsOpen(true),
    },
    {
      id: 'liveFollow',
      label: `Наживо: ${liveFollow ? 'вимкнути' : 'увімкнути'}`,
      keywords: 'live follow',
      run: () => setLiveFollow(!liveFollow),
    },
    {
      id: 'theme',
      label: colorScheme === 'dark' ? 'Світла тема' : 'Темна тема',
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
        notifications.show({ message: `Імпортовано записів: ${items.length}`, color: 'green' });
      }
    } catch {
      notifications.show({
        message: 'Не вдалося прочитати файл закладок. Потрібен .json, збережений кнопкою «Експорт»',
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
          {/* Zones, left → right: navigate · sources | windows · live output · app. */}
          <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="sm">
            <Group gap="sm" wrap="nowrap">
              <Burger
                opened={navOpened}
                onClick={toggleNav}
                hiddenFrom="sm"
                size="sm"
                aria-label="Навігація"
              />
              {midHeader && (
                <Text fw={600} size="sm" style={{ whiteSpace: 'nowrap' }}>
                  VerseOrchestrator
                </Text>
              )}
              <ToolZone label="Навігація">
                <ToolIcon
                  label="Пошук"
                  hint={`У поточному перекладі; ${formatCombo(keymap.searchAll)} — в усіх`}
                  combo={keymap.searchCurrent}
                  icon={<IconSearch size={18} stroke={1.5} />}
                  onClick={() => openSearch('current')}
                />
                <TextInput
                  size="sm"
                  w={170}
                  display={midHeader ? undefined : 'none'}
                  placeholder="Перейти: Ів 3:16"
                  value={goToValue}
                  onChange={(e) => setGoToValue(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void goTo(goToValue);
                  }}
                  leftSection={<IconArrowRight size={14} />}
                  aria-label="Перейти до посилання"
                />
              </ToolZone>
              <ToolZone label="Джерела">
                <ToolIcon
                  label="Пісні"
                  hint="Пошук пісень з .pptx і показ куплетів"
                  icon={<IconMusic size={18} stroke={1.5} />}
                  active={songsOpen}
                  onClick={() => setSongsOpen((o) => !o)}
                />
                <ToolIcon
                  label="Власний текст"
                  hint="Скласти й показати довільний текст"
                  icon={<IconLetterT size={18} stroke={1.5} />}
                  active={textOpen}
                  onClick={() => setTextOpen((o) => !o)}
                />
                <ToolIcon
                  label="Послідовність показу"
                  hint="Черга уривків, пісень і текстів; збережені програми"
                  icon={<IconList size={18} stroke={1.5} />}
                  active={playlistOpen}
                  onClick={() => setPlaylistOpen((o) => !o)}
                />
              </ToolZone>
            </Group>

            <Group gap="sm" wrap="nowrap">
              <ToolZone label="Вікна" divider={false}>
                <ToolButton
                  label="Відкрити вікно показу"
                  hint="Вихідне вікно для другого монітора чи проєктора"
                  text="Вікно показу"
                  compact={!wideHeader}
                  icon={<IconScreenShare size={18} stroke={1.5} />}
                  onClick={() => void openPresenter()}
                />
                <ToolIcon
                  label="Сцена"
                  hint="Монітор доповідача: зараз, далі, годинник"
                  icon={<IconLayoutDashboard size={18} stroke={1.5} />}
                  onClick={() => void openStage()}
                />
                <ToolIcon
                  label={
                    followAlong ? `Глядачі: трансляція увімкнена, на зв’язку ${viewers}` : 'Глядачі'
                  }
                  hint="QR, щоб глядачі стежили за текстом з телефона"
                  icon={<IconQrcode size={18} stroke={1.5} />}
                  active={followOpen}
                  color={followAlong ? 'live' : undefined}
                  onClick={() => setFollowOpen((o) => !o)}
                />
                <ToolIcon
                  label="Пульт доповідача"
                  hint="Телефон-пульт за QR: гортати показ без доступу до налаштувань"
                  icon={<IconDeviceMobile size={18} stroke={1.5} />}
                  active={remoteOpen}
                  onClick={() => setRemoteOpen((o) => !o)}
                />
              </ToolZone>
              <ToolZone label="Вихід на екран">
                <Tooltip
                  label="Увімкнено: екран одразу повторює вибір. Вимкнено: лише прев’ю, показ кнопкою «На екран»"
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
                    label={midHeader ? 'Наживо' : undefined}
                    aria-label="Наживо"
                    styles={{ label: { paddingInlineStart: 6, whiteSpace: 'nowrap' } }}
                  />
                </Tooltip>
                <ToolButton
                  label="На екран"
                  hint="Показати поточний вибір"
                  text="На екран"
                  variant="filled"
                  color="live"
                  combo={keymap.project}
                  icon={<IconDeviceTv size={18} stroke={1.5} />}
                  disabled={slideLines.length === 0}
                  onClick={sendAndNotify}
                />
                <ToolButton
                  label="Затемнити"
                  hint="Сховати текст, фон лишається"
                  text="Затемнити"
                  compact={!wideHeader}
                  combo={keymap.blank}
                  icon={<IconSquareOff size={18} stroke={1.5} />}
                  onClick={blankScreen}
                />
                <ToolIcon
                  label="Чорний екран"
                  hint="Повністю чорний, ігнорує фон"
                  combo={keymap.black}
                  icon={<IconSquareFilled size={16} />}
                  color="dark"
                  onClick={blackScreen}
                />
              </ToolZone>
              <ToolZone label="Застосунок">
                <ToolIcon
                  label="Налаштування вигляду"
                  hint="Шрифт, кольори, шаблон слайда, пресети, клавіші"
                  icon={<IconAdjustments size={18} stroke={1.5} />}
                  active={settingsOpen}
                  onClick={() => setSettingsOpen((o) => !o)}
                />
                <ToolIcon
                  label={colorScheme === 'dark' ? 'Світла тема' : 'Темна тема'}
                  icon={
                    colorScheme === 'dark' ? (
                      <IconSun size={18} stroke={1.5} />
                    ) : (
                      <IconMoonStars size={18} stroke={1.5} />
                    )
                  }
                  onClick={() => toggleColorScheme()}
                />
              </ToolZone>
              {panelPlacement === 'aside' && (
                <Burger
                  opened={asideOpened}
                  onClick={toggleAside}
                  hiddenFrom="md"
                  size="sm"
                  aria-label="Панель показу"
                />
              )}
            </Group>
          </Group>
        </AppShell.Header>

        <AppShell.Navbar>
          <Box visibleFrom="sm">
            <ResizeHandle
              axis="x"
              edge="right"
              label="Ширина бічної панелі"
              {...panelResize('navbar')}
            />
          </Box>
          <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
                placeholder="Фільтр книг…"
                value={bookFilter}
                onChange={(e) => setBookFilter(e.currentTarget.value)}
                leftSection={<IconSearch size={14} />}
              />
            </Box>
            <Box style={{ flex: 1, minHeight: 0, padding: '0 8px' }}>
              <VirtualList
                items={filteredBooks}
                getKey={(b) => b.bookNumber}
                isSelected={(b) => b.bookNumber === bookNumber}
                onSelect={(b) => selectBook(b.bookNumber)}
                renderRow={(b) => b.longName || b.shortName}
                estimateSize={30}
                empty={
                  primaryId == null
                    ? 'Позначте переклад угорі, щоб побачити його книги'
                    : bookFilter.trim()
                      ? `Немає книг, що збігаються з «${bookFilter.trim()}»`
                      : 'У цьому перекладі немає книг'
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
              <ResizeHandle axis="y" edge="top" label="Висота історії" {...recentResize} />
              <Tabs.List grow>
                <Tabs.Tab value="history" leftSection={<IconHistory size={14} />}>
                  Історія
                </Tabs.Tab>
                <Tabs.Tab value="saved" leftSection={<IconBookmark size={14} />}>
                  Збережене
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
                    Очистити
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
                      Експорт
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
                          Імпорт
                        </Button>
                      )}
                    </FileButton>
                  </>
                )}
              </Group>
              <Box ref={recentBoxRef} style={{ height: layout.recentHeight }}>
                <ScrollArea h="100%">
                  <Tabs.Panel value="history">
                    <RefList
                      items={history}
                      onPick={jumpTo}
                      onRemove={removeHistory}
                      empty="Тут з’являтимуться місця, які ви відкривали"
                    />
                  </Tabs.Panel>
                  <Tabs.Panel value="saved">
                    <RefList
                      items={bookmarks}
                      onPick={jumpTo}
                      onRemove={(it) => toggleBookmark(it)}
                      empty="Збережіть вірш кнопкою-закладкою над прев’ю"
                    />
                  </Tabs.Panel>
                </ScrollArea>
              </Box>
            </Tabs>
          </Box>
        </AppShell.Navbar>

        <AppShell.Main>
          <Box style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
            <SearchPanel
              open={searchOpen}
              onClose={() => setSearchOpen(false)}
              primaryId={primaryId}
              scope={searchScope}
              onScopeChange={setSearchScope}
              onPick={jumpTo}
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
              keysPaused={paletteOpen}
            />
            <TextPanel
              open={textOpen}
              onClose={() => setTextOpen(false)}
              onProject={projectAnnouncement}
              onAddToPlaylist={addTextToPlaylist}
            />
            <Group justify="space-between" px="md" pt="xs" pb={4} wrap="nowrap">
              <Text fw={600} size="md" truncate>
                {currentBook
                  ? `${currentBook.longName} ${chapter ?? ''}`
                  : 'Оберіть книгу та розділ'}
              </Text>
              <Group gap={6} wrap="nowrap">
                <Tooltip label="Що зараз на екрані показу">
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
                      aria-label="Попередня сторінка"
                    >
                      <IconChevronLeft size={14} />
                    </ActionIcon>
                    <Tooltip label="Сторінка довгого уривка (← → або PageUp/PageDown)">
                      <Badge variant="filled" color="brand">
                        {safePageIndex + 1}/{pageCount}
                      </Badge>
                    </Tooltip>
                    <ActionIcon
                      variant="default"
                      size="sm"
                      disabled={safePageIndex === pageCount - 1}
                      onClick={() => advance(1)}
                      aria-label="Наступна сторінка"
                    >
                      <IconChevronRight size={14} />
                    </ActionIcon>
                  </Group>
                )}
                {selectedVerses.length > 0 && (
                  <Tooltip label="Додати уривок у показ">
                    <ActionIcon
                      variant="subtle"
                      color="brand"
                      size="sm"
                      onClick={addCurrentPassage}
                      aria-label="Додати уривок у показ"
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
                <div className="vo-chapter-grid" role="group" aria-label="Розділи">
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
            <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
              <ScrollArea style={{ flex: 1 }} px="md" py="xs">
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
                  {primaryVerses.length === 0 && (
                    <Text c="dimmed" size="sm" p="sm">
                      {currentBook == null
                        ? 'Оберіть книгу ліворуч, потім розділ угорі.'
                        : chapter == null
                          ? 'Оберіть розділ угорі.'
                          : 'У цьому розділі немає віршів у головному перекладі.'}
                    </Text>
                  )}
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
              <>
                <Divider />
                <Box style={{ height: 340, minHeight: 0 }}>{renderStudyPanels(true)}</Box>
              </>
            )}
          </Box>
        </AppShell.Main>

        {panelPlacement === 'aside' && (
          <AppShell.Aside>
            <Box visibleFrom="md">
              <ResizeHandle
                axis="x"
                edge="left"
                label="Ширина правої панелі"
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
        title="Налаштування вигляду"
        storageKey="vo:settingsPanelPos"
        width={400}
        icon={<IconAdjustments size={16} />}
      >
        <SettingsPanel />
      </FloatingPanel>

      <FloatingPanel
        opened={playlistOpen}
        onClose={() => setPlaylistOpen(false)}
        title="Послідовність показу"
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
          onNext={() => stepPlaylist(1)}
          onPrev={() => stepPlaylist(-1)}
          onSave={(n) => {
            const exists = playlistSaved.some((p) => p.name === n.trim());
            playlistSaveProgram(n);
            notifications.show({
              message: exists ? `Програму оновлено: ${n}` : `Програму збережено: ${n}`,
              color: 'green',
              autoClose: 1500,
            });
          }}
          onLoad={(n) => {
            playlistLoadProgram(n);
            notifications.show({
              message: `Відкрито програму: ${n}`,
              color: 'brand',
              autoClose: 1500,
            });
          }}
          onDelete={playlistDeleteProgram}
        />
      </FloatingPanel>

      <FloatingPanel
        opened={followOpen}
        onClose={() => setFollowOpen(false)}
        title="Глядачі"
        storageKey="vo:followPanelPos"
        width={320}
        icon={<IconQrcode size={16} />}
      >
        <FollowPanel viewers={viewers} />
      </FloatingPanel>

      <FloatingPanel
        opened={remoteOpen}
        onClose={() => setRemoteOpen(false)}
        title="Пульт доповідача"
        storageKey="vo:remotePanelPos"
        width={340}
        icon={<IconDeviceMobile size={16} />}
      >
        <RemotePanel />
      </FloatingPanel>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
        books={books}
        onJumpBook={(bn) => selectBook(bn)}
        onOpenSong={(id) => {
          openSong(id);
          setSongsOpen(true);
        }}
        onGoReference={(q) => void goTo(q)}
      />
    </>
  );
}

/** Drop the (potentially large) background image before mirroring to the follow relay. */
function stripBg(slide: Slide): Slide {
  if (!slide.style?.bgImage) return slide;
  return { ...slide, style: { ...slide.style, bgImage: null } };
}

/** Marker inserted between non-contiguous selected verses so a skip reads as a skip. */
const GAP = '…';

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

/** Collapse a verse selection into contiguous runs: [3,9] → "3,9", [3,4,5] → "3-5", [3,4,9] → "3-4,9". */
function formatVerseList(verses: number[]): string {
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  if (sorted.length === 0) return '';
  const runs: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const v = sorted[i];
    if (i < sorted.length && v === prev + 1) {
      prev = v;
      continue;
    }
    runs.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = v;
    prev = v;
  }
  return runs.join(',');
}

function formatReference(
  book: Book | null,
  chapter: number | null,
  verses: number[],
  short = false,
): string {
  if (!book || chapter == null || verses.length === 0) return '';
  const name = short ? book.shortName || book.longName : book.longName || book.shortName;
  return `${name} ${chapter}:${formatVerseList(verses)}`;
}
