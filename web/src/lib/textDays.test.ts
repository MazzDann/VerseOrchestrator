import { describe, expect, it } from 'vitest';
import { dayGroups, dayKey } from './textDays';

describe('the own texts’ history by day (1.22.0-beta.3, F1107-18)', () => {
  const now = new Date(2026, 10, 14, 15, 30).getTime();
  const at = (d: number, h = 10) => new Date(2026, 10, d, h).getTime();
  it('says today, yesterday, a date, or earlier for one kept before the dates', () => {
    expect(dayKey(at(14, 0), now)).toBe('today');
    expect(dayKey(at(13, 23), now)).toBe('yesterday');
    expect(dayKey(at(9), now)).toBe('day:2026-11-09');
    expect(dayKey(new Date(2025, 11, 31, 12).getTime(), now)).toBe('day:2025-12-31');
    expect(dayKey(undefined, now)).toBe('earlier');
  });
  it('groups the list in its own order', () => {
    const list = [{ at: at(14) }, { at: at(14, 9) }, { at: at(13) }, { at: at(2) }, {}];
    expect(dayGroups(list, now).map((g) => [g.key, g.items.length])).toEqual([
      ['today', 2],
      ['yesterday', 1],
      ['day:2026-11-02', 1],
      ['earlier', 1],
    ]);
  });
});
