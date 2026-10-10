import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  devLabelOf,
  lookAgain,
  probe,
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

describe('a server not up yet is looked for again (1.12.5)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    useServer.setState({ available: null, devLabel: null, lost: false });
  });

  /** fetch answering from a list: 'down' throws, 'proxy' is the dev proxy's 502, 'html' a static host */
  const answers = (list: ('up' | 'down' | 'proxy' | 'html' | '404')[]) => {
    let i = 0;
    return vi.fn(async () => {
      const a = list[Math.min(i++, list.length - 1)];
      if (a === 'down') throw new TypeError('Failed to fetch');
      if (a === 'proxy') return new Response('Bad Gateway', { status: 502 });
      if (a === 'html') return new Response('<!doctype html>', { status: 200 });
      if (a === '404') return new Response('Not found', { status: 404 });
      return Response.json({ ok: true, version: '1.12.5' });
    });
  };
  /** a window and a document to hear `online`, `focus` and `visibilitychange` */
  const page = () => {
    const win = Object.assign(new EventTarget(), {
      setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
      clearInterval: (t: ReturnType<typeof setInterval>) => clearInterval(t),
    });
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', doc);
    return { win, doc };
  };

  it('tells the app’s server, no server here, and no answer yet apart', async () => {
    vi.stubGlobal('fetch', answers(['up']));
    expect(await probe()).toBe('up');
    expect(useServer.getState()).toMatchObject({ available: true, lost: false });
    for (const [a, found] of [
      ['down', 'unreachable'],
      ['proxy', 'unreachable'],
      ['html', 'absent'],
      ['404', 'absent'],
    ] as const) {
      vi.stubGlobal('fetch', answers([a]));
      expect(await probe()).toBe(found);
    }
  });

  it('every 2 s for a minute: the reads ask the server meanwhile; once it answers, onBack', async () => {
    vi.useFakeTimers();
    page();
    vi.stubGlobal('fetch', answers(['down', 'proxy', 'up']));
    const back = vi.fn();
    lookAgain(back);
    expect(useServer.getState()).toMatchObject({ available: null, lost: true });
    await vi.advanceTimersByTimeAsync(4000);
    expect(back).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(back).toHaveBeenCalledTimes(1);
    expect(useServer.getState()).toMatchObject({ available: true, lost: false });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('after the minute the browser’s library; the server back online or in sight is found', async () => {
    vi.useFakeTimers();
    const { win, doc } = page();
    const fetch = answers(['down']);
    vi.stubGlobal('fetch', fetch);
    const back = vi.fn();
    lookAgain(back, { everyMs: 2000, forMs: 10_000 });
    await vi.advanceTimersByTimeAsync(12_000);
    expect(useServer.getState()).toMatchObject({ available: false, lost: true });
    const asked = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch.mock.calls.length).toBe(asked); // no more polling
    // a hidden window doesn't ask; back in sight it does
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(10);
    expect(fetch.mock.calls.length).toBe(asked);
    vi.stubGlobal('fetch', answers(['up']));
    doc.visibilityState = 'visible';
    win.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10);
    expect(back).toHaveBeenCalledTimes(1);
    expect(useServer.getState()).toMatchObject({ available: true, lost: false });
  });

  it('an address that turns out to have no server stops the looking', async () => {
    vi.useFakeTimers();
    page();
    const fetch = answers(['down', 'html']);
    vi.stubGlobal('fetch', fetch);
    const back = vi.fn();
    lookAgain(back);
    await vi.advanceTimersByTimeAsync(4000);
    expect(useServer.getState()).toMatchObject({ available: false, lost: false });
    const asked = fetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetch.mock.calls.length).toBe(asked);
    expect(back).not.toHaveBeenCalled();
  });
});
