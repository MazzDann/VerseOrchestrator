import { getDocumentProxy } from 'unpdf';
import type { PdfPage, PdfRun } from '@vo/shared';

/**
 * A PDF's positioned text (1.17.0-beta.3) through pdf.js — unpdf's build, no canvas; pdf.js 6 has no
 * eval path. Run in pdfWorker.ts's child process; shared/src/documents/pdf.ts makes the document.
 */

/** More pages than this and the rest is left out (a book is not a document). */
const PAGES_MAX = 1000;

/** A PDF's text runs, page by page (the first PAGES_MAX pages). */
export async function pdfPages(bytes: Uint8Array): Promise<PdfPage[]> {
  const pdf = await getDocumentProxy(bytes, {
    useSystemFonts: false,
    stopAtErrors: false,
  });
  try {
    const pages: PdfPage[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages, PAGES_MAX); n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const runs: PdfRun[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const [, , c, d, x, y] = item.transform as number[];
        runs.push({ str: item.str, x, y, w: item.width, h: Math.hypot(c, d) || item.height });
      }
      pages.push({ runs });
      page.cleanup();
    }
    return pages;
  } finally {
    await pdf.cleanup();
  }
}
