import { describe, expect, it } from 'vitest';
import { summarize } from './slide';
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
