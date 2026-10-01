import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  devLabelOf,
  probeServer,
  shownVersion,
  useServer,
  versionHeading,
  versionText,
} from './serverStore';

const health = (body: object) => vi.fn(async () => Response.json(body));

describe('a dev copy says it is one (2026-10-01)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useServer.setState({ available: null, devLabel: null });
  });

  it('takes the label only when it is not the version', () => {
    expect(devLabelOf({ ok: true, version: '1.4.2', label: 'dev 1.4.2.try7 (x · abc1234)' })).toBe(
      'dev 1.4.2.try7 (x · abc1234)',
    );
    expect(devLabelOf({ ok: true, version: '1.4.2', label: '1.4.2' })).toBeNull();
    // a server before the label
    expect(devLabelOf({ ok: true, version: '1.4.2' })).toBeNull();
    expect(devLabelOf(null)).toBeNull();
  });

  it('the health check keeps it for the settings panel', async () => {
    vi.stubGlobal(
      'fetch',
      health({ ok: true, version: '1.4.2', label: 'dev 1.4.2 (main · d4961e3)' }),
    );
    expect(await probeServer()).toBe(true);
    expect(useServer.getState()).toMatchObject({
      available: true,
      devLabel: 'dev 1.4.2 (main · d4961e3)',
    });
  });

  it('a release: no label; no server: not available, nothing else changed', async () => {
    vi.stubGlobal('fetch', health({ ok: true, version: '1.4.2', label: '1.4.2' }));
    await probeServer();
    expect(useServer.getState()).toMatchObject({ available: true, devLabel: null });
    useServer.setState({ devLabel: 'dev 1.4.2' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await probeServer()).toBe(false);
    expect(useServer.getState()).toMatchObject({ available: false, devLabel: 'dev 1.4.2' });
  });

  it('«Оновлення» brackets the version: the label inside it without brackets of its own', () => {
    expect(shownVersion('dev 1.4.2.try7 (mac-test · 20dd850)', '1.4.2')).toBe(
      'dev 1.4.2.try7, mac-test · 20dd850',
    );
    expect(shownVersion('dev 1.4.2 (feat/mac-dev-version · d4961e3+)', '1.4.2')).toBe(
      'dev 1.4.2, feat/mac-dev-version · d4961e3+',
    );
    // no git to ask: nothing to flatten; a release: its version
    expect(shownVersion('dev 1.4.2', '1.4.2')).toBe('dev 1.4.2');
    expect(shownVersion(null, '1.4.2')).toBe('1.4.2');
  });

  it('the top of the settings: a release by name and version, a checkout by its label', () => {
    expect(versionHeading(null, '1.4.5')).toBe('VerseOrchestrator 1.4.5');
    expect(versionHeading('dev 1.4.4.try3 (feat/x · abc1234)', '1.4.4')).toBe(
      'dev 1.4.4.try3 (feat/x · abc1234)',
    );
    // «Версія …» under the browser choice: the number alone, or the label
    expect(versionText(null, '1.4.5')).toBe('1.4.5');
    expect(versionText('dev 1.4.4.try3 (feat/x · abc1234+)', '1.4.4')).toBe(
      'dev 1.4.4.try3 (feat/x · abc1234+)',
    );
  });
});
