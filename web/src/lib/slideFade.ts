import type { SlideTransition } from '../presenterBus';

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
  return { duration: 350, easing: 'ease-in-out' };
}
