import { describe, expect, it } from 'vitest';
import { pdfUnits } from '@vo/shared';
import { pdfPages } from './pdfPages.js';

/**
 * A small real PDF built by hand (Helvetica, ASCII): one page per array of [text, size, x, y].
 * The byte offsets of the cross-reference table are counted, so pdf.js reads it without repair.
 */
function makePdf(pages: [string, number, number, number][][]): Uint8Array {
  const objs: string[] = [];
  const add = (s: string) => objs.push(s) && objs.length;
  const catalog = add('');
  const tree = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids: number[] = [];
  for (const lines of pages) {
    const stream = lines
      .map(([t, size, x, y]) => `BT /F1 ${size} Tf ${x} ${y} Td (${t}) Tj ET`)
      .join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(
      add(
        `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
      ),
    );
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objs[tree - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

const FULL = 'Word '.repeat(16).trim();

describe('a PDF through pdf.js into a document', () => {
  it('reads the runs with their sizes and places; a title, paragraphs, a page break', async () => {
    const pdf = makePdf([
      [
        ['Love that seeks not its own', 24, 72, 720],
        [FULL, 12, 72, 680],
        ['the end of a paragraph.', 12, 72, 666],
        [FULL, 12, 72, 630],
        ['runs on to the next', 12, 72, 616],
        ['3', 9, 300, 40],
      ],
      [
        ['page and ends here.', 12, 72, 720],
        ['4', 9, 300, 40],
      ],
    ]);
    const pages = await pdfPages(pdf);
    expect(pages.length).toBe(2);
    expect(pages[0].runs[0]).toMatchObject({
      str: 'Love that seeks not its own',
      x: 72,
      y: 720,
      h: 24,
    });
    expect(pdfUnits(pages).map((u) => [u.kind, u.level, u.text])).toEqual([
      ['heading', 1, 'Love that seeks not its own'],
      ['para', 0, `${FULL} the end of a paragraph.`],
      ['para', 0, `${FULL} runs on to the next page and ends here.`],
    ]);
  });

  it('a page without text (a scan) gives no units; a broken file fails', async () => {
    expect(pdfUnits(await pdfPages(makePdf([[]])))).toEqual([]);
    await expect(pdfPages(new TextEncoder().encode('not a pdf'))).rejects.toThrow();
  });
});
