import { describe, expect, it } from 'vitest';
import type { RebuildState, SemanticState } from '../api';
import { worksOf } from './backgroundWork';

// «Фонова робота» (1.25.0-beta.1): what the ring's tooltip says, and how far
describe('worksOf', () => {
  const idle = { phase: 'idle' } as const;
  const sem = (over: Partial<SemanticState>) =>
    ({ models: [], job: { ...idle, current: null }, ...over }) as unknown as SemanticState;
  it('nothing under way: nothing shown', () => {
    expect(worksOf(sem({}), { ...idle, step: 0, total: 0 } as unknown as RebuildState)).toEqual([]);
    expect(worksOf(undefined, undefined)).toEqual([]);
  });
  it('the songs’ vectors and a rebuild, each with how far', () => {
    const w = worksOf(
      sem({
        songs: {
          phase: 'running',
          model: 'fast',
          done: 50,
          total: 200,
          startedAt: 1,
          rate: 9,
          error: null,
        },
      }),
      { phase: 'running', step: 3, total: 4 } as unknown as RebuildState,
    );
    expect(w.map((x) => x.part)).toEqual([0.75, 0.25]);
    expect(w[1].text).toMatch(/50 з 200/);
  });
  it('a cores test has no count', () => {
    const w = worksOf(
      sem({
        coresTest: {
          phase: 'running',
          current: null,
          total: 0,
          results: [],
          best: null,
          error: null,
        },
      }),
      undefined,
    );
    expect(w).toEqual([{ text: expect.stringMatching(/ядра/), part: null }]);
  });
});
