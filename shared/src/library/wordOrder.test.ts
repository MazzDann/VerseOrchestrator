import { describe, expect, it } from 'vitest';
import { keepsWordOrder, orderMatters } from './queries.js';

describe('«По порядку» (1.23.0-beta.4, F1114-14: «"1 2" не має знаходити "2 1"»)', () => {
  const v = 'Так бо Бог полюбив світ, що дав Сина Свого Однородженого';
  it('the words in the order typed, others between them', () => {
    expect(keepsWordOrder(v, 'бог світ')).toBe(true);
    expect(keepsWordOrder(v, 'світ бог')).toBe(false);
    expect(keepsWordOrder(v, 'бог сина')).toBe(true); // words between
    expect(keepsWordOrder(v, 'сина бог')).toBe(false);
  });
  it('a word is a prefix, a phrase its words together; case and accents as the index reads them', () => {
    expect(keepsWordOrder(v, 'полюб світ')).toBe(true);
    expect(keepsWordOrder(v, 'БОГ "полюбив світ"')).toBe(true);
    expect(keepsWordOrder(v, '"полюбив світ" бог')).toBe(false);
    expect(keepsWordOrder(v, 'бог -диявол світ')).toBe(true); // an exclusion takes no place
  });
  it('a word repeated: the next one after the first', () => {
    expect(keepsWordOrder('сина бог сина', 'бог сина')).toBe(true);
    expect(keepsWordOrder('сина бог', 'сина сина')).toBe(false);
  });
  it('matters only with two words or more', () => {
    expect(orderMatters('бог')).toBe(false);
    expect(orderMatters('"бог полюбив"')).toBe(false);
    expect(orderMatters('бог світ')).toBe(true);
    expect(orderMatters('бог -світ')).toBe(false);
  });
});
