import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { type Book, type Verse } from '../../api';
import { type Appearance } from '../../settingsStore';
import { type Slide, type SlideLine, type SlideStyle } from '../../presenterBus';
import { matchesCombo, type Keymap } from '../../hotkeys';
import { isFormField, scrollableAround } from '../../lib/keyScroll';
import { floatingPanelOpen } from '../../lib/panelStack';
import { type SearchScope } from '../../components/SearchPanel';

/**
 * The control window's page hotkeys (react-hotkeys-hook; 14 calls, their order and their deps
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
}: {
  keymap: Keymap;
  advanceAndSay: (delta: number, previewOnly?: boolean, held?: boolean) => void;
  hideToggle: () => void;
  clearScreen: () => void;
  openSearch: (scope?: SearchScope) => void;
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
  sendAndNotify: () => void;
  blackToggle: () => void;
  coverToggle: () => void;
  countdownKey: () => void;
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
  selectedIds: number[];
  currentBook: Book | null;
  versePreview: Slide;
  slideLines: SlideLine[];
  reference: string;
  slideStyle: SlideStyle;
}) {
  // Hotkeys are user-rebindable (settingsStore.keymap; defaults in hotkeys.ts).
  // "advanceNext/Prev" default to arrows + PageDown/PageUp (the keys USB clickers emit).
  // a held key steps on (its repeats), but never across a chapter's edge — and the toggles below
  // ignore repeats: a held «.» / B / L / T flickered, a held ⇧PageDown walked items (1.9.5, Mac check)
  useHotkeys(keymap.advanceNext, (e) => advanceAndSay(1, false, e.repeat), [
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
  useHotkeys(keymap.advancePrev, (e) => advanceAndSay(-1, false, e.repeat), [
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
  useHotkeys(
    keymap.previewNext,
    (e) => advanceAndSay(1, true, e.repeat),
    { preventDefault: true },
    [keymap.previewNext, ...previewDeps],
  );
  useHotkeys(
    keymap.previewPrev,
    (e) => advanceAndSay(-1, true, e.repeat),
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
  // Esc with a floating panel open closes the panel (FloatingPanel) — not the screen too.
  useHotkeys(
    keymap.clear,
    (e) => {
      if (e.repeat || (e.key === 'Escape' && floatingPanelOpen())) return;
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
  // "project" (default F5/F2): push the current selection to the screen (the way to
  // project when live-follow is off; harmless while following).
  useHotkeys(
    keymap.project,
    (e) => !e.repeat && sendAndNotify(),
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
  // `/` (1.8.12-beta.4, F1005-07): to the search field where the browser keeps Ctrl+F for itself
  // (LibreWolf, Firefox); typed into a field it stays a «/»
  useHotkeys(keymap.searchFocus, () => openSearch(), { preventDefault: true });
  // the running order item by item (1.8.12-beta.6, F1005-06): Shift+PageDown / PageUp, or ← →
  // under «↑ ↓ вірші, ← → елементи»
  useHotkeys(
    keymap.playlistNext,
    (e) => !e.repeat && playlistStepRef.current(1),
    { preventDefault: true },
    [keymap.playlistNext],
  );
  useHotkeys(
    keymap.playlistPrev,
    (e) => !e.repeat && playlistStepRef.current(-1),
    { preventDefault: true },
    [keymap.playlistPrev],
  );
}
