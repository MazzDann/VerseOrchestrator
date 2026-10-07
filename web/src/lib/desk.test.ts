import { describe, expect, it } from 'vitest';
import { deskTokenOf, liveCountdown, mayPress, stepVerses } from './desk';
import { DEFAULT_STYLE, type Slide } from '../presenterBus';

describe('a desk link pasted on another computer (1.9.0-beta.1)', () => {
  it('finds the token in the address, its #… part or the code alone', () => {
    const token = 'a1B2c3D4e5F6g7H8i9J0k_-z';
    expect(deskTokenOf(`http://192.168.1.5:4747/desk#${token}`)).toBe(token);
    expect(deskTokenOf(`  /desk#${encodeURIComponent(token)} `)).toBe(token);
    expect(deskTokenOf(token)).toBe(token);
    // a phone's link gives its token too: the desk then says it is a phone's (useDeskHub)
    expect(deskTokenOf(`http://192.168.1.5:4747/remote#${token}`)).toBe(token);
  });

  it('says none for anything else', () => {
    for (const bad of [
      '',
      'http://192.168.1.5:4747/',
      'http://x/desk#',
      'short',
      '#%E0%A4%A',
      'a b c d e f g h',
    ])
      expect(deskTokenOf(bad)).toBeNull();
  });
});

describe("what a desk may press (the hub's checks, before the round trip)", () => {
  it("a button needs its own permission; what it carries needs that kind's", () => {
    const allowed = ['next', 'prev', 'blank', 'show', 'pick'] as const;
    expect(mayPress(allowed, 'next')).toBe(true);
    expect(mayPress(allowed, 'cover')).toBe(false);
    expect(mayPress(allowed, 'show', 'verses')).toBe(true);
    expect(mayPress(allowed, 'show', 'song')).toBe(false);
    expect(mayPress(allowed, 'show', 'item')).toBe(false);
    expect(mayPress([...allowed, 'playlist'], 'queue', 'verses')).toBe(true);
    expect(mayPress(['pick'], 'queue', 'verses')).toBe(false);
    expect(mayPress(['next'], 'show', 'verses')).toBe(false);
  });
});

describe('«Далі» over verses the desk put on screen', () => {
  const ch = [1, 2, 3, 4, 5, 6, 7];
  it("steps a block of as many verses, in the chapter's numbering", () => {
    expect(stepVerses(ch, [3], 1)).toEqual([4]);
    expect(stepVerses(ch, [3, 4], 1)).toEqual([5, 6]);
    expect(stepVerses(ch, [6, 7], -1)).toEqual([4, 5]);
    expect(stepVerses(ch, [2, 3], -1)).toEqual([1]); // what is left before
    expect(stepVerses(ch, [6, 7], 1)).toBeNull(); // the chapter's edge
    expect(stepVerses(ch, [1], -1)).toBeNull();
    expect(stepVerses([1, 2, 4, 5], [2], 1)).toEqual([4]); // a verse the translation lacks
    expect(stepVerses(ch, [9], 1)).toBeNull();
    expect(stepVerses(ch, [], 1)).toBeNull();
  });
});

describe('the countdown the viewers see', () => {
  const at = { until: 1_790_000_000_000, caption: 'Починаємо за' };
  const base: Slide = {
    lines: [],
    reference: '',
    blank: false,
    visible: true,
    style: DEFAULT_STYLE,
  };
  it('in a corner, or on «Заставка» — not a stray one without the cover', () => {
    expect(liveCountdown(null)).toBeNull();
    expect(liveCountdown({ ...base, cornerCountdown: at })).toBe(at);
    expect(liveCountdown({ ...base, cover: { text: '', image: null }, countdown: at })).toBe(at);
    expect(liveCountdown({ ...base, countdown: at })).toBeNull();
  });
});
