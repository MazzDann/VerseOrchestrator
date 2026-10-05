import { describe, expect, it } from 'vitest';
import { beepPlan } from './countdownSound';

describe('the last seconds aloud (1.8.5)', () => {
  it('plans 5, 4, 3, 2, 1 and the longer one at zero', () => {
    expect(beepPlan(10_000)).toEqual([
      { at: 5000, zero: false },
      { at: 6000, zero: false },
      { at: 7000, zero: false },
      { at: 8000, zero: false },
      { at: 9000, zero: false },
      { at: 10_000, zero: true },
    ]);
  });

  it('inside the count: only what is still ahead, a moment late still sounds', () => {
    expect(beepPlan(2_500)).toEqual([
      { at: 500, zero: false },
      { at: 1500, zero: false },
      { at: 2500, zero: true },
    ]);
    expect(beepPlan(2_900)[0]).toEqual({ at: 0, zero: false }); // 3 s left, 0.1 s ago
    expect(beepPlan(-100)).toEqual([{ at: 0, zero: true }]);
  });

  it('long past zero: nothing', () => {
    expect(beepPlan(-2_000)).toEqual([]);
  });
});
