import { describe, expect, it } from 'vitest';
import { type SeqCountdown } from '../playlistStore';
import { type Slide } from '../presenterBus';
import { countdownLabel, itemCountdown, lengthText, zeroIn, zeroWords } from './countdownItem';

const item: SeqCountdown = {
  kind: 'countdown',
  id: 'c',
  label: '',
  seconds: 300,
  caption: 'Починаємо за',
  atZero: 'next',
};
const on = (until: number, extra: object = {}): Slide =>
  ({
    lines: [],
    reference: '',
    blank: false,
    visible: true,
    cover: { text: '', image: null },
    countdown: { until, caption: 'Починаємо за', item: 'c', ...extra },
  }) as Slide;

describe('a «Відлік» item (1.10.0-beta.3)', () => {
  it('names itself by its length and words; holds 0:00 when the order goes on at zero', () => {
    expect(lengthText(300)).toBe('5:00');
    expect(lengthText(3905)).toBe('1:05:05');
    expect(countdownLabel(300, 'Починаємо за')).toBe('Відлік 5:00 · Починаємо за');
    expect(itemCountdown(item, 1000)).toMatchObject({
      until: 301000,
      afterZero: 'stop',
      item: 'c',
    });
    expect(itemCountdown({ ...item, atZero: 'overtime' }, 0).afterZero).toBe('overtime');
  });

  it('its zero: in so many ms; none when paused, another countdown, or long past', () => {
    expect(zeroIn(item, on(10000), 4000)).toBe(6000);
    expect(zeroIn(item, on(10000), 12000)).toBe(0); // just past: now
    expect(zeroIn(item, on(10000), 16000)).toBeNull(); // > 5 s ago: no jump out of the blue
    expect(zeroIn(item, on(10000, { pausedLeft: 3000 }), 4000)).toBeNull();
    // a «Відлік» started by hand with the same words: not the item's (review)
    expect(zeroIn(item, on(10000, { item: undefined }), 4000)).toBeNull();
    // the armed timer firing late (a hidden window): still goes
    expect(zeroIn(item, on(10000), 12000, true)).toBe(0); // the armed timer a little late: go
    expect(zeroIn(item, on(10000), 70000, true)).toBeNull(); // a minute late: the computer slept
    expect(zeroIn({ ...item, atZero: 'stop' }, on(10000), 4000)).toBeNull();
  });
});

describe('zeroWords (1.11.0-beta.4: what follows a «Відлік» item on «Сцена»)', () => {
  it('the next item by name, the end of the order, or what the time does', () => {
    expect(zeroWords('next', 'Оголошення')).toBe('далі: Оголошення');
    expect(zeroWords('next', null)).toBe('далі: кінець послідовності');
    expect(zeroWords('overtime', 'x')).toBe('далі: рахує в мінус');
    expect(zeroWords('stop', 'x')).toBe('далі: зупиниться на 0:00');
    expect(zeroWords('hide', 'x')).toBe('далі: час зникне');
    expect(zeroWords(undefined, 'x')).toBe('далі: зупиниться на 0:00');
  });
});
