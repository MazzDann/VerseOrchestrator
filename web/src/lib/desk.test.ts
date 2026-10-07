import { describe, expect, it } from 'vitest';
import { deskTokenOf } from './desk';

describe('a desk link pasted on another computer (1.9.0-beta.1)', () => {
  it('finds the token in the address, its #… part or the code alone', () => {
    const token = 'a1B2c3D4e5F6g7H8i9J0k_-z';
    expect(deskTokenOf(`http://192.168.1.5:4747/desk#${token}`)).toBe(token);
    expect(deskTokenOf(`  /desk#${encodeURIComponent(token)} `)).toBe(token);
    expect(deskTokenOf(token)).toBe(token);
    // a phone's link works too: the hub goes by the token
    expect(deskTokenOf(`http://192.168.1.5:4747/remote#${token}`)).toBe(token);
  });

  it('says none for anything else', () => {
    for (const bad of [
      '',
      'http://192.168.1.5:4747/',
      'http://x/desk#',
      'short',
      '#%E0%A4%A',
      'a b c d e f g h',
    ])
      expect(deskTokenOf(bad)).toBeNull();
  });
});
