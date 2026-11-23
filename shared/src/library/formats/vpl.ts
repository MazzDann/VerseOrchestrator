import { bookOfCode } from './books.js';
import { ModuleText, type ParsedModule } from './moduleText.js';

/** A line of VPL («verse per line»): a book code, chapter:verse, the text. */
const LINE = /^([1-4A-Z][A-Z0-9]{2})\s+(\d{1,3}):(\d{1,3})[a-z]?(?:-\d{1,3})?\s+(\S.*)$/;

/** Is this a VPL text? The first lines with anything in them all are such lines. */
export function looksLikeVpl(text: string): boolean {
  const lines = text
    .split(/\r?\n/, 40)
    .filter((l) => l.trim())
    .slice(0, 5);
  return lines.length > 0 && lines.every((l) => LINE.test(l));
}

export function readVpl(text: string): ParsedModule {
  const out = new ModuleText();
  for (const line of text.split(/\r?\n/)) {
    const m = LINE.exec(line);
    if (!m) continue;
    const book = bookOfCode(m[1]);
    if (book === null) {
      out.endVerse();
      out.skip(m[1]);
      continue;
    }
    out.startVerse(book, Number(m[2]), Number(m[3]));
    out.text(m[4]);
  }
  return out.finish('vpl');
}
