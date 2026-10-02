import { describe, expect, it } from 'vitest';
import {
  encodeLogo,
  isHeic,
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

/** An `ftyp` box: its size, the major brand, a minor version, the compatible brands. */
function ftyp(major: string, ...compatible: string[]): Uint8Array {
  const size = 16 + 4 * compatible.length;
  const b = new Uint8Array(size + 8);
  new DataView(b.buffer).setUint32(0, size);
  const put = (at: number, s: string) => [...s].forEach((c, i) => (b[at + i] = c.charCodeAt(0)));
  put(4, 'ftyp');
  put(8, major);
  compatible.forEach((c, i) => put(16 + 4 * i, c));
  put(size + 4, 'meta'); // the next box
  return b;
}

describe('an iPhone photo the browser can’t open is told apart (1.7.0)', () => {
  it('knows HEIC/HEIF by its brands, not AVIF', () => {
    expect(isHeic(ftyp('heic', 'mif1', 'heic'))).toBe(true);
    expect(isHeic(ftyp('mif1', 'heic'))).toBe(true);
    expect(isHeic(ftyp('heix'))).toBe(true);
    expect(isHeic(ftyp('mif1'))).toBe(true);
    // AVIF is HEIF's container too, but the browser reads it
    expect(isHeic(ftyp('avif', 'mif1', 'miaf'))).toBe(false);
    expect(isHeic(ftyp('mif1', 'avif'))).toBe(false);
    // other ISO files: a video, and not a box at all
    expect(isHeic(ftyp('isom', 'mp41'))).toBe(false);
    expect(isHeic(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(false);
    expect(isHeic(new Uint8Array(0))).toBe(false);
  });
});

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
