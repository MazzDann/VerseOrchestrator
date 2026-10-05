import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { publishNext, type Slide } from '../../presenterBus';

/** E8 (vo-sync): what one step would show goes to «Сцена» — from the leading window only. */
export function usePublishNext({
  isLeader,
  nextSlide,
}: {
  isLeader: boolean;
  nextSlide: Slide | null;
}) {
  // Mirror the next-slide preview to the stage window.
  useEffect(() => {
    if (isLeader) publishNext(nextSlide);
  }, [nextSlide, isLeader]);
}

/**
 * E17 (vo-sync): a window that took over (0.5.10) restores the page, the reveal step and a Strong
 * slide of what was on screen once its selection is in. Called after E12 and E16 (useShowSteps).
 */
export function useAdoptRestore({
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
}: {
  adopting: MutableRefObject<{
    key: string;
    page: number;
    reveal: number;
    override: Slide | null;
  } | null>;
  selectedIds: number[];
  bookNumber: number | null;
  chapter: number | null;
  selectedVerses: number[];
  safePageIndex: number;
  pageCount: number;
  setPageIndex: Dispatch<SetStateAction<number>>;
  setRevealCount: Dispatch<SetStateAction<number>>;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
}) {
  // Taking over (0.5.10): once the adopted selection is in, restore its page, then its
  // reveal step and a Strong slide — called after the steps' reset effects, so it runs
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
    // deps as they were in Control, where the rule knew the ref and the setters as stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, bookNumber, chapter, selectedVerses, safePageIndex, pageCount]);
}
