import { describe, expect, it } from 'vitest';
import { parseAt, planSync } from './uiState';

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

  it('a damaged record of sync times counts as never synced (0.11.8)', () => {
    // a bare number there once threw on every start: nothing reached data/ any more
    expect(parseAt('1790661016913')).toEqual({});
    expect(parseAt('[1]')).toEqual({});
    expect(parseAt('not json')).toEqual({});
    expect(parseAt(null)).toEqual({});
    expect(parseAt('{"vo:settings":5,"vo:playlist":"x","other":1}')).toEqual({ 'vo:settings': 5 });
  });
});
