import { describe, it, expect } from 'vitest';
import { mixHex } from './color';

describe('mixHex', () => {
  it('returns the base at t=0 and the accent at t=1', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
  });

  it('blends halfway at t=0.5', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    // white base tinted toward red → a pink-ish tint, not pure red
    expect(mixHex('#ffffff', '#ff0000', 0.5)).toBe('#ff8080');
  });

  it('accepts 3-digit hex and a leading-hashless form', () => {
    expect(mixHex('#fff', '000', 0.5)).toBe('#808080');
  });

  it('clamps t and falls back to the accent for non-hex input', () => {
    expect(mixHex('#000000', '#ffffff', 2)).toBe('#ffffff');
    expect(mixHex('not-a-colour', '#ff6b6b', 0.5)).toBe('#ff6b6b');
  });
});
