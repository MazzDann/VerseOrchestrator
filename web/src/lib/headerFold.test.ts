import { describe, expect, it } from 'vitest';
import { FOLD_ORDER, FOLD_STEPS, LAST_FOLD, nextFold, remember } from './headerFold';

/**
 * The header as the hook drives it: draw a step, measure it (`widths[step]`, what the content
 * takes there), ask `nextFold`, repeat until it stays. Returns the step it settles on and how
 * many steps were drawn on the way.
 */
function settle(widths: number[], available: number, from = 0, needs: (number | undefined)[] = []) {
  let step = from;
  let drawn = 1;
  for (;;) {
    needs = remember(needs, step, widths[step]);
    const next = nextFold(step, available, needs);
    if (next === step) return { step, drawn, needs };
    step = next;
    drawn++;
    if (drawn > 50) throw new Error('the header never settles');
  }
}

/** The lightest step whose content fits — what the header should show. */
const lightest = (widths: number[], available: number) => {
  const i = widths.findIndex((w) => w <= available);
  return i < 0 ? LAST_FOLD : i;
};

// a header's content per step, in rem — close to the ones measured live at 16 px (1474 px with
// everything shown; 750 px windows settle on step 5)
const WIDTHS = [92.1, 84, 76.5, 58.8, 53, 39.3, 31.5, 27.5, 26.3];

describe('header fold steps', () => {
  it('give way least useful first: title, text, go-to, then app, windows, sources', () => {
    expect(FOLD_STEPS).toHaveLength(WIDTHS.length);
    expect(FOLD_STEPS[0]).toEqual({
      noTitle: false,
      iconsOnly: false,
      noGoTo: false,
      folded: [],
      projectIconOnly: false,
      tight: false,
    });
    expect(FOLD_ORDER).toEqual(['app', 'windows', 'sources']);
    expect(FOLD_STEPS.map((f) => f.folded)).toEqual([
      [],
      [],
      [],
      [],
      ['app'],
      ['windows', 'app'],
      ['sources', 'windows', 'app'],
      ['sources', 'windows', 'app'],
      ['sources', 'windows', 'app'],
    ]);
    expect(FOLD_STEPS[1].noTitle && !FOLD_STEPS[1].iconsOnly).toBe(true);
    expect(FOLD_STEPS[2].iconsOnly && !FOLD_STEPS[2].noGoTo).toBe(true);
    expect(FOLD_STEPS[3].noGoTo && FOLD_STEPS[3].folded.length === 0).toBe(true);
    // «На екран» keeps its text until everything that may fold has folded
    expect(FOLD_STEPS.findIndex((f) => f.projectIconOnly)).toBe(7);
    expect(FOLD_STEPS[LAST_FOLD].tight).toBe(true);
  });

  it('each step keeps what the one before it changed', () => {
    for (let i = 1; i < FOLD_STEPS.length; i++) {
      const [a, b] = [FOLD_STEPS[i - 1], FOLD_STEPS[i]];
      for (const k of ['noTitle', 'iconsOnly', 'noGoTo', 'projectIconOnly', 'tight'] as const)
        expect(!a[k] || b[k]).toBe(true);
      expect(a.folded.every((z) => b.folded.includes(z))).toBe(true);
    }
  });
});

describe('nextFold', () => {
  it('folds one step at a time while the content is wider than the header', () => {
    expect(nextFold(0, 60, [92.1])).toBe(1);
    expect(nextFold(3, 50, [92.1, 84, 76.5, 58.8])).toBe(4);
  });

  it('skips steps already known not to fit', () => {
    // widened, then narrowed again: 4 and 5 were measured wider than 40
    expect(nextFold(3, 40, [92.1, 84, 76.5, 58.8, 53, 45])).toBe(6);
  });

  it('stays at the last step when even that is too wide', () => {
    expect(nextFold(LAST_FOLD, 20, WIDTHS)).toBe(LAST_FOLD);
    expect(nextFold(6, 20, WIDTHS)).toBe(LAST_FOLD);
  });

  it('unfolds to the lightest step known to fit when the window grows', () => {
    expect(nextFold(6, 100, WIDTHS)).toBe(0);
    expect(nextFold(6, 60, WIDTHS)).toBe(3);
    expect(nextFold(6, 58.8, WIDTHS)).toBe(3); // exactly fits
  });

  it('tries one step lighter it has not measured, but no further', () => {
    expect(nextFold(4, 100, [undefined, undefined, undefined, undefined, 53])).toBe(3);
    expect(nextFold(4, 100, [92.1, undefined, 76.5, 58.8, 53])).toBe(1);
  });

  it('keeps a step that fits when the lighter one is known too wide', () => {
    expect(nextFold(5, 50, WIDTHS)).toBe(5);
    expect(nextFold(0, 100, WIDTHS)).toBe(0);
  });

  it('forgives half a pixel of rounding', () => {
    expect(nextFold(3, 58.8 - 0.4 / 16, WIDTHS)).toBe(3);
    expect(nextFold(3, 58.8 - 1 / 16, WIDTHS)).toBe(4);
  });
});

describe('remember', () => {
  it('stores the width a step took', () => {
    expect(remember([], 2, 76.5)).toEqual([undefined, undefined, 76.5]);
    expect(remember([92.1, 84], 1, 84)).toEqual([92.1, 84]);
  });

  it('keeps the other widths when the step took as much or more', () => {
    expect(remember([92.1, 84, 76.5], 1, 86)).toEqual([92.1, 86, 76.5]);
    expect(remember([92.1, 84, 76.5], 1, 84 - 0.4 / 16)).toEqual([92.1, 84 - 0.4 / 16, 76.5]);
  });

  it('drops the other widths when the step took less: they may fit now', () => {
    expect(remember([92.1, 84, 76.5], 1, 83.5)).toEqual([undefined, 83.5]);
  });

  it('does not change the widths it was given', () => {
    const needs = [92.1, 84];
    remember(needs, 1, 80);
    remember(needs, 0, 95);
    expect(needs).toEqual([92.1, 84]);
  });
});

describe('the header settles', () => {
  // the brief's widths (px at 16 px root) and a few in between
  const widths = [1280, 1100, 960, 820, 750, 600, 480, 420, 300].map((px) => px / 16);

  it('on the lightest step that fits, from a fresh start', () => {
    for (const available of widths) {
      const { step, drawn } = settle(WIDTHS, available);
      expect(step).toBe(lightest(WIDTHS, available));
      expect(drawn).toBeLessThanOrEqual(FOLD_STEPS.length);
    }
  });

  it('on the right step after any resize, the widths remembered', () => {
    for (const from of widths) {
      const start = settle(WIDTHS, from);
      for (const to of widths) {
        const { step } = settle(WIDTHS, to, start.step, [...start.needs]);
        expect(step).toBe(lightest(WIDTHS, to));
      }
    }
  });

  it('in one jump once every step has been measured', () => {
    const known = [...WIDTHS];
    for (let from = 0; from <= LAST_FOLD; from++) {
      for (const to of widths) {
        const { step, drawn } = settle(WIDTHS, to, from, [...known]);
        expect(step).toBe(lightest(WIDTHS, to));
        expect(drawn).toBeLessThanOrEqual(2); // the step it was on, then the one it lands on
      }
    }
  });

  it('without flipping when a remembered width went stale (a longer label)', () => {
    // step 3 was 58.8 rem; the language changed and it needs 61 now — still remembered as 58.8
    const now = [...WIDTHS];
    now[3] = 61;
    const { step, drawn } = settle(now, 60, 4, [...WIDTHS]);
    expect(step).toBe(4); // tried 3 once, found it too wide, back to 4 for good
    expect(drawn).toBe(3);
  });

  it('back on a lighter step when the content got narrower («Показати текст» → «Сховати текст»)', () => {
    // 1480 px: everything fits with «Сховати текст» (92.1 rem), not with «Показати текст»,
    // 8 px wider (92.6), which folds the title away
    const available = 1480 / 16;
    const hidden = [...WIDTHS];
    hidden[0] = 92.6;
    hidden[1] = 84.5;
    const wider = settle(hidden, available);
    expect(wider.step).toBe(1);
    // B again: step 1 is 0.5 rem narrower — step 0 gets its try and stays
    const { step, drawn } = settle(WIDTHS, available, 1, [...wider.needs]);
    expect(step).toBe(0);
    expect(drawn).toBe(2);
  });

  it('back on a lighter step when the web font is narrower than the fallback', () => {
    // the fallback font made every text 6 % wider (steps 7 and 8 have none); at 1250 px the
    // header settled a step deeper than Inter needs
    const fallback = WIDTHS.map((w, i) => (i < 7 ? w * 1.06 : w));
    const available = 1250 / 16;
    const before = settle(fallback, available);
    expect(before.step).toBe(lightest(fallback, available));
    const { step } = settle(WIDTHS, available, before.step, [...before.needs]);
    expect(step).toBe(lightest(WIDTHS, available));
    expect(step).toBeLessThan(before.step);
  });

  it('without flipping when the content got narrower but the lighter step still does not fit', () => {
    const narrower = [...WIDTHS];
    narrower[5] = 39; // 0.3 rem less, step 4 still 53 — too wide for 45
    const start = settle(WIDTHS, 45);
    expect(start.step).toBe(5);
    const { step, drawn } = settle(narrower, 45, 5, [...start.needs]);
    expect(step).toBe(5); // tried 4 once, back to 5 for good
    expect(drawn).toBe(3);
  });
});
