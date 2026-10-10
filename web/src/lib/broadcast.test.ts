import { describe, expect, it } from 'vitest';
import { EMPTY_SLIDE } from '../presenterBus';
import { sanitizeBroadcast } from '../settingsStore';
import { broadcastUrl, wordsOf } from './broadcast';

describe('«Трансляція» (1.14.0-beta.3)', () => {
  it('its address carries the look; a strange one falls back to the defaults', () => {
    expect(broadcastUrl('http://localhost:4747', { look: 'lower', bg: 'green', band: false })).toBe(
      'http://localhost:4747/key?look=lower&bg=green&band=0',
    );
    expect(sanitizeBroadcast({ look: 'x', bg: 'pink', band: undefined })).toEqual({
      look: 'lower',
      bg: 'transparent',
      band: true,
    });
  });

  it('only words go into the lower third', () => {
    const words = {
      ...EMPTY_SLIDE,
      visible: true,
      lines: [{ translationAbbr: '', text: 'Слово', rtl: false }],
    };
    expect(wordsOf(words)).toBe(true);
    expect(wordsOf({ ...words, blank: true })).toBe(false);
    expect(
      wordsOf({ ...words, picture: { src: '/x', small: '/x', name: 'x', fit: 'contain' } }),
    ).toBe(false);
    expect(wordsOf({ ...words, qr: 'http://x' })).toBe(false);
  });
});
