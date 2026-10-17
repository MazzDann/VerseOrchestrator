import { describe, expect, it } from 'vitest';
import { fetchImage, fetchableUrl, nameFromUrl, sharedImageOf } from './imageFetch';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
/** a fake fetch: each address its answer */
const site =
  (pages: Record<string, { type: string; body: Buffer | string; status?: number }>) =>
  async (url: string | URL | Request): Promise<Response> => {
    const href = String(url);
    const p = pages[href];
    if (!p) return new Response('no', { status: 404 });
    const res = new Response(p.body, {
      status: p.status ?? 200,
      headers: { 'content-type': p.type },
    });
    Object.defineProperty(res, 'url', { value: href });
    return res;
  };

describe('a picture from the internet (1.19.0-beta.3, F1017-16)', () => {
  it('takes http(s) addresses only', () => {
    expect(fetchableUrl('https://example.org/a.png')?.href).toBe('https://example.org/a.png');
    expect(fetchableUrl('  http://example.org/a.png ')).not.toBeNull();
    expect(fetchableUrl('file:///C:/a.png')).toBeNull();
    expect(fetchableUrl('javascript:alert(1)')).toBeNull();
    expect(fetchableUrl('https://user:pw@example.org/a.png')).toBeNull();
    expect(fetchableUrl('not an address')).toBeNull();
  });
  it('names the picture after its file', () => {
    expect(nameFromUrl(new URL('https://x.org/p/%D0%97%D0%B0%D1%85%D1%96%D0%B4.jpg?w=8'))).toBe(
      'Захід.jpg',
    );
    expect(nameFromUrl(new URL('https://x.org/'))).toBe('Зображення');
    expect(nameFromUrl(new URL('https://x.org/a%2Fb%3A.png'))).toBe('ab.png');
  });
  it('finds a page’s shared picture', () => {
    const base = new URL('https://x.org/post/1');
    expect(sharedImageOf('<meta property="og:image" content="/i/big.jpg?a=1&amp;b=2">', base)).toBe(
      'https://x.org/i/big.jpg?a=1&b=2',
    );
    expect(sharedImageOf(`<meta content='https://cdn.x/t.png' name='twitter:image'>`, base)).toBe(
      'https://cdn.x/t.png',
    );
    expect(sharedImageOf('<p>no picture</p>', base)).toBeNull();
  });
  it('fetches a picture as it came', async () => {
    const r = await fetchImage('https://x.org/a/sun.png', {
      fetchImpl: site({ 'https://x.org/a/sun.png': { type: 'image/png', body: PNG } }),
    });
    expect(r).toMatchObject({ type: 'image/png', name: 'sun.png' });
    expect('bytes' in r && r.bytes.equals(PNG)).toBe(true);
  });
  it('a page: its og:image, once', async () => {
    const r = await fetchImage('https://x.org/post', {
      fetchImpl: site({
        'https://x.org/post': {
          type: 'text/html; charset=utf-8',
          body: '<head><meta property="og:image" content="https://x.org/big.png"></head>',
        },
        'https://x.org/big.png': { type: 'image/png', body: PNG },
      }),
    });
    expect(r).toMatchObject({ type: 'image/png', name: 'big.png' });
    const loop = await fetchImage('https://x.org/p1', {
      fetchImpl: site({
        'https://x.org/p1': { type: 'text/html', body: '<meta property="og:image" content="/p2">' },
        'https://x.org/p2': { type: 'text/html', body: '<meta property="og:image" content="/p1">' },
      }),
    });
    expect(loop).toEqual({ refused: 'type' });
  });
  it('refuses what is not a picture, too big, or not there', async () => {
    const fetchImpl = site({
      'https://x.org/a.pdf': { type: 'application/pdf', body: 'x' },
      'https://x.org/big.png': { type: 'image/png', body: Buffer.alloc(64) },
      'https://x.org/gone.png': { type: 'image/png', body: '', status: 410 },
    });
    expect(await fetchImage('https://x.org/a.pdf', { fetchImpl })).toEqual({ refused: 'type' });
    expect(await fetchImage('https://x.org/big.png', { fetchImpl, limit: 32 })).toEqual({
      refused: 'size',
    });
    expect(await fetchImage('https://x.org/gone.png', { fetchImpl })).toEqual({
      refused: 'failed',
      status: 410,
    });
    expect(await fetchImage('ftp://x.org/a.png', { fetchImpl })).toEqual({ refused: 'address' });
    const down = async () => {
      throw new Error('ECONNREFUSED');
    };
    expect(await fetchImage('https://x.org/a.png', { fetchImpl: down })).toEqual({
      refused: 'failed',
    });
  });
});
