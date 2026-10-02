import { describe, expect, it } from 'vitest';
import { formatRemaining, hubOffset, remainingMs, shiftUntil, untilAt, untilIn } from './countdown';

const at = (h: number, m: number, s = 0) => new Date(2026, 9, 1, h, m, s).getTime();

describe('a phone counts by the computer’s clock (1.7.3)', () => {
  it('takes the hub’s answer as halfway along the round trip', () => {
    // a phone 90 s behind the computer, 40 ms there and back
    const phone = 1_000_000;
    expect(hubOffset(phone, phone + 90_000 + 20, phone + 40)).toBe(90_000);
    // a phone ahead: a negative offset
    expect(hubOffset(phone, phone - 5_000 + 10, phone + 20)).toBe(-5_000);
    // the end the computer set, moved onto the phone's clock, leaves the same time to go
    const end = phone + 90_000 + 300_000; // five minutes from the computer's now
    expect(remainingMs(end - 90_000, phone)).toBe(300_000);
  });
});

describe('countdown', () => {
  it('shows the time left rounded up, never 0:00 while it runs', () => {
    expect(formatRemaining(300000)).toBe('5:00');
    expect(formatRemaining(299001)).toBe('5:00');
    expect(formatRemaining(299000)).toBe('4:59');
    expect(formatRemaining(1)).toBe('0:01');
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(-5)).toBe('0:00');
    expect(formatRemaining(12 * 60000)).toBe('12:00');
    expect(formatRemaining(3600000 + 5 * 60000 + 9000)).toBe('1:05:09');
  });

  it('counts to an end, not from a start', () => {
    expect(remainingMs(at(10, 0), at(9, 55))).toBe(300000);
    expect(remainingMs(at(10, 0), at(10, 1))).toBe(0);
  });

  it('starts whole minutes, 1 to 12 hours', () => {
    expect(untilIn(5, at(9, 0))).toBe(at(9, 5));
    expect(untilIn(0, at(9, 0))).toBe(at(9, 1));
    expect(untilIn(2.6, at(9, 0))).toBe(at(9, 3));
    expect(untilIn(10000, at(9, 0))).toBe(at(21, 0));
  });

  it('counts to a time of day: today, or tomorrow just past midnight', () => {
    expect(untilAt('10:00', at(9, 52))).toBe(at(10, 0));
    expect(untilAt(' 9:05 ', at(9, 0))).toBe(at(9, 5));
    expect(untilAt('00:10', at(23, 50))).toBe(new Date(2026, 9, 2, 0, 10).getTime());
    // later today, however far: an evening service set in the morning (review of #45)
    expect(untilAt('22:00', at(9, 0))).toBe(at(22, 0));
    // later today, however far: an evening service set in the morning (review of #45)
    expect(untilAt('22:00', at(9, 0))).toBe(at(22, 0));
    // already past today: no countdown to tomorrow's 10:00
    expect(untilAt('10:00', at(10, 1))).toBeNull();
    expect(untilAt('10:00', at(10, 0))).toBeNull();
    expect(untilAt('24:00', at(9, 0))).toBeNull();
    expect(untilAt('9:60', at(9, 0))).toBeNull();
    expect(untilAt('десята', at(9, 0))).toBeNull();
  });

  it('moves a running countdown by minutes, never into the past', () => {
    expect(shiftUntil(at(10, 0), 1, at(9, 55))).toBe(at(10, 1));
    expect(shiftUntil(at(10, 0), -1, at(9, 55))).toBe(at(9, 59));
    expect(shiftUntil(at(9, 55, 30), -1, at(9, 55))).toBe(at(9, 55));
    expect(shiftUntil(at(22, 0), 1, at(9, 0))).toBe(at(22, 1));
    // past the day cap already (a 25-hour day): +1 keeps the end, -1 takes a minute off
    const far = at(9, 0) + 24 * 3600_000 + 15 * 60_000;
    expect(shiftUntil(far, 1, at(9, 0))).toBe(far);
    expect(shiftUntil(far, -1, at(9, 0))).toBe(far - 60_000);
    expect(shiftUntil(new Date(2026, 9, 2, 8, 59).getTime(), 5, at(9, 0))).toBe(
      new Date(2026, 9, 2, 9, 0).getTime(),
    );
  });
});
