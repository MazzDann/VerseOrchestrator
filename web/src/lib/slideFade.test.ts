import { describe, expect, it } from 'vitest';
import { fadeTiming, planSlideChange, revealTransition } from './slideFade';

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
