import { describe, expect, it } from 'vitest';
import { pdfUnits, type PdfPage, type PdfRun } from './pdf.js';

/** A line as one run (about half the size per character wide), or several runs given apart. */
const run = (str: string, y: number, x = 72, h = 12): PdfRun => ({
  str,
  x,
  y,
  w: str.length * h * 0.5,
  h,
});
const page = (...runs: PdfRun[]): PdfPage => ({ runs });
const FULL = 'Слово '.repeat(14).trim(); // a body line that reaches the right margin

describe('PDF text into a document', () => {
  it('headings by size, paragraphs by spacing, an indent, a short last line; runs joined', () => {
    const units = pdfUnits([
      page(
        run('Любов', 760, 72, 24),
        run('Перша частина', 720, 72, 16),
        run(FULL, 690),
        run('кінець абзацу.', 676),
        run(FULL, 650), // a bigger gap: a new paragraph
        run('ще', 636),
        { str: 'слова.', x: 200, y: 636, w: 30, h: 12 }, // a run apart from «ще»: a space
        run('Новий абзац з відступу.', 622, 100),
        run('Короткий кінець.', 608),
        run('Наступний після короткого.', 594),
      ),
    ]);
    expect(units.map((u) => [u.kind, u.level, u.text])).toEqual([
      ['heading', 1, 'Любов'],
      ['heading', 2, 'Перша частина'],
      ['para', 0, `${FULL} кінець абзацу.`],
      ['para', 0, `${FULL} ще слова.`],
      ['para', 0, 'Новий абзац з відступу.'],
      ['para', 0, 'Короткий кінець.'],
      ['para', 0, 'Наступний після короткого.'],
    ]);
  });

  it('joins a hyphenated word, takes bullets as items, runs a paragraph over a page break', () => {
    const units = pdfUnits([
      page(run(FULL, 700), run('бла-', 686), run('годать і далі', 672)),
      page(run('продовження речення.', 760), run('• пункт перший', 730)),
    ]);
    expect(units.map((u) => [u.kind, u.text])).toEqual([
      ['para', `${FULL} благодать і далі продовження речення.`],
      ['item', 'пункт перший'],
    ]);
  });

  it('leaves out page numbers and a header repeated on most pages', () => {
    const p = (n: number, text: string) =>
      page(run('Конспект лекцій', 800, 72, 9), run(text, 700), run(`${n}`, 40, 300, 9));
    const units = pdfUnits([p(1, 'Перша сторінка.'), p(2, 'Друга сторінка.'), p(3, 'Третя.')]);
    // no indent, no short last line: the text runs on over the pages, without what repeats
    expect(units.map((u) => u.text)).toEqual(['Перша сторінка. Друга сторінка. Третя.']);
  });

  it('a scanned PDF (no text) gives no units', () => {
    expect(pdfUnits([page(), page()])).toEqual([]);
  });
});
