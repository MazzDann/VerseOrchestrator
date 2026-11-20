import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { type Book, type Verse } from '../../api';
import { type Appearance } from '../../settingsStore';
import { type Slide, type SlideLine, type SlideStyle } from '../../presenterBus';
import { matchesCombo, slashTyped, type Keymap } from '../../hotkeys';
import { inOverlay, isFormField, scrollableAround } from '../../lib/keyScroll';
import { floatingPanelOpen } from '../../lib/panelStack';
import { type SearchScope } from '../../components/SearchPanel';
import { type Workspace } from '../Control';
import { openPresenter } from './outputWindows';

/**
 * The control window's page hotkeys (react-hotkeys-hook; 20 calls (the six mode keys since 1.19.0-beta.1, after the palette), their order and their deps
 * arrays as they were in Control) and Alt+arrows (E18). Each handler runs the one from the
 * render its deps last changed in; the restore key reads its ref.
 */
export function useControlHotkeys({
  keymap,
  advanceAndSay,
  hideToggle,
  clearScreen,
  openSearch,
  setPaletteOpen,
  showToScreen,
  blackToggle,
  coverToggle,
  countdownKey,
  toggleLive,
  appKeys,
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
  pickHeld,
  selectedIds,
  currentBook,
  versePreview,
  slideLines,
  reference,
  slideStyle,
  workspace,
  setWorkspace,
}: {
  keymap: Keymap;
  advanceAndSay: (delta: number, previewOnly?: boolean, held?: boolean) => void;
  hideToggle: () => void;
  clearScreen: () => void;
  openSearch: (scope?: SearchScope) => void;
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
  showToScreen: () => void;
  blackToggle: () => void;
  coverToggle: () => void;
  countdownKey: () => void;
  /** «Наживо» on / off, said (1.23.0-beta.2) */
  toggleLive: () => void;
  /** the desktop app's own keys (1.24.0-beta.2) — read through a ref, so their deps stay put */
  appKeys: MutableRefObject<AppKeys>;
  restoreRef: MutableRefObject<() => void>;
  /** the running order's next / previous item, said when there is none (1.8.12-beta.6) */
  playlistStepRef: MutableRefObject<(delta: 1 | -1) => void>;
  pageCount: number;
  pageIndex: number;
  primaryVerses: Verse[];
  selectedVerses: number[];
  revealCount: number;
  revealUnits: string[] | null;
  appearance: Appearance;
  previewOverride: Slide | null;
  chapters: number[];
  live: boolean;
  liveFollow: boolean;
  screenHeld: boolean;
  /** a pick waits for Enter: «Далі» shows it first (1.13.0-beta.1) */
  pickHeld: boolean;
  selectedIds: number[];
  currentBook: Book | null;
  versePreview: Slide;
  slideLines: SlideLine[];
  reference: string;
  slideStyle: SlideStyle;
  /** the modes from the keyboard (1.19.0-beta.1, F1017-02) */
  workspace: Workspace;
  setWorkspace: (ws: Workspace) => void;
}) {
  // Hotkeys are user-rebindable (settingsStore.keymap; defaults in hotkeys.ts).
  // "advanceNext/Prev" default to arrows + PageDown/PageUp (the keys USB clickers emit).
  // a held key steps on (its repeats), but never across a chapter's edge — and the toggles below
  // ignore repeats: a held «.» / B / L / T flickered, a held ⇧PageDown walked items (1.9.5, Mac check).
  // Inside an open menu or an item editor the keys are theirs (1.10.5): ← → from the «+» menu stepped
  // the show
  useHotkeys(keymap.advanceNext, (e) => !inOverlay(e.target) && advanceAndSay(1, false, e.repeat), [
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
    screenHeld,
    pickHeld,
    selectedIds,
    currentBook,
  ]);
  useHotkeys(
    keymap.advancePrev,
    (e) => !inOverlay(e.target) && advanceAndSay(-1, false, e.repeat),
    [
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
      screenHeld,
      pickHeld,
      selectedIds,
      currentBook,
    ],
  );
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
  useHotkeys(
    keymap.previewNext,
    (e) => !inOverlay(e.target) && advanceAndSay(1, true, e.repeat),
    { preventDefault: true },
    [keymap.previewNext, ...previewDeps],
  );
  useHotkeys(
    keymap.previewPrev,
    (e) => !inOverlay(e.target) && advanceAndSay(-1, true, e.repeat),
    { preventDefault: true },
    [keymap.previewPrev, ...previewDeps],
  );
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
  useHotkeys(keymap.blank, (e) => !e.repeat && hideToggle(), [keymap.blank, versePreview, live]);
  // Esc with a floating panel open closes the panel (FloatingPanel) — not the screen too; nor
  // when it closes a menu, a list or an editor (1.10.5: the «+» menu's Esc cleared the screen)
  useHotkeys(
    keymap.clear,
    (e) => {
      if (e.repeat || (e.key === 'Escape' && (floatingPanelOpen() || inOverlay(e.target)))) return;
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
  useHotkeys(keymap.palette, (e) => !e.repeat && setPaletteOpen((o) => !o), {
    preventDefault: true,
    enableOnFormTags: true,
  });
  // the modes: Ctrl+1…4 / Alt+1…4 and Ctrl+Tab / Ctrl+Shift+Tab (1.19.0-beta.1, F1017-02)
  const modeKeys = { preventDefault: true, enableOnFormTags: true } as const;
  useHotkeys(keymap.modeBible, (e) => !e.repeat && setWorkspace('bible'), modeKeys, [
    keymap.modeBible,
  ]);
  useHotkeys(keymap.modeSongs, (e) => !e.repeat && setWorkspace('songs'), modeKeys, [
    keymap.modeSongs,
  ]);
  useHotkeys(keymap.modeDocs, (e) => !e.repeat && setWorkspace('docs'), modeKeys, [
    keymap.modeDocs,
  ]);
  useHotkeys(keymap.modeMedia, (e) => !e.repeat && setWorkspace('media'), modeKeys, [
    keymap.modeMedia,
  ]);
  useHotkeys(keymap.modeNext, (e) => !e.repeat && setWorkspace(nextMode(workspace, 1)), modeKeys, [
    keymap.modeNext,
    workspace,
  ]);
  useHotkeys(keymap.modePrev, (e) => !e.repeat && setWorkspace(nextMode(workspace, -1)), modeKeys, [
    keymap.modePrev,
    workspace,
  ]);
  // "project" (default F5/F2): push the current selection to the screen (the way to
  // project when live-follow is off; harmless while following).
  useHotkeys(
    keymap.project,
    (e) => !e.repeat && showToScreen(),
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
  useHotkeys(keymap.black, (e) => !e.repeat && blackToggle(), [keymap.black, versePreview]);
  useHotkeys(keymap.cover, (e) => !e.repeat && coverToggle(), [
    keymap.cover,
    versePreview,
    appearance,
  ]);
  useHotkeys(keymap.countdown, (e) => !e.repeat && countdownKey(), [
    keymap.countdown,
    appearance,
    slideStyle,
  ]);
  useHotkeys(keymap.restore, (e) => !e.repeat && restoreRef.current(), { preventDefault: true }, [
    keymap.restore,
  ]);
  // «Наживо» from the keyboard (1.23.0-beta.2, F1114-12): the switch in the header may be folded
  // away, so the change is said too
  // «Вікно показу» (1.24.0-beta.2): F5 in the desktop app, as a presentation's start; none in a browser
  useHotkeys(
    keymap.outputWindow || 'f24+f23',
    (e) => !e.repeat && !inOverlay(e.target) && void openPresenter(),
    { preventDefault: true, enableOnFormTags: true, enabled: !!keymap.outputWindow },
    [keymap.outputWindow],
  );
  // the keys a browser keeps — the desktop app's (1.24.0-beta.2); none bound in a browser
  // in a text field only the F-keys act: a field keeps its own Ctrl chords (a Mac's Ctrl+E / N are
  // the caret's — review)
  const appKey = (combo: string, run: (k: AppKeys) => void, inFields = false) =>
    [
      combo || 'f24+f23',
      (e: KeyboardEvent) => {
        if (e.repeat || inOverlay(e.target)) return;
        run(appKeys.current);
      },
      { preventDefault: true, enableOnFormTags: inFields, enabled: !!combo },
      [combo],
    ] as const;
  useHotkeys(...appKey(keymap.historyFocus, (k) => k.historyFocus()));
  useHotkeys(...appKey(keymap.bookmarkAdd, (k) => k.bookmarkAdd()));
  useHotkeys(...appKey(keymap.placeBack, (k) => k.placeStep(-1)));
  useHotkeys(...appKey(keymap.placeForward, (k) => k.placeStep(1)));
  useHotkeys(...appKey(keymap.helpKeys, (k) => k.helpKeys(), true));
  useHotkeys(...appKey(keymap.controlFullscreen, () => toggleControlFullscreen(), true));
  useHotkeys(...appKey(keymap.openSettings, (k) => k.openSettings()));
  useHotkeys(...appKey(keymap.openFile, (k) => k.openFile()));
  useHotkeys(...appKey(keymap.newText, (k) => k.newText()));
  useHotkeys(...appKey(keymap.stageWindow, (k) => k.stageWindow(), true));
  useHotkeys(...appKey(keymap.closeOutputs, (k) => k.closeOutputs()));
  useHotkeys(...appKey(keymap.unpinAll, (k) => k.unpinAll()));
  useHotkeys(...appKey(keymap.textBigger, (k) => k.textSize(1)));
  useHotkeys(...appKey(keymap.textSmaller, (k) => k.textSize(-1)));
  useHotkeys(...appKey(keymap.textReset, (k) => k.textSize(0)));
  useHotkeys(...appKey(keymap.chapterPrev, (k) => k.chapterStep(-1)));
  useHotkeys(...appKey(keymap.chapterNext, (k) => k.chapterStep(1)));
  useHotkeys(...appKey(keymap.bookPrev, (k) => k.bookStep(-1)));
  useHotkeys(...appKey(keymap.bookNext, (k) => k.bookStep(1)));
  useHotkeys(...appKey(keymap.verseField, (k) => k.verseField()));
  useHotkeys(...appKey(keymap.qrToggle, (k) => k.qrToggle()));
  useHotkeys(...appKey(keymap.videoMute, (k) => k.videoMute()));
  useHotkeys(...appKey(keymap.videoStop, (k) => k.videoStop()));
  useHotkeys(keymap.liveToggle, (e) => !e.repeat && !inOverlay(e.target) && toggleLive(), [
    keymap.liveToggle,
    toggleLive,
  ]);
  // `/` (1.8.12-beta.4, F1005-07): to the search field where the browser keeps Ctrl+F for itself
  // (LibreWolf, Firefox); typed into a field it stays a «/»
  useHotkeys(keymap.searchFocus, () => openSearch(), { preventDefault: true });
  // the running order item by item (1.8.12-beta.6, F1005-06): Shift+PageDown / PageUp, or ← →
  // under «↑ ↓ вірші, ← → елементи»
  useHotkeys(
    keymap.playlistNext,
    (e) => !e.repeat && !inOverlay(e.target) && playlistStepRef.current(1),
    { preventDefault: true },
    [keymap.playlistNext],
  );
  useHotkeys(
    keymap.playlistPrev,
    (e) => !e.repeat && !inOverlay(e.target) && playlistStepRef.current(-1),
    { preventDefault: true },
    [keymap.playlistPrev],
  );
  // «/» typed by any key (the Ukrainian layout's ⇧ + another key, 1.9.7) — the bound key works above
  const openSearchRef = useRef(openSearch);
  openSearchRef.current = openSearch;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isFormField(e.target) || !slashTyped(e, keymap)) return;
      e.preventDefault();
      openSearchRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keymap]);
}

/** The desktop app's own keys' actions (1.24.0-beta.2), from Control. */
export interface AppKeys {
  historyFocus: () => void;
  bookmarkAdd: () => void;
  placeStep: (d: 1 | -1) => void;
  helpKeys: () => void;
  openSettings: () => void;
  openFile: () => void;
  // 1.24.0-beta.3
  newText: () => void;
  stageWindow: () => void;
  closeOutputs: () => void;
  unpinAll: () => void;
  /** 1 bigger, -1 smaller, 0 back to the largest that fits */
  textSize: (d: 1 | -1 | 0) => void;
  chapterStep: (d: 1 | -1) => void;
  bookStep: (d: 1 | -1) => void;
  verseField: () => void;
  qrToggle: () => void;
  videoMute: () => void;
  videoStop: () => void;
}

/** Nothing yet: Control fills its keys' actions further down its render (1.24.0-beta.2). */
export const NO_APP_KEYS = new Proxy({} as AppKeys, { get: () => () => undefined });

/** F11 (the desktop app): the control window full screen and back. */
function toggleControlFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen().catch(() => undefined);
}

const MODES: Workspace[] = ['bible', 'songs', 'docs', 'media'];
/** the mode after (or before) this one, round the four */
export const nextMode = (ws: Workspace, d: 1 | -1): Workspace =>
  MODES[(MODES.indexOf(ws) + d + MODES.length) % MODES.length];
