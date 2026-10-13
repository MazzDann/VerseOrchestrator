import { describe, expect, it } from 'vitest';
import { convertedName, converterFor, converters } from './convert';

const MAC = converters(
  'darwin',
  (app) => app === 'Pages.app',
  () => true,
);

describe('a Mac’s own formats (convert.ts)', () => {
  it('converts only on macOS, with what is installed', () => {
    expect(converters('win32')).toEqual([]);
    expect(converters('linux')).toEqual([]);
    expect(MAC.map((c) => `${c.ext}→${c.to}`)).toEqual([
      'rtf→docx',
      'doc→docx',
      'odt→docx',
      'wordml→docx',
      'html→docx',
      'htm→docx',
      'webarchive→docx',
      'pages→docx',
    ]);
    // Keynote not installed here: no .key
    expect(converterFor('Пісня.key', MAC)).toBeNull();
    expect(converterFor('Проповідь.PAGES', MAC)?.via).toBe('pages');
    expect(convertedName('a/Проповідь.pages', 'docx')).toBe('a/Проповідь.docx');
  });
});
