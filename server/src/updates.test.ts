import { describe, expect, it, vi } from 'vitest';
import {
  CHECK_EVERY_MS,
  channelFor,
  compareVersions,
  createUpdateChecker,
  parseVersion,
  pickLatest,
} from './updates';

/** GitHub's release list, as much of it as the checker reads. */
const release = (tag: string, over: Record<string, unknown> = {}) => ({
  tag_name: tag,
  html_url: `https://github.com/MazzDann/VerseOrchestrator/releases/tag/${tag}`,
  published_at: '2026-09-30T00:00:00Z',
  draft: false,
  prerelease: tag.startsWith('v0.'),
  assets: [
    {
      name: 'VerseOrchestrator-windows-x64.zip',
      browser_download_url: `https://dl/${tag}/w.zip`,
      size: 66_000_000,
    },
    { name: 'SHA256SUMS.txt', browser_download_url: `https://dl/${tag}/sums`, size: 300 },
  ],
  ...over,
});

const LIST = [
  release('v0.14.2'),
  release('v0.14.1'),
  release('v1.0.0', { prerelease: false }),
  release('v1.1.0', { draft: true }), // a draft is nobody's release yet
  release('nightly'),
  { broken: true },
];

describe('update check (1.0.0)', () => {
  it('reads and orders versions', () => {
    expect(parseVersion('v0.14.2')).toEqual([0, 14, 2]);
    expect(parseVersion('nightly')).toBeNull();
    expect(compareVersions('0.14.10', '0.14.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0);
    expect(compareVersions('v0.14.2', '0.14.2')).toBe(0);
  });

  it('a 0.x installation takes previews; 1.0.0 and later only regular releases', () => {
    expect(channelFor('0.14.3')).toBe('preview');
    expect(channelFor('1.0.0')).toBe('stable');
    const asset = 'VerseOrchestrator-windows-x64.zip';
    expect(pickLatest(LIST, 'stable', asset)?.version).toBe('1.0.0');
    expect(pickLatest([release('v0.14.2'), release('v0.14.1')], 'stable', asset)).toBeNull();
    const preview = pickLatest([release('v0.14.1'), release('v0.14.2')], 'preview', asset);
    expect(preview).toMatchObject({
      version: '0.14.2',
      prerelease: true,
      asset: { name: asset, url: 'https://dl/v0.14.2/w.zip', size: 66_000_000 },
    });
    // a release without this system's archive: known, but not installable by the app
    expect(pickLatest(LIST, 'stable', 'VerseOrchestrator-linux-arm64.tar.gz')?.asset).toBeNull();
    expect(pickLatest({ message: 'rate limited' }, 'stable', asset)).toBeNull();
  });

  const checker = (o: { current: string; enabled?: boolean; reply?: unknown; fail?: boolean }) => {
    let t = 1_000_000;
    const fetch = vi.fn(async () => {
      if (o.fail) throw new TypeError('fetch failed');
      // what GitHub lists today: two previews
      return Response.json(o.reply ?? [release('v0.14.2'), release('v0.14.1')]);
    });
    const c = createUpdateChecker({
      current: o.current,
      install: 'release',
      isEnabled: () => o.enabled ?? true,
      fetch: fetch as unknown as typeof globalThis.fetch,
      now: () => t,
      platform: 'win32',
      arch: 'x64',
    });
    return { c, fetch, later: (ms: number) => (t += ms) };
  };

  it('says whether a newer version is out, and asks GitHub again only after 12 hours', async () => {
    const { c, fetch, later } = checker({ current: '0.14.1' });
    const s = await c.check();
    expect(s).toMatchObject({ available: true, channel: 'preview', error: null });
    expect(s.latest?.version).toBe('0.14.2');
    await c.check();
    expect(fetch).toHaveBeenCalledTimes(1);
    later(CHECK_EVERY_MS);
    await c.check();
    expect(fetch).toHaveBeenCalledTimes(2);
    await c.check(true); // «Перевірити зараз»
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('the newest version itself is up to date; a preview install sees 1.0.0 once it is out', async () => {
    expect((await checker({ current: '0.14.2' }).c.check()).available).toBe(false);
    const s = await checker({ current: '0.14.2', reply: LIST }).c.check();
    expect(s).toMatchObject({ available: true, latest: { version: '1.0.0', prerelease: false } });
  });

  it('with the switch off it asks nothing unless asked to', async () => {
    const { c, fetch } = checker({ current: '0.14.1', enabled: false });
    expect(await c.check()).toMatchObject({ enabled: false, checkedAt: null, available: false });
    expect(fetch).not.toHaveBeenCalled();
    expect((await c.check(true)).available).toBe(true);
  });

  it('offline: says so and keeps working', async () => {
    const { c } = checker({ current: '0.14.1', fail: true });
    const s = await c.check();
    expect(s.available).toBe(false);
    expect(s.error).toMatch(/немає зв’язку з GitHub/);
    expect(s.checkedAt).not.toBeNull();
  });

  it('two questions at once share one request', async () => {
    const { c, fetch } = checker({ current: '0.14.1' });
    await Promise.all([c.check(true), c.check(true)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
