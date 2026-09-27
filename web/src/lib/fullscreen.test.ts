import { describe, expect, it } from 'vitest';
import { FULLSCREEN_MSG, isFullscreenWire } from './fullscreen';

describe('fullscreen requests between windows', () => {
  it('recognises only its own message shape', () => {
    expect(isFullscreenWire({ t: FULLSCREEN_MSG, on: true })).toBe(true);
    expect(isFullscreenWire({ t: FULLSCREEN_MSG, on: 'yes' })).toBe(false);
    expect(isFullscreenWire({ t: 'win', on: true })).toBe(false);
    expect(isFullscreenWire('vo-fullscreen')).toBe(false);
    expect(isFullscreenWire(null)).toBe(false);
  });
});
