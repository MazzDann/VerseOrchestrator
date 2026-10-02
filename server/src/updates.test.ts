import { describe, expect, it, vi } from 'vitest';
import {
  CHECK_EVERY_MS,
  channelFor,
  compareVersions,
  createUpdateChecker,
  isQuiet,
  parseVersion,
  pickLatest,
  pickReleases,
  pinFor,
  pinForSwap,
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
      sums: 'https://dl/v0.14.2/sums',
    });
    // a release without this system's archive: known, but not installable by the app
    expect(pickLatest(LIST, 'stable', 'VerseOrchestrator-linux-arm64.tar.gz')?.asset).toBeNull();
    expect(pickLatest({ message: 'rate limited' }, 'stable', asset)).toBeNull();
  });

  it('lists every release of the channel, newest first, each once — the dropdown (1.6.2)', () => {
    const asset = 'VerseOrchestrator-windows-x64.zip';
    const list = [
      release('v1.5.0', { prerelease: false }),
      release('v1.6.1', { prerelease: false }),
      release('v1.6.0', { prerelease: false }),
      release('v1.6.1', { prerelease: false, html_url: 'twice' }), // the same tag again
      release('v1.7.0', { draft: true }),
      release('v1.3.1', { prerelease: false, assets: [] }), // no archive for this system
      ...LIST,
    ];
    const all = pickReleases(list, 'stable', asset);
    expect(all.map((r) => r.version)).toEqual(['1.6.1', '1.6.0', '1.5.0', '1.3.1', '1.0.0']);
    expect(all[0].url).not.toBe('twice');
    expect(all.find((r) => r.version === '1.3.1')).toMatchObject({ asset: null, sums: null });
    expect(pickLatest(list, 'stable', asset)?.version).toBe('1.6.1');
    expect(pickReleases({ message: 'rate limited' }, 'stable', asset)).toEqual([]);
  });

  it('an older version chosen over the newest keeps quiet about it — until a newer one (1.6.3)', () => {
    // the dropdown or «Повернути версію» to 1.6.3 while 1.7.0 is the newest: a pin
    expect(pinFor('1.6.3', '1.7.0')).toEqual({ version: '1.6.3', skip: '1.7.0' });
    // the newest itself («Поточний реліз», an update), or the newest unknown: none
    expect(pinFor('1.7.0', '1.7.0')).toBeNull();
    expect(pinFor('1.6.3', null)).toBeNull();
    const pin = pinFor('1.6.3', '1.7.0')!;
    expect(isQuiet(pin, '1.6.3', '1.7.0')).toBe(true);
    // a release newer than the one skipped is news again
    expect(isQuiet(pin, '1.6.3', '1.7.1')).toBe(false);
    // another version runs (the swap failed, or an update by hand): the pin isn't its own
    expect(isQuiet(pin, '1.6.1', '1.7.0')).toBe(false);
    expect(isQuiet(undefined, '1.6.3', '1.7.0')).toBe(false);
    expect(isQuiet(pin, '1.6.3', null)).toBe(false);
  });

  it('a swap pins what the operator chose over — not a release out since (1.6.3)', () => {
    const swap = (kind: 'update' | 'rollback', from: string, to: string, known: string | null) =>
      pinForSwap({ kind, from, to, known });
    // an update to the newest: none — also when 1.7.1 came out between the download and the
    // restart (known is the newest when the download began)
    expect(swap('update', '1.6.3', '1.7.0', '1.7.0')).toBeNull();
    // an older or a newer-but-not-newest version picked in the list: chosen over the newest then
    expect(swap('update', '1.6.1', '1.6.0', '1.7.0')).toEqual({ version: '1.6.0', skip: '1.7.0' });
    expect(swap('update', '1.6.1', '1.6.3', '1.7.0')).toEqual({ version: '1.6.3', skip: '1.7.0' });
    // what a rollback that didn't finish left in app.next (no newest recorded): over the one left
    expect(swap('update', '1.7.0', '1.6.3', null)).toEqual({ version: '1.6.3', skip: '1.7.0' });
    // «Повернути версію» down: over the newest known, or offline over the one left
    expect(swap('rollback', '1.7.0', '1.6.3', '1.7.1')).toEqual({
      version: '1.6.3',
      skip: '1.7.1',
    });
    expect(swap('rollback', '1.7.0', '1.6.3', null)).toEqual({ version: '1.6.3', skip: '1.7.0' });
    // …and up, undoing a step down: nothing chosen over anything
    expect(swap('rollback', '1.6.3', '1.7.0', '1.7.1')).toBeNull();
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
