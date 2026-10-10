import { describe, expect, it } from 'vitest';
import { walkStep } from './pickWalk';

describe('«Далі» through a collected pick (1.13.0-beta.1)', () => {
  const walk = { key: 'k', verses: [16, 17, 18, 20] };

  it('all together, then one by one, skipping what was not picked, then on as usual', () => {
    expect(walkStep(walk, [16, 17, 18, 20], 1)).toEqual([16]);
    expect(walkStep(walk, [16], 1)).toEqual([17]);
    expect(walkStep(walk, [18], 1)).toEqual([20]);
    expect(walkStep(walk, [20], 1)).toBeNull();
  });

  it('back: one by one, then the whole pick again', () => {
    expect(walkStep(walk, [20], -1)).toEqual([18]);
    expect(walkStep(walk, [16], -1)).toEqual([16, 17, 18, 20]);
    expect(walkStep(walk, [16, 17, 18, 20], -1)).toBeNull();
  });

  it('a selection outside the pick ends the walk', () => {
    expect(walkStep(walk, [19], 1)).toBeNull();
    expect(walkStep(walk, [16, 17], 1)).toBeNull();
  });
});
