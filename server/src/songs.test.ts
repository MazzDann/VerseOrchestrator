import { describe, expect, it } from 'vitest';
import { parseSongImport } from './songs';

const style = {
  bg: '#000000',
  color: '#ffffff',
  font: 'Arial',
  bold: false,
  align: 'center',
  x: 5,
  y: 10,
  w: 90,
  h: 80,
  size: 6.5,
};
const song = (over: Record<string, unknown> = {}) => ({
  key: '12. Світло',
  number: 12,
  title: 'Світло',
  slides: [
    { text: 'Світло', style: null },
    { text: 'Перший куплет', style },
  ],
  ...over,
});
/** The status and message a bad body is refused with. */
const refusal = (body: unknown) => {
  try {
    parseSongImport(body);
  } catch (e) {
    return { status: (e as { status?: number }).status, message: (e as Error).message };
  }
  return null;
};

describe('a song import body (0.10.1)', () => {
  it('takes a bundle id or a trimmed name for a new bundle', () => {
    const byId = parseSongImport({ target: { id: 'b1' }, songs: [song()] });
    expect(byId.target).toEqual({ id: 'b1' });
    expect(byId.songs).toEqual([song()]);
    const byName = parseSongImport({ target: { name: '  Молодіжні ' }, songs: [song()] });
    expect(byName.target).toEqual({ name: 'Молодіжні' });
  });

  it('keeps a song without a number and drops fields it does not know', () => {
    const r = parseSongImport({
      target: { id: 'b1' },
      songs: [song({ key: 'Без номера', number: null, title: 'Без номера', extra: 1 })],
    });
    expect(r.songs[0]).toEqual({
      key: 'Без номера',
      number: null,
      title: 'Без номера',
      slides: song().slides,
    });
  });

  it('refuses what the browser reader never sends, with a 400 in words', () => {
    const cases: [unknown, string][] = [
      [{ songs: [song()] }, 'вкажіть бандл'],
      [{ target: { name: '   ' }, songs: [song()] }, 'вкажіть бандл'],
      [{ target: { id: 'b1' }, songs: [] }, 'немає пісень'],
      [{ target: { id: 'b1' }, songs: Array(5001).fill(song()) }, 'забагато'],
      [{ target: { id: 'b1' }, songs: [song({ key: ' ' })] }, 'без назви файлу'],
      [{ target: { id: 'b1' }, songs: [song({ number: -1 })] }, 'номер'],
      [{ target: { id: 'b1' }, songs: [song({ number: 1.5 })] }, 'номер'],
      [{ target: { id: 'b1' }, songs: [song({ slides: [] })] }, 'слайди'],
      [{ target: { id: 'b1' }, songs: [song({ slides: [{ text: 5 }] })] }, 'текст слайда'],
      [
        {
          target: { id: 'b1' },
          songs: [song({ slides: [{ text: 'a', style: { ...style, align: 'justify' } }] })],
        },
        'вигляд слайда',
      ],
      [null, 'вкажіть бандл'],
    ];
    for (const [body, why] of cases) {
      const r = refusal(body);
      expect(r?.status).toBe(400);
      expect(r?.message).toMatch(/^Імпорт пісень: /);
      expect(r?.message).toContain(why);
    }
  });
});
