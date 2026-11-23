import { describe, expect, it } from 'vitest';
import { defaultTranslation, inLanguage, languageFirst } from './translationOrder';

describe('the interface language first (1.25.0-beta.5)', () => {
  it('its group leads, the rest keep their order', () => {
    expect(
      languageFirst(
        [
          ['ru', 1],
          ['en', 2],
          ['uk', 3],
          ['de', 4],
        ],
        'uk',
      ).map(([c]) => c),
    ).toEqual(['uk', 'ru', 'en', 'de']);
  });
  it('a translation in it by default, else the first', () => {
    const list = [
      { id: 1, language: 'ru' },
      { id: 6, language: 'uk' },
      { id: 9, language: 'en' },
    ];
    expect(defaultTranslation(list, 'uk')?.id).toBe(6);
    expect(defaultTranslation(list, 'en')?.id).toBe(9);
    expect(defaultTranslation([{ id: 1, language: 'ru' }], 'uk')?.id).toBe(1);
    expect(defaultTranslation([], 'uk')).toBeUndefined();
  });
  it('codes the way modules write them', () => {
    expect(inLanguage('uk-UA', 'uk')).toBe(true);
    expect(inLanguage('UKR', 'uk')).toBe(true);
    expect(inLanguage('ru', 'uk')).toBe(false);
  });
});
