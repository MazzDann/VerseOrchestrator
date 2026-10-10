import type { SlideSource, SlideTransition } from '../presenterBus';

/**
 * How a slide change plays out (0.6.10) — the decisions of components/SlideFade.tsx, kept
 * pure for the tests. `shown` is the slide on screen (its key), `fadingOut` whether it is
 * leaving right now, `next` the slide asked for (null = nothing: blank / cleared).
 */
export type FadeStep =
  /** the slide asked for is the one shown (it may simply re-render) */
  | { do: 'keep' }
  /** nothing on screen (or fast / none): show `key` now (null = clear); it fades in by mode */
  | { do: 'show'; key: string | null }
  /** smooth: fade the shown slide out; when it's gone, the latest one comes in */
  | { do: 'fadeOut' }
  /** already fading out towards another slide: the latest one comes in when it's gone */
  | { do: 'wait' }
  /** the slide that is fading out was asked for again: bring it back from where it is */
  | { do: 'fadeBack' };

export function planSlideChange(
  shown: string | null,
  fadingOut: boolean,
  next: string | null,
  mode: SlideTransition | undefined,
): FadeStep {
  if (fadingOut) return next !== null && next === shown ? { do: 'fadeBack' } : { do: 'wait' };
  if (next === shown) return { do: 'keep' };
  if (shown === null || mode === 'fast' || mode === 'none') return { do: 'show', key: next };
  return { do: 'fadeOut' };
}

/** How far a slide or an added verse rises as it comes in («Наплив»): small, the plan's ≈0.3 em. */
export const RISE_LAYER = 'translateY(2.5cqh)';

/**
 * Timing per mode (the 0.6.7 values): `smooth` — out, then in, 0.35 s each, ease-in-out;
 * `fast` — out at once, in over 0.15 s, ease-out; `none` — no animation at all.
 */
export function fadeTiming(
  mode: SlideTransition | undefined,
  phase: 'in' | 'out',
): { duration: number; easing: string } | null {
  if (mode === 'none') return null;
  if (mode === 'fast') return phase === 'in' ? { duration: 150, easing: 'ease-out' } : null;
  // «Наплив» (1.13.0-beta.1): out quickly, in with a rise that settles
  if (mode === 'rise') {
    return phase === 'in'
      ? { duration: 350, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }
      : { duration: 180, easing: 'ease-in' };
  }
  return { duration: 350, easing: 'ease-in-out' };
}

/** The keyframes of a slide coming in: «Наплив» rises, the others only fade. */
export function inFrames(mode: SlideTransition | undefined): Keyframe[] {
  return mode === 'rise'
    ? [
        { opacity: 0, transform: RISE_LAYER },
        { opacity: 1, transform: 'none' },
      ]
    : [{ opacity: 0 }, { opacity: 1 }];
}

/**
 * A pick that grows on screen (1.13.0-beta.1, the user: «коли 4 додається, не переспавн, а як
 * слайд ін»): how long the added verses take to come in and the font to settle — `null` for
 * «Без анімації» (at once).
 */
export function growTiming(mode: SlideTransition | undefined): number | null {
  if (mode === 'none') return null;
  return mode === 'fast' ? 150 : 350;
}

/** The verses a verse slide shows: the page on screen when the selection has pages. */
export function shownVerses(src: SlideSource | null | undefined): number[] | null {
  if (!src || src.kind !== 'verses') return null;
  if (!src.shown) return src.verses;
  const [a, b] = src.shown;
  return src.verses.filter((v) => v >= a && v <= b);
}

/**
 * The verses `next` adds to `prev` when it shows all of them and more — the same passage
 * (translations, book, chapter) grown by a pick; `null` otherwise (another slide: it fades).
 */
export function addedVerses(
  prev: SlideSource | null | undefined,
  next: SlideSource | null | undefined,
): number[] | null {
  const a = shownVerses(prev);
  const b = shownVerses(next);
  if (!a || !b || prev?.kind !== 'verses' || next?.kind !== 'verses') return null;
  if (prev.bookNumber !== next.bookNumber || prev.chapter !== next.chapter) return null;
  if (prev.translationIds.join(',') !== next.translationIds.join(',')) return null;
  if (b.length <= a.length || a.length === 0 || !a.every((v) => b.includes(v))) return null;
  return b.filter((v) => !a.includes(v));
}

/**
 * A reveal step's fade (1.12.6, users' report F1010-12b: «Без анімації» changed the slides but
 * the lines of a progressive reveal still faded in): 0.25 s; «Швидкий» 0.15 s; «Без анімації»
 * none — the line is there at once.
 */
export function revealTransition(mode: SlideTransition | undefined): string | undefined {
  if (mode === 'none') return undefined;
  return mode === 'fast' ? 'opacity 0.15s ease-out' : 'opacity 0.25s ease';
}

/** The CSS animation of an added verse (styles.css `vo-rise-in`) by the mode; none = at once. */
export function riseAnimation(mode: SlideTransition | undefined): string | undefined {
  const ms = growTiming(mode);
  return ms == null ? undefined : `vo-rise-in ${ms}ms cubic-bezier(0.2, 0.7, 0.3, 1) both`;
}

/**
 * Where the words of a grown pick start on a phone or on «Сцена» (1.13.0-beta.1): they draw
 * the plain text, so an added verse is the text after the one shown — `null` when the new text
 * does not simply go on from the old (a verse added in the middle: the text just changes).
 */
export function grownCut(prev: string, next: string): number | null {
  return prev.length > 0 && next.length > prev.length && next.startsWith(prev) ? prev.length : null;
}
