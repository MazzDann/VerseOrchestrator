import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_LIBRARY } from '@vo/shared';
import { api, ApiFailure, DEFAULT_LAUNCH } from './api';

describe('a refused request keeps what the server said (0.13.1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('no library yet: status 503 and the key the control window recognises', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ error: NO_LIBRARY, key: NO_LIBRARY }, { status: 503 })),
    );
    const err = await api.translations().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect(err).toMatchObject({ status: 503, key: NO_LIBRARY });
  });

  it('a server that answers with no JSON still gives a status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad gateway', { status: 502 })),
    );
    const err = await api.translations().catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, key: undefined });
  });
});

describe('the server settings carry the browser choice (2026-10-01)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const body = (launch: unknown) => ({
    version: 1,
    remotes: { persist: true },
    updates: { check: true },
    launch,
  });

  it('reads «Відкривати вікно керування в…» as the server keeps it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(body({ browser: 'brave', appWindow: true }))),
    );
    expect((await api.serverSettings()).launch).toEqual({ browser: 'brave', appWindow: true });
  });

  it('an older server or a garbled value: «Браузер системи»', async () => {
    for (const launch of [undefined, { browser: 7 }, 'brave']) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json(body(launch))),
      );
      expect((await api.serverSettings()).launch).toEqual(DEFAULT_LAUNCH);
    }
  });
});

describe('«Відкрити в {browser} зараз» (2026-10-01)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the server, as the control window, to open this page’s origin', async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true, browser: 'Zen' }));
    vi.stubGlobal('fetch', fetch);
    expect(await api.openControlWindow('http://localhost:4747')).toEqual({
      ok: true,
      browser: 'Zen',
    });
    expect(fetch).toHaveBeenCalledWith('/api/control-window/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-VO-Control': '1' },
      body: JSON.stringify({ origin: 'http://localhost:4747' }),
    });
  });

  it('the browser gone: the server’s words, in the page’s language, and the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            error: 'Zen на цьому комп’ютері більше немає — виберіть інший браузер.',
            key: '{browser} на цьому комп’ютері більше немає — виберіть інший браузер.',
            vars: { browser: 'Zen' },
          },
          { status: 404 },
        ),
      ),
    );
    const err = await api.openControlWindow('http://localhost:4747').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiFailure);
    expect(err).toMatchObject({
      status: 404,
      message: 'Zen на цьому комп’ютері більше немає — виберіть інший браузер.',
    });
  });

  it('asks whether a handover token is still good', async () => {
    const fetch = vi.fn(async () => Response.json({ valid: true }));
    vi.stubGlobal('fetch', fetch);
    expect(await api.checkHandover('tok')).toEqual({ valid: true });
    expect(fetch).toHaveBeenCalledWith(
      '/api/control-window/handover',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'tok' }) }),
    );
  });
});
