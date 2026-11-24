import { beforeEach, describe, expect, it, vi } from 'vitest';

const search = vi.fn();
vi.mock('../api', () => ({ api: { search: (...a: unknown[]) => search(...a) as unknown } }));
const { searchWide } = await import('./searchWide');

const none = { kind: 'text', results: [] };
const one = { kind: 'text', results: [{ translationId: 1 }] };

describe('searchWide (1.26.0-beta.2)', () => {
  beforeEach(() => search.mockReset());
  const answers = (...list: unknown[]) => list.forEach((x) => search.mockResolvedValueOnce(x));

  it('asks wider only when nothing is found', async () => {
    answers(one);
    expect(await searchWide('x', [1], { skip: ['A'] })).toMatchObject({ fallback: false });
    expect(search).toHaveBeenCalledTimes(1);
    answers(none, one);
    expect(await searchWide('x', [1], { skip: ['A'] })).toMatchObject({
      fallback: true,
      archive: false,
    });
  });
  it('the archived ones last, and it says so', async () => {
    answers(none, none, one);
    expect(await searchWide('x', [1], { skip: ['A'] })).toMatchObject({
      fallback: true,
      archive: true,
    });
    expect(search.mock.calls[2]).toEqual(['x', [], { skip: [] }]);
  });
  it('no archive: nothing more to ask', async () => {
    answers(none);
    expect(await searchWide('x', [], { skip: [] })).toMatchObject({ results: [], fallback: false });
    expect(search).toHaveBeenCalledTimes(1);
  });
  it('a page that doesn’t know the archive asks the server', async () => {
    answers(none, one);
    expect(await searchWide('x', [])).toMatchObject({ archive: true });
  });
  it('no vectors in one translation goes on to the others; no model doesn’t', async () => {
    answers({ ...none, kind: 'meaning', missing: 'vectors' }, one);
    expect(await searchWide('~ x', [1], { skip: [] })).toMatchObject({ fallback: true });
    search.mockReset();
    answers({ ...none, kind: 'meaning', missing: 'model' });
    expect(await searchWide('~ x', [1], { skip: ['A'] })).toMatchObject({ missing: 'model' });
    expect(search).toHaveBeenCalledTimes(1);
  });
});
