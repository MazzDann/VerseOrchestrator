import { describe, expect, it } from 'vitest';
import { compareVersions, versionToNotice } from './updates';
import type { UpdateState } from '../api';

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

describe('a step down and the running order (1.9.1)', () => {
  const item = (kind: string) => ({ kind, id: kind, label: kind }) as never;
  it('names the kinds an older version fails on', async () => {
    const { kindsBreaking } = await import('./updates');
    const order = [item('passage'), item('album'), item('video'), item('foreign')];
    expect(kindsBreaking('1.9.0', [order])).toEqual(['foreign']);
    expect(kindsBreaking('1.8.12-beta.1', [order])).toEqual(['video', 'foreign']);
    expect(kindsBreaking('1.8.12-beta.2', [[item('video')], [item('album')]])).toEqual(['video']);
    expect(kindsBreaking('1.8.11', [[item('image'), item('album')]])).toEqual(['album']);
    expect(kindsBreaking('1.4.2', [[item('image'), item('song')]])).toEqual(['image']);
    // 1.9.1 and later pass over a kind they don't know
    expect(kindsBreaking('1.9.1', [order])).toEqual([]);
    expect(kindsBreaking('1.10.0-beta.1', [order])).toEqual([]);
  });
});

describe('«Заставка» items and a step down (1.10.0-beta.2)', () => {
  it('a version before 1.9.1 fails on them; 1.9.1 and later pass over', async () => {
    const { kindsBreaking } = await import('./updates');
    const cover = { kind: 'cover', id: 'c', label: 'c' } as never;
    expect(kindsBreaking('1.9.0', [[cover]])).toEqual(['cover']);
    expect(kindsBreaking('1.9.10', [[cover]])).toEqual([]);
  });
});

describe('a new version said at the start (1.23.0-beta.5, F1114-03)', () => {
  const st = (over: Partial<UpdateState> = {}): UpdateState =>
    ({
      current: '1.22.1',
      channel: 'stable',
      install: 'release',
      enabled: true,
      checkedAt: 1,
      latest: { version: '1.23.0', url: '', publishedAt: '', prerelease: false, asset: null },
      available: true,
      error: null,
      ...over,
    }) as UpdateState;
  it('offers the newer version of a release copy once its server has looked', () => {
    expect(versionToNotice(st(), null)).toBe('1.23.0');
    expect(versionToNotice(st({ checkedAt: null }), null)).toBeNull(); // not looked yet: wait
    expect(versionToNotice(st({ available: false }), null)).toBeNull();
  });
  it('not a version chosen on purpose, a copy of the repository, or one said already', () => {
    expect(versionToNotice(st({ pinned: true }), null)).toBeNull();
    expect(versionToNotice(st({ install: 'source' }), null)).toBeNull();
    expect(versionToNotice(st(), '1.23.0')).toBeNull();
    expect(versionToNotice(st(), '1.22.9')).toBe('1.23.0'); // a newer one than the one said
  });
});
