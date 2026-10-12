/**
 * PDF documents read apart (1.17.0-beta.3, pdfReader.ts): pdf.js (unpdf's build without a canvas;
 * pdf.js 6 has no eval path) in a child process, so a big or a broken file never stalls the server. It
 * answers the server's IPC messages — a file's path in, the document's units out.
 */
import fs from 'node:fs';
import { pdfUnits } from '@vo/shared';
import { pdfPages } from './pdfPages.js';
import type { PdfAsk, PdfReply } from './pdfReader.js';

const reply = (m: PdfReply) => process.send?.(m);

process.on('message', (m: PdfAsk) => {
  void (async () => {
    try {
      reply({ id: m.id, units: pdfUnits(await pdfPages(new Uint8Array(fs.readFileSync(m.file)))) });
    } catch (e) {
      reply({ id: m.id, error: (e as Error).message });
    }
  })();
});
// the server gone (its IPC channel closed): nothing left to answer
process.on('disconnect', () => process.exit(0));
