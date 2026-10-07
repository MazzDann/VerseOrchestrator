import { describe, expect, it } from 'vitest';
import { clockWords, placeWords, stageLook, STAGE_TEXT_MAX } from './stage';

describe('«Сцена» settings (1.9.0-beta.11)', () => {
  it('reads sound values, defaults for anything else', () => {
    expect(stageLook({})).toEqual({
      layout: 'text',
      textSize: 'md',
      showNext: true,
      clockSeconds: true,
      theme: 'dark',
      showOrder: true,
      showPlace: true,
    });
    const odd = {
      stageLayout: 'grid',
      stageTextSize: 'huge',
      stageTheme: 'blue',
      stageShowNext: 'no',
    };
    expect(stageLook(odd as never)).toMatchObject({
      layout: 'text',
      textSize: 'md',
      theme: 'dark',
      showNext: true,
    });
    expect(
      stageLook({ stageLayout: 'slides', stageTheme: 'light', stageShowOrder: false }),
    ).toMatchObject({
      layout: 'slides',
      theme: 'light',
      showOrder: false,
    });
    expect(STAGE_TEXT_MAX.sm).toBeLessThan(STAGE_TEXT_MAX.xl);
  });
});

describe('where the screen is', () => {
  const verses = {
    kind: 'verses' as const,
    translationIds: [1],
    bookNumber: 500,
    chapter: 3,
    page: 0,
    reveal: 1,
  };
  it('a verse, a range, a stanza, a photo — of their total', () => {
    expect(placeWords({ ...verses, verses: [16], total: 36 })).toBe('вірш 16 з 36');
    expect(placeWords({ ...verses, verses: [16, 17, 18], total: 36 })).toBe('вірші 16–18 з 36');
    expect(placeWords({ kind: 'song', songId: 5, stanza: 2, total: 5 })).toBe('строфа 3 з 5');
    expect(placeWords({ kind: 'album', albumId: 'a', index: 3, name: 'x.jpg', total: 20 })).toBe(
      'фото 4 з 20',
    );
  });
  it('a selection with pages says the page on screen (review)', () => {
    expect(
      placeWords({ ...verses, verses: [1, 2, 3, 4, 5, 6, 7, 8], shown: [1, 4], total: 36 }),
    ).toBe('вірші 1–4 з 36');
    expect(
      placeWords({ ...verses, verses: [1, 2, 3, 4, 5, 6, 7, 8], shown: [5, 5], total: 36 }),
    ).toBe('вірш 5 з 36');
  });
  it('nothing without a total, a video, or no source', () => {
    expect(placeWords({ ...verses, verses: [16] })).toBe('');
    expect(placeWords({ kind: 'video', videoId: 'v' })).toBe('');
    expect(placeWords(undefined)).toBe('');
  });
  it('the clock with or without seconds', () => {
    const t = new Date(2026, 9, 7, 9, 5, 3);
    expect(clockWords(t, true)).toBe('09:05:03');
    expect(clockWords(t, false)).toBe('09:05');
  });
});

describe('a message from another day (review)', () => {
  it('does not come back with a cold start', async () => {
    const { freshMessage } = await import('../pages/control/useLivePipeline');
    const now = 1_790_000_000_000;
    expect(freshMessage({ text: 'Голосніше', at: now - 60_000 }, now)).toEqual({
      text: 'Голосніше',
      at: now - 60_000,
    });
    expect(freshMessage({ text: 'Голосніше', at: now - 7 * 3600_000 }, now)).toBeNull();
    expect(freshMessage({ text: 'Голосніше', at: Number.NaN }, now)).toBeNull();
    expect(freshMessage(null, now)).toBeNull();
  });
});
