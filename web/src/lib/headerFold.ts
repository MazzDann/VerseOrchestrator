import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * The control window's header in a narrow window (Mac check of 1.4.1): at 750 px — half a
 * MacBook Air, or a 1366 px laptop snapped to one side — the header needed 940 px and «Заставка»,
 * «Налаштування вигляду», «Довідка», «Світла тема», «Панель показу» sat past the window's
 * edge, out of reach (the header neither scrolls nor wraps). Fixed breakpoints (80em / 70em)
 * can't know the real width: the labels change with the language, and a larger root font
 * grows everything (Mantine sizes are rem).
 *
 * So the header measures itself and gives way one step at a time, the least useful thing
 * first: the title; the text of «Вікно показу» and «Сховати текст»; the app zone into one «Ще»
 * menu; the search field and the «Наживо» caption; then the windows and the sources into «Ще»
 * too. The go-live zone («На екран», «Сховати текст», «Чорний екран», «Заставка») and the
 * navigation (the menu button, «Пошук») never fold; at the very end «На екран» keeps only its
 * icon and the gaps get tighter. The search field — the one way in since 1.8.12-beta.4 — goes
 * after the app zone (the 1.12.0 sweep: the bell «Сповіщення» tipped a 1300 px window into
 * hiding the field while settings, help and the theme stayed).
 */

/** Header zones that can fold into «Ще» — in toolbar order (vo-design §2). */
export type FoldZone = 'sources' | 'windows' | 'app';

/** What the header shows at one step. */
export interface HeaderFold {
  /** The «VerseOrchestrator» title is hidden. */
  noTitle: boolean;
  /** «Вікно показу» and «Сховати текст» show only their icons. */
  iconsOnly: boolean;
  /** The go-to field and the «Наживо» caption are hidden. */
  noGoTo: boolean;
  /** The zones in «Ще», in toolbar order. */
  folded: readonly FoldZone[];
  /** «На екран» keeps only its icon (still red, still one click). */
  projectIconOnly: boolean;
  /** Smaller side padding and gaps. */
  tight: boolean;
}

const NONE: HeaderFold = {
  noTitle: false,
  iconsOnly: false,
  noGoTo: false,
  folded: [],
  projectIconOnly: false,
  tight: false,
};

/** The zones fold in this order: the app first, the sources last. */
export const FOLD_ORDER: readonly FoldZone[] = ['app', 'windows', 'sources'];

const TOOLBAR_ORDER: readonly FoldZone[] = ['sources', 'windows', 'app'];

/** A zone into «Ще», with those folded before it (in toolbar order). */
const foldZone = (zone: FoldZone) => (f: HeaderFold) => ({
  folded: TOOLBAR_ORDER.filter((z) => z === zone || f.folded.includes(z)),
});

/** Each step adds one change to the step before it. */
const CHANGES: ((f: HeaderFold) => Partial<HeaderFold>)[] = [
  () => ({ noTitle: true }),
  () => ({ iconsOnly: true }),
  foldZone(FOLD_ORDER[0]),
  () => ({ noGoTo: true }),
  ...FOLD_ORDER.slice(1).map(foldZone),
  () => ({ projectIconOnly: true }),
  () => ({ tight: true }),
];

/** The steps, from everything shown (0) to everything folded that may fold. */
export const FOLD_STEPS: readonly HeaderFold[] = CHANGES.reduce<HeaderFold[]>(
  (steps, change) => {
    const last = steps[steps.length - 1];
    return [...steps, { ...last, ...change(last) }];
  },
  [NONE],
);

export const LAST_FOLD = FOLD_STEPS.length - 1;

/** Half a CSS pixel at the default root font: rounding, not overflow. */
const EPSILON = 0.5 / 16;

/**
 * The step to show next. `needs[i]` is the width the header's content took at step i when it
 * was last drawn (`undefined`: not drawn since the content changed), `available` the header's
 * own width — both in rem, so a larger root font doesn't make them stale. `step` must have
 * been measured.
 *
 * Too wide → the next step that fits or hasn't been tried; fits → the lightest step known to
 * fit, or one step lighter that hasn't been tried. A try that doesn't fit is remembered, so
 * the header settles after at most one extra step and never flips back and forth.
 */
export function nextFold(
  step: number,
  available: number,
  needs: readonly (number | undefined)[],
): number {
  const fits = (i: number) => needs[i] !== undefined && needs[i]! <= available + EPSILON;
  if (!fits(step)) {
    for (let i = step + 1; i <= LAST_FOLD; i++) if (needs[i] === undefined || fits(i)) return i;
    return LAST_FOLD;
  }
  let best = step;
  for (let i = step - 1; i >= 0; i--) {
    if (needs[i] === undefined) return i;
    if (!fits(i)) break;
    best = i;
  }
  return best;
}

/**
 * `needs` with `width` measured at `step` (rem). When the content took less there than it did
 * the last time, whatever made it narrower — a shorter label («Сховати текст» after «Показати
 * текст»), the web font arriving narrower than the fallback — may have made the lighter steps
 * fit too: every other width is dropped, so each gets one more try. Without it the header
 * stayed a step more folded than a fresh load for the rest of the session (review of the Mac
 * fix). A try that doesn't fit is drawn before the paint and remembered again, so no flipping.
 */
export function remember(
  needs: readonly (number | undefined)[],
  step: number,
  width: number,
): (number | undefined)[] {
  const before = needs[step];
  const next = before !== undefined && width < before - EPSILON ? [] : [...needs];
  next[step] = width;
  return next;
}

/** Width the element's content takes: its visible children, the gaps between them, its padding. */
function contentWidth(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const widths = [...el.children].map((c) => c.getBoundingClientRect().width).filter((w) => w > 0);
  const gap = parseFloat(style.columnGap) || 0;
  return (
    widths.reduce((a, b) => a + b, 0) +
    gap * Math.max(0, widths.length - 1) +
    (parseFloat(style.paddingLeft) || 0) +
    (parseFloat(style.paddingRight) || 0)
  );
}

/**
 * Folds the header to its real width. Put `ref` on the header row whose children are the
 * left and the right groups (they must not shrink: `flexShrink: 0`). `content` changes with
 * whatever changes the widths in ways a step can't know (the language, which controls exist):
 * the remembered widths are dropped then, when the root font changes (text doesn't scale
 * quite linearly) and when a web font has loaded (a step with no text in it — the last ones —
 * doesn't change size when Inter arrives, the lighter steps do). `step` is for the row's
 * `data-fold` (checks, debugging); `overflow`: even the last step is wider than the header
 * (a very large root font in a small window), the row scrolls sideways.
 */
export function useHeaderFold(content: string) {
  const [step, setStep] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const needs = useRef<(number | undefined)[]>([]);
  const stepRef = useRef(step);
  stepRef.current = step;
  const measuredWith = useRef({ content, rem: 0 });

  const check = useCallback((content?: string, afresh = false) => {
    const el = ref.current;
    if (!el) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const was = measuredWith.current;
    if (afresh || rem !== was.rem || (content !== undefined && content !== was.content)) {
      needs.current = [];
      measuredWith.current = { content: content ?? was.content, rem };
    }
    const current = stepRef.current;
    const available = el.clientWidth / rem;
    needs.current = remember(needs.current, current, contentWidth(el) / rem);
    const next = nextFold(current, available, needs.current);
    setOverflow(
      next === LAST_FOLD && current === LAST_FOLD && needs.current[current]! > available + EPSILON,
    );
    if (next !== current) setStep(next);
  }, []);

  // after each step is drawn, before the paint: no frame with buttons past the edge
  useLayoutEffect(() => check(content), [step, content, check]);

  // the window, the root font or the controls' own labels change size
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => check());
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  }, [check]);

  // a web font arrived (Inter, or another of its subsets): every step measures afresh
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!fonts?.addEventListener) return;
    const onFonts = () => check(undefined, true);
    fonts.addEventListener('loadingdone', onFonts);
    return () => fonts.removeEventListener('loadingdone', onFonts);
  }, [check]);

  return { fold: FOLD_STEPS[step], step, overflow, ref };
}
