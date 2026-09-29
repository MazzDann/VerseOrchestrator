import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_LIBRARY } from '@vo/shared';
import { api, ApiFailure } from './api';

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
