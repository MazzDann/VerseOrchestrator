import fs from 'node:fs';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

export interface Song {
  number: number | null;
  title: string;
  /** One stanza per pptx slide, in slide order. */
  slides: string[];
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/**
 * Readable text of one slide. Walk runs and breaks in document order: `<a:t>` →
 * its text (consecutive runs concatenate, since PowerPoint splits mid-word),
 * `<a:br/>` and `</a:p>` → a line break. Then tidy whitespace.
 */
function slideText(xml: string): string {
  const parts: string[] = [];
  const re = /<a:t>([\s\S]*?)<\/a:t>|<a:br\b[^>]*?>|<\/a:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    parts.push(m[1] !== undefined ? decodeXml(m[1]) : '\n');
  }
  return parts
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const slideNum = (name: string): number =>
  Number.parseInt(name.match(/slide(\d+)\.xml/)?.[1] ?? '0', 10);

/** Read a .pptx hymn — number+title from the filename, one stanza per slide (slide-number order). */
export function readSong(file: string): Song | null {
  let unzipped: Record<string, Uint8Array>;
  try {
    const data = new Uint8Array(fs.readFileSync(file));
    unzipped = unzipSync(data, { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) });
  } catch {
    return null;
  }
  const slides = Object.keys(unzipped)
    .sort((a, b) => slideNum(a) - slideNum(b))
    .map((n) => slideText(strFromU8(unzipped[n])))
    .filter((s) => s.trim());
  if (slides.length === 0) return null;

  const base = path.basename(file).replace(/\.pptx$/i, '');
  const m = base.match(/^\s*(\d+)\s*[.\-)]\s*(.*)$/);
  return {
    number: m ? Number.parseInt(m[1], 10) : null,
    title: (m ? m[2] : base).trim(),
    slides,
  };
}

/** Recursively find .pptx files under a directory (skipping temp `~$` files). */
export function listPptx(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listPptx(full));
    else if (/\.pptx$/i.test(entry.name) && !entry.name.startsWith('~$')) out.push(full);
  }
  return out;
}
