import { describe, expect, it } from 'vitest';
import { compareVersions } from './updates';

// the same order as server/src/updates.ts compareVersions (its tests: «reads and orders betas»)
describe('versions in the page (1.8.11)', () => {
  it('orders releases and betas as the server does', () => {
    const sorted = [
      '1.8.12',
      '1.8.12-beta.10',
      '1.8.11',
      '1.8.12-beta.2',
      '1.8.12-beta',
      '1.8.13-beta.1',
    ];
    expect([...sorted].sort(compareVersions)).toEqual([
      '1.8.11',
      '1.8.12-beta',
      '1.8.12-beta.2',
      '1.8.12-beta.10',
      '1.8.12',
      '1.8.13-beta.1',
    ]);
    expect(compareVersions('1.8.12-alpha.1', '1.8.12-beta.1')).toBeLessThan(0);
    expect(compareVersions('1.8.12-1', '1.8.12-beta')).toBeLessThan(0);
    expect(compareVersions('v1.8.12-beta.1', ' 1.8.12-beta.1 ')).toBe(0);
    expect(compareVersions('0.14.10', '0.14.9')).toBeGreaterThan(0);
    expect(compareVersions('nightly', '1.0.0')).toBeLessThan(0);
    expect(compareVersions('nightly', 'latest')).toBe(0);
  });
});
