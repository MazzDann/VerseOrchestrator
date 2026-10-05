import { useEffect, useRef, type MutableRefObject } from 'react';
import { type Verse } from '../../api';
import { type RefItem } from '../../settingsStore';
import { opensAtTop, type OpenPlace } from '../../lib/bookPick';

/** The verse list's scroll (a jump's target, a new chapter's top) and the history (E13–E15). */
export function useVerseListEffects({
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
}: {
  scrollTarget: number | null;
  setScrollTarget: (verse: number | null) => void;
  primaryVerses: Verse[];
  focusJump: MutableRefObject<boolean>;
  bookNumber: number | null;
  chapter: number | null;
  reference: string;
  referenceShort: string;
  primaryId: number | null;
  selectedVerses: number[];
  pushHistory: (item: RefItem) => void;
}) {
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
    // deps as they were in Control, where the rule knew the ref and the setter as stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return { verseViewport };
}
