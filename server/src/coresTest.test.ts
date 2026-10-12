import { describe, expect, it } from 'vitest';
import { coreCounts, createCoresTest, pickBest } from './coresTest.js';

describe('«Перевірити, скільки ядер найкраще»', () => {
  it('measures every count when there are few, fewer past 12', () => {
    expect(coreCounts(1)).toEqual([1]);
    expect(coreCounts(9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(coreCounts(31)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 31,
    ]);
  });

  it('takes the fewest cores within 5 % of the fastest', () => {
    // the M4 (measured)
    const m4 = [
      [2, 231],
      [3, 284],
      [4, 263],
      [5, 242],
      [6, 248],
      [8, 227],
      [10, 161],
    ].map(([threads, rate]) => ({ threads, rate }));
    expect(pickBest(m4)).toBe(3);
    expect(
      pickBest([
        { threads: 4, rate: 110 },
        { threads: 7, rate: 150 },
        { threads: 8, rate: 154 },
      ]),
    ).toBe(7);
    expect(pickBest([])).toBeNull();
  });

  it('runs each count in turn, keeps the best, stops when asked', async () => {
    let clock = 0;
    const speed: Record<number, number> = { 1: 100, 2: 190, 3: 200 };
    const opened: number[] = [];
    let released = 0;
    let best: number | null = null;
    const t = createCoresTest({
      open: async (n) => {
        opened.push(n);
        return {
          model: {} as never,
          embed: async (texts) => {
            clock += (texts.length / speed[n]) * 1000;
            return texts.map(() => new Int8Array(1));
          },
          release: async () => void released++,
        };
      },
      sample: () => Array.from({ length: 320 }, (_, i) => `v${i}`),
      onChange: () => undefined,
      onBest: (n) => (best = n),
      now: () => clock,
    });
    t.start(3);
    await new Promise((r) => setTimeout(r, 10));
    expect(t.state().phase).toBe('done');
    expect(t.state().results).toEqual([
      { threads: 1, rate: 100 },
      { threads: 2, rate: 190 },
      { threads: 3, rate: 200 },
    ]);
    expect(best).toBe(2);
    expect(opened).toEqual([1, 2, 3]);
    expect(released).toBe(3);
  });
});
