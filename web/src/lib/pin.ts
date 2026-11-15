import { useCallback, useMemo, useRef, useState } from 'react';
import type { Slide } from '../presenterBus';
import { isSlide } from './bus';
import { pinFrom, pinnedView, pinnedWords } from './slide';
import type { PinSide } from './outputs';

/**
 * A pinned «Показ» window (1.23.0-beta.1, F1107-11b — the users: «кілька екранів показу …
 * обирати які закріплені»; the author: each window its own content). The control window sends
 * `{ do: 'pin', on }` (lib/outputs.ts); the window keeps the slide it shows at that moment (under
 * a black screen or «Заставка», `pinFrom`) and stops following the show, except for «Чорний
 * екран» / «Заставка» (lib/slide.ts `pinnedView`).
 * The state lives in the window, not in a control window: a takeover or a second control window
 * changes nothing, and the window's own reload keeps it (sessionStorage — this window only).
 */
const KEY = 'vo:pinned';

function readPinned(): Slide | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s: unknown = JSON.parse(raw);
    return isSlide(s) ? s : null;
  } catch {
    return null;
  }
}

function savePinned(s: Slide | null): void {
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    // too big for this window's storage (a large background): pinned until a reload only
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* no storage */
    }
  }
}

export interface PinnedSlide {
  /** what this window draws */
  shown: Slide;
  /** the slide it is pinned to, null = following */
  pinned: Slide | null;
  /** for useAnnounceOutput: the words announced, and the command's target */
  side: PinSide;
}

/** For a «Показ» page: `live` = the show's slide from the bus. */
export function usePinnedSlide(live: Slide): PinnedSlide {
  const [pinned, setPinned] = useState<Slide | null>(readPinned);
  const liveRef = useRef(live);
  liveRef.current = live;
  const set = useCallback((on: boolean) => {
    setPinned((was) => {
      // pinning again keeps the slide it holds; it takes what it shows when it was following
      const next = on ? (was ?? pinFrom(liveRef.current)) : null;
      if (next !== was) savePinned(next);
      return next;
    });
  }, []);
  const words = pinned ? pinnedWords(pinned) : null;
  const side = useMemo(() => ({ pinned: words, set }), [words, set]);
  // one object per change: a black over the pinned slide is a new one, and the page's effects
  // and SlideCanvas see `shown` (the review)
  const shown = useMemo(() => (pinned ? pinnedView(pinned, live) : live), [pinned, live]);
  return { shown, pinned, side };
}
