import { describe, expect, it } from 'vitest';
import {
  addedVerses,
  fadeTiming,
  growTiming,
  grownCut,
  inFrames,
  planSlideChange,
  revealTransition,
  riseAnimation,
} from './slideFade';

describe('slide change plan', () => {
  it('shows the first slide at once (it fades in by mode)', () => {
    expect(planSlideChange(null, false, 'A', 'smooth')).toEqual({ do: 'show', key: 'A' });
    expect(planSlideChange(null, false, null, 'smooth')).toEqual({ do: 'keep' });
  });

  it('smooth: the shown slide fades out first; blank fades out too', () => {
    expect(planSlideChange('A', false, 'B', 'smooth')).toEqual({ do: 'fadeOut' });
    expect(planSlideChange('A', false, 'B', undefined)).toEqual({ do: 'fadeOut' });
    expect(planSlideChange('A', false, null, 'smooth')).toEqual({ do: 'fadeOut' });
  });

  it('fast / none: swap at once', () => {
    expect(planSlideChange('A', false, 'B', 'fast')).toEqual({ do: 'show', key: 'B' });
    expect(planSlideChange('A', false, null, 'none')).toEqual({ do: 'show', key: null });
  });

  it('while fading out: later slides wait (the latest wins), the same one comes back', () => {
    expect(planSlideChange('A', true, 'C', 'smooth')).toEqual({ do: 'wait' });
    expect(planSlideChange('A', true, null, 'smooth')).toEqual({ do: 'wait' });
    expect(planSlideChange('A', true, 'A', 'smooth')).toEqual({ do: 'fadeBack' });
  });

  it('the same slide again is kept (it just re-renders)', () => {
    expect(planSlideChange('A', false, 'A', 'none')).toEqual({ do: 'keep' });
  });

  it('timing per mode', () => {
    expect(fadeTiming('smooth', 'out')).toEqual({ duration: 350, easing: 'ease-in-out' });
    expect(fadeTiming(undefined, 'in')).toEqual({ duration: 350, easing: 'ease-in-out' });
    expect(fadeTiming('fast', 'out')).toBeNull();
    expect(fadeTiming('fast', 'in')).toEqual({ duration: 150, easing: 'ease-out' });
    expect(fadeTiming('none', 'in')).toBeNull();
  });
});

describe('a reveal step follows «Перехід між слайдами» (1.12.6, F1010-12b)', () => {
  it('fades by the mode, and «Без анімації» not at all', () => {
    expect(revealTransition(undefined)).toBe('opacity 0.25s ease');
    expect(revealTransition('smooth')).toBe('opacity 0.25s ease');
    expect(revealTransition('fast')).toBe('opacity 0.15s ease-out');
    expect(revealTransition('none')).toBeUndefined();
  });
});

describe('«Наплив» and a pick that grows (1.13.0-beta.1)', () => {
  const src = (
    verses: number[],
    more: Partial<{ ids: number[]; ch: number; shown: [number, number] }> = {},
  ) =>
    ({
      kind: 'verses',
      translationIds: more.ids ?? [1],
      bookNumber: 43,
      chapter: more.ch ?? 3,
      verses,
      page: 0,
      reveal: 1,
      shown: more.shown,
    }) as const;

  it('«Наплив» fades out quickly and rises in', () => {
    expect(fadeTiming('rise', 'out')?.duration).toBe(180);
    expect(fadeTiming('rise', 'in')?.duration).toBe(350);
    expect(planSlideChange('A', false, 'B', 'rise')).toEqual({ do: 'fadeOut' });
    expect(inFrames('rise')[0]).toMatchObject({ opacity: 0, transform: expect.any(String) });
    expect(inFrames('smooth')).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });

  it('the added verses of a grown pick; anything else is another slide', () => {
    expect(addedVerses(src([16, 17]), src([16, 17, 18]))).toEqual([18]);
    expect(addedVerses(src([16, 18]), src([16, 17, 18, 20]))).toEqual([17, 20]);
    expect(addedVerses(src([16, 17]), src([16, 17]))).toBeNull();
    expect(addedVerses(src([16, 17]), src([17, 18]))).toBeNull();
    expect(addedVerses(src([16]), src([16, 17], { ch: 4 }))).toBeNull();
    expect(addedVerses(src([16]), src([16, 17], { ids: [1, 2] }))).toBeNull();
    expect(addedVerses(null, src([16, 17]))).toBeNull();
    // pages: what each page shows
    expect(
      addedVerses(src([1, 2, 3, 4], { shown: [3, 4] }), src([1, 2, 3, 4, 5], { shown: [3, 5] })),
    ).toEqual([5]);
  });

  it('the added verse comes in by the mode, at once without animation', () => {
    expect(growTiming('smooth')).toBe(350);
    expect(growTiming('fast')).toBe(150);
    expect(growTiming('rise')).toBe(350);
    expect(growTiming('none')).toBeNull();
    expect(riseAnimation('none')).toBeUndefined();
    expect(riseAnimation('fast')).toContain('150ms');
  });
});

describe('the words of a grown pick on phones and «Сцена» (1.13.0-beta.1)', () => {
  it('cut where the old text ends, when the new one goes on from it', () => {
    expect(grownCut('16 Бо так', '16 Бо так 17 Бо не')).toBe('16 Бо так'.length);
    expect(grownCut('Бо так', 'Бо так')).toBeNull();
    expect(grownCut('Бо так', '16 Бо так 17 Бо не')).toBeNull();
    expect(grownCut('', 'Бо так')).toBeNull();
  });
});
