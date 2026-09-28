import { describe, expect, it } from 'vitest';
import { sameSlide, summarize } from './slide';
import type { Slide } from '../presenterBus';

const base: Slide = {
  lines: [{ translationAbbr: 'UKRK', text: 'Так бо полюбив Бог сьвіт', rtl: false }],
  reference: 'Ів 3:16',
  blank: false,
  visible: true,
};

describe('summarize', () => {
  it('reports a visible slide as live with its first line', () => {
    expect(summarize(base)).toMatchObject({
      status: 'live',
      reference: 'Ів 3:16',
      text: 'Так бо полюбив Бог сьвіт',
    });
  });
  it('distinguishes blank, black and empty', () => {
    expect(summarize({ ...base, blank: true }).status).toBe('blank');
    expect(summarize({ ...base, forceBlack: true }).status).toBe('black');
    expect(summarize({ ...base, lines: [] }).status).toBe('empty');
    expect(summarize(null).status).toBe('empty');
  });
  it('caps long text', () => {
    const long = { ...base, lines: [{ ...base.lines[0], text: 'а'.repeat(2000) }] };
    expect(summarize(long).text).toHaveLength(400);
  });
});

describe('sameSlide', () => {
  const styled = (bgImage: string | null): Slide => ({
    ...base,
    style: {
      font: 'serif',
      color: '#fff',
      align: 'center',
      bgColor: '#000',
      bgImage,
      showVerseNumbers: false,
      padTop: 4,
      padRight: 4,
      padBottom: 4,
      padLeft: 4,
      padUnit: '%',
      redLetter: true,
      jesusColor: '#f00',
      highlightColor: '#ff0',
    },
  });
  const bg = `data:image/jpeg;base64,${'A'.repeat(10_000)}`;

  it('treats a re-built identical slide as the same', () => {
    expect(sameSlide(styled(bg), styled(bg))).toBe(true);
    expect(sameSlide(base, { ...base, lines: [...base.lines] })).toBe(true);
  });

  it('sees any real change — text, state, style or background', () => {
    expect(sameSlide(base, { ...base, blank: true })).toBe(false);
    expect(sameSlide(base, { ...base, reference: 'Ів 3:17' })).toBe(false);
    expect(sameSlide(styled(bg), styled(null))).toBe(false);
    expect(sameSlide(styled(bg), styled(`${bg}B`))).toBe(false);
    expect(
      sameSlide(styled(bg), { ...styled(bg), style: { ...styled(bg).style!, color: '#eee' } }),
    ).toBe(false);
  });
});

describe("the viewers' QR slide (1.5.16)", () => {
  it('counts as something on screen for the remotes', () => {
    const qr = {
      lines: [],
      reference: 'QR для глядачів',
      blank: false,
      visible: true,
      qr: 'http://192.168.0.2:5173/follow',
    };
    expect(summarize(qr)).toMatchObject({
      status: 'live',
      reference: 'QR для глядачів',
      text: 'QR для глядачів',
    });
    expect(summarize({ ...qr, blank: true }).status).toBe('blank');
  });
});
