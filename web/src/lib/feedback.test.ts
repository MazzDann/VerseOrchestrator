import { describe, expect, it } from 'vitest';
import { FEEDBACK_FORM, feedbackUrl, systemLine } from './feedback';

describe('feedback (1.2.0)', () => {
  it('names the system and the browser, nothing more', () => {
    expect(
      systemLine({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36',
        userAgentData: {
          platform: 'Windows',
          brands: [
            { brand: 'Chromium', version: '140' },
            { brand: 'Google Chrome', version: '140' },
            { brand: 'Not=A?Brand', version: '24' },
          ],
        },
      }),
    ).toBe('Windows · Chrome 140');
    expect(
      systemLine({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      }),
    ).toBe('macOS · Safari 18');
    expect(
      systemLine({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
      }),
    ).toBe('Linux · Firefox 130');
    expect(systemLine({ userAgent: '' })).toBe('');
  });

  it('opens the form with the version, the system, and the language filled in', () => {
    const url = new URL(
      feedbackUrl({ version: '1.2.0', system: 'Windows · Chrome 140', lang: 'uk' }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(FEEDBACK_FORM);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: 'feedback.yml',
      version: '1.2.0',
      system: 'Windows · Chrome 140',
      language: 'uk',
    });
  });
});
