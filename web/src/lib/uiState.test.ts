import { describe, expect, it } from 'vitest';
import { planSync } from './uiState';

describe('UI state sync (0.7.4)', () => {
  const remote = (value: string, at: number) => ({ value, at });

  it('a first start after the update moves the browser’s settings into data/', () => {
    expect(planSync('{"a":1}', 0, undefined)).toBe('push');
  });

  it('another address, or the browser data cleared: takes what data/ has', () => {
    expect(planSync(null, 0, remote('{"a":1}', 1000))).toBe('take');
    // a copy this browser never synced (its own defaults) gives way to data/
    expect(planSync('{"a":0}', 0, remote('{"a":1}', 1000))).toBe('take');
  });

  it('the newer side wins; equal copies stay as they are', () => {
    expect(planSync('{"a":2}', 2000, remote('{"a":1}', 1000))).toBe('push'); // changed offline here
    expect(planSync('{"a":1}', 1000, remote('{"a":3}', 3000))).toBe('take'); // saved elsewhere later
    expect(planSync('{"a":1}', 1000, remote('{"a":1}', 1000))).toBe('none');
    expect(planSync('{"a":1}', 500, remote('{"a":1}', 1000))).toBe('none'); // same text
    expect(planSync(null, 0, undefined)).toBe('none');
  });
});
