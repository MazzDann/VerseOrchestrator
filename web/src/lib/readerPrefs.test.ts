import { describe, expect, it } from 'vitest';
import { DEFAULT_READER, READER_SIZES, readerTextStyle, sanitizeReader } from './readerPrefs';

describe('viewer reading preferences (/follow)', () => {
  it('keeps only valid values', () => {
    expect(sanitizeReader({ size: 3, bold: true, easy: true })).toEqual({
      size: 3,
      bold: true,
      easy: true,
    });
    expect(sanitizeReader({ size: 99, bold: 'yes', easy: 1 })).toEqual(DEFAULT_READER);
    expect(sanitizeReader(null)).toEqual(DEFAULT_READER);
    expect(sanitizeReader({ size: -1 })).toEqual(DEFAULT_READER);
  });

  it('the default looks like the page did before', () => {
    const s = readerTextStyle(DEFAULT_READER, 'Lora');
    expect(s.fontFamily).toBe('Lora');
    expect(s.fontSize).toBe('calc(clamp(20px, 6.2vw, 40px) * 1)');
    expect(s.fontWeight).toBeUndefined();
    expect(s.lineHeight).toBe(1.45);
  });

  it('bigger, bolder and easier to read', () => {
    const s = readerTextStyle({ size: READER_SIZES.length - 1, bold: true, easy: true }, 'Lora');
    expect(s.fontSize).toContain('* 1.75');
    expect(s.fontWeight).toBe(700);
    expect(s.fontFamily).toMatch(/^Andika, Verdana/);
    expect(s.textAlign).toBe('left');
    expect(s.lineHeight).toBeGreaterThan(1.6);
  });
});
