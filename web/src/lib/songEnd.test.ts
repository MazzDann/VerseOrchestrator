import { describe, expect, it } from 'vitest';
import { END_GUARD_MS, believedHidden, songEndStep } from './songEnd';

const at = { atLast: true, onScreen: true, canHide: true };

describe('songEndStep', () => {
  it('«Далі» on the last stanza hides the text, then says the song is over', () => {
    expect(songEndStep({ ...at, hidden: false, delta: 1 })).toBe('hide');
    expect(songEndStep({ ...at, hidden: true, delta: 1 })).toBe('end');
  });
  it('«Назад» brings the hidden stanza back, else walks back as usual', () => {
    expect(songEndStep({ ...at, hidden: true, delta: -1 })).toBe('show');
    expect(songEndStep({ ...at, hidden: false, delta: -1 })).toBe('walk');
  });
  it('walks as before away from the end, off screen, or without the right to hide', () => {
    expect(songEndStep({ ...at, atLast: false, hidden: false, delta: 1 })).toBe('walk');
    expect(songEndStep({ ...at, onScreen: false, hidden: false, delta: 1 })).toBe('walk');
    expect(songEndStep({ ...at, canHide: false, hidden: false, delta: 1 })).toBe('walk');
  });
});

describe('believedHidden', () => {
  const guard = { key: '7:4', at: 1000, hidden: true };
  it('trusts its own press for a moment, then the screen', () => {
    expect(believedHidden(guard, '7:4', 1000 + END_GUARD_MS - 1, false)).toBe(true);
    expect(believedHidden(guard, '7:4', 1000 + END_GUARD_MS, false)).toBe(false);
  });
  it('another stanza, or no press yet: the screen', () => {
    expect(believedHidden(guard, '7:3', 1100, false)).toBe(false);
    expect(believedHidden(null, '7:4', 1100, true)).toBe(true);
  });
});
