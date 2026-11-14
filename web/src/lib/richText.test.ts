import { describe, expect, it } from 'vitest';
import { hasMarkup, pageAt, parseRich, parseSpans, plainOf, richOf, splitPages } from './richText';

describe('«Багатий текст» (1.22.0-beta.1, F1107-14)', () => {
  it('reads bold and italic, and leaves lone marks and snake_case alone', () => {
    expect(parseSpans('Сьогодні **о 18:00** — *молитва*')).toEqual([
      { text: 'Сьогодні ' },
      { text: 'о 18:00', b: true },
      { text: ' — ' },
      { text: 'молитва', i: true },
    ]);
    expect(parseSpans('__жирне__ і _курсив_')).toEqual([
      { text: 'жирне', b: true },
      { text: ' і ' },
      { text: 'курсив', i: true },
    ]);
    expect(parseSpans('2 * 3 = 6')).toEqual([{ text: '2 * 3 = 6' }]);
    expect(parseSpans('file_name_here')).toEqual([{ text: 'file_name_here' }]);
    expect(parseSpans('\\*не курсив\\*')).toEqual([{ text: '*не курсив*' }]);
    expect(parseSpans('***обидва***')).toEqual([{ text: 'обидва', b: true, i: true }]);
  });

  it('keeps one block per line: headings, bullets, numbers, quotes, dividers, empty lines', () => {
    const blocks = parseRich('# Оголошення\n- перше\n2) друге\n> цитата\n---\n\nкінець');
    expect(blocks).toEqual([
      { kind: 'h', spans: [{ text: 'Оголошення' }] },
      { kind: 'li', spans: [{ text: 'перше' }] },
      { kind: 'li', n: 2, spans: [{ text: 'друге' }] },
      { kind: 'quote', spans: [{ text: 'цитата' }] },
      { kind: 'hr' },
      { kind: 'p', spans: [] },
      { kind: 'p', spans: [{ text: 'кінець' }] },
    ]);
    expect(plainOf(blocks)).toBe('Оголошення\n• перше\n2. друге\nцитата\n—\n\nкінець');
  });

  it('plain text stays plain — nothing to draw apart', () => {
    expect(hasMarkup(parseRich('Сьогодні о 18:00\nмолитва'))).toBe(false);
    expect(hasMarkup(parseRich('**Увага**'))).toBe(true);
    expect(hasMarkup(parseRich('1. так'))).toBe(true);
    // an escape alone: plain, its backslash gone (review)
    const esc = parseRich(String.raw`2 \* 3 = \*6\*`);
    expect(hasMarkup(esc)).toBe(false);
    expect(plainOf(esc)).toBe('2 * 3 = *6*');
    expect(plainOf(parseRich('рядок\r\nдругий'))).toBe('рядок\nдругий');
  });

  it('takes from the bus only what it can draw', () => {
    expect(richOf({ blocks: [{ kind: 'hr' }], align: 'center' })).toEqual({
      blocks: [{ kind: 'hr' }],
      align: 'center',
    });
    expect(richOf({ blocks: [{ kind: 'p', spans: [{ text: 1 }] }] })).toBeNull();
    expect(richOf({ blocks: 'x' })).toBeNull();
    expect(richOf({ blocks: [], align: 'diagonal' })).toEqual({ blocks: [] });
    expect(richOf(null)).toBeNull();
  });
});

describe('«Абзаци — окремими слайдами» (1.22.0-beta.2, F1107-08)', () => {
  const lines = (...xs: string[]) => xs.join('\n');
  it('splits on empty lines, one or more; a paragraph keeps its own lines', () => {
    expect(splitPages(lines('перший', 'рядок', '', 'другий', '', '', '  ', 'третій'))).toEqual([
      lines('перший', 'рядок'),
      'другий',
      'третій',
    ]);
    expect(splitPages('один')).toEqual(['один']);
    expect(splitPages(lines('', '', 'один', '', ''))).toEqual(['один']);
  });
  it('knows the slide the caret is in', () => {
    const t = lines('а', 'б', '', 'в', '', 'г');
    expect(pageAt(t, 0)).toBe(0);
    expect(pageAt(t, 3)).toBe(0);
    expect(pageAt(t, 5)).toBe(1);
    expect(pageAt(t, t.length)).toBe(2);
  });
});
