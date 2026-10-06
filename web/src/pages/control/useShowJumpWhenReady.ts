import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { type UseQueryResult } from '@tanstack/react-query';
import { type Verse } from '../../api';
import { type Appearance } from '../../settingsStore';
import { type SlideLine } from '../../presenterBus';
import { placeKey, showStep } from '../../lib/quickRef';

/**
 * E21 (vo-search): a place typed and sent with «На екран» goes on screen once it is the selection
 * and its verses are in. Called after the reset effects of the page (E6) and the reveal (E16).
 */
export function useShowJumpWhenReady({
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
}: {
  showJump: MutableRefObject<{ key: string; timer: number } | null>;
  bookNumber: number | null;
  chapter: number | null;
  selectedVerses: number[];
  verseQueries: UseQueryResult<Verse[]>[];
  slideLines: SlideLine[];
  safePageIndex: number;
  appearance: Appearance;
  revealCount: number;
  setPageIndex: Dispatch<SetStateAction<number>>;
  setRevealCount: Dispatch<SetStateAction<number>>;
  sendAndNotify: () => void;
}) {
  // «На екран» in the typed-number box (showJump, set by quickJump): show the place once it
  // is the selection and every translation's verses are in — from its first page and reveal
  // step (quickJump sets both with the selection; called after their reset effects, so it
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
}
