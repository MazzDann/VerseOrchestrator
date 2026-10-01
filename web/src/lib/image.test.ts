import { describe, expect, it } from 'vitest';
import {
  encodeLogo,
  LOGO_MAX_CHARS,
  LOGO_MAX_SIDE,
  LOGO_MIN_SIDE,
  type LogoEncoder,
} from './image';

/**
 * A stand-in for the canvas: a data URL whose length grows with the area, like an encoder's
 * (characters per pixel at the given type), and a log of what was asked.
 */
function fakeEncoder(perPixel: { png: number; jpeg: number }) {
  const calls: string[] = [];
  const enc: LogoEncoder = {
    encode(side, type) {
      calls.push(`${type === 'image/png' ? 'png' : 'jpeg'}@${side}`);
      const n = Math.round(side * side * (type === 'image/png' ? perPixel.png : perPixel.jpeg));
      return `data:${type};base64,${'A'.repeat(n)}`;
    },
  };
  return { enc, calls };
}

const original = (chars: number) => `data:image/png;base64,${'A'.repeat(chars)}`;

describe('how a logo is stored (1.4.1)', () => {
  it('keeps a file that already fits as it is', () => {
    const { enc, calls } = fakeEncoder({ png: 1, jpeg: 1 });
    const file = original(40_000);
    expect(encodeLogo(1200, file, true, enc)).toBe(file);
    expect(calls).toEqual([]);
  });

  it('draws a large flat logo at 1600 px as PNG — crisp on a Retina output', () => {
    // flat artwork: ~0.06 characters per pixel as PNG (a 1600×1600 logo ≈ 150 K)
    const { enc, calls } = fakeEncoder({ png: 0.06, jpeg: 0.1 });
    const url = encodeLogo(2400, original(900_000), false, enc);
    expect(url.startsWith('data:image/png')).toBe(true);
    expect(calls).toEqual([`png@${LOGO_MAX_SIDE}`]);
  });

  it('stores an opaque photo as JPEG — a PNG of it took up to 1.3 M characters in 1.4.0', () => {
    // a photo: ~0.9 characters per pixel as PNG, ~0.14 as JPEG 0.85 (measured on the Mac)
    const { enc, calls } = fakeEncoder({ png: 0.9, jpeg: 0.14 });
    const url = encodeLogo(3000, original(3_000_000), false, enc);
    expect(url.startsWith('data:image/jpeg')).toBe(true);
    expect(url.length).toBeLessThanOrEqual(LOGO_MAX_CHARS);
    expect(calls).toEqual(['png@1600', 'jpeg@1600']);
  });

  it('shrinks what still does not fit, and never tries PNG again for an opaque one', () => {
    const { enc, calls } = fakeEncoder({ png: 0.9, jpeg: 0.25 });
    const url = encodeLogo(3000, original(3_000_000), false, enc);
    expect(url.length).toBeLessThanOrEqual(LOGO_MAX_CHARS);
    expect(calls).toEqual(['png@1600', 'jpeg@1600', 'jpeg@1200']);
  });

  it('keeps a transparent logo PNG (a JPEG would turn its background black), smaller', () => {
    const { enc, calls } = fakeEncoder({ png: 1.2, jpeg: 0.1 });
    const url = encodeLogo(2000, original(2_000_000), true, enc);
    expect(url.startsWith('data:image/png')).toBe(true);
    expect(url.length).toBeLessThanOrEqual(LOGO_MAX_CHARS);
    expect(calls.every((c) => c.startsWith('png@'))).toBe(true);
    expect(calls[0]).toBe('png@1600');
  });

  it('re-encodes a small file that is too heavy, at its own size', () => {
    const { enc, calls } = fakeEncoder({ png: 1.3, jpeg: 0.14 });
    const url = encodeLogo(1000, original(1_300_000), false, enc);
    expect(url.startsWith('data:image/jpeg')).toBe(true);
    expect(calls).toEqual(['png@1000', 'jpeg@1000']);
  });

  it('stops at the smallest size, whatever it weighs', () => {
    const { enc, calls } = fakeEncoder({ png: 10, jpeg: 10 });
    encodeLogo(5000, original(9_000_000), true, enc);
    expect(calls.at(-1)).toBe(`png@${LOGO_MIN_SIDE}`);
    expect(calls.length).toBeLessThan(10);
  });
});
