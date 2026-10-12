import { normalizeForSearch } from '../normalize.js';

/**
 * Bible references inside a document (1.17.0-beta.2): «Ів 3:16», «1 Кор 13:4-7», «Мт. 5:44» in
 * a sermon become links — a click puts the verses on screen — and the library knows which
 * documents cite a verse. Found with the library's own book names, so «Ів» counts only where some
 * translation calls a book so; a capital letter and «chapter:verse» keep ordinary text out.
 */

export interface FoundRef {
  /** where it stands in the unit's text */
  start: number;
  len: number;
  /** the book's name as written, normalized («1 кор») */
  token: string;
  chapter: number;
  from: number;
  to: number;
}

// an optional ordinal, a capitalized word (a dot after an abbreviation), chapter:verse[-verse]
const REF =
  /(?<![\p{L}\p{N}])((?:[1-3]\s?)?\p{Lu}[\p{L}'’]{0,14}\.?)\s?(\d{1,3}):(\d{1,3})(?:\s?[-–—]\s?(\d{1,3}))?(?![\p{N}:])/gu;

/** Every «Book ch:v[-v]» in a text, in order. */
export function scanReferences(text: string): FoundRef[] {
  const out: FoundRef[] = [];
  for (const m of text.matchAll(REF)) {
    const chapter = Number(m[2]);
    const from = Number(m[3]);
    const to = m[4] ? Number(m[4]) : from;
    if (chapter < 1 || from < 1 || to < from || to - from > 200) continue;
    const token = normalizeForSearch(m[1].replace(/\.$/, ''));
    if (!token) continue;
    out.push({ start: m.index, len: m[0].length, token, chapter, from, to });
  }
  return out;
}

/**
 * A book's number for a written name, from the library's names (`book_names`): the same name,
 * else the shortest name it starts, else the longest abbreviation it starts with. Two books
 * equally good — no book (a link must not guess).
 */
export function bookResolver(
  names: { book_number: number; name_norm: string }[],
): (token: string) => number | null {
  const cache = new Map<string, number | null>();
  return (token) => {
    if (cache.has(token)) return cache.get(token)!;
    const best = new Map<number, number>();
    for (const n of names) {
      const nm = n.name_norm;
      let score = -1;
      if (nm === token) score = 3000;
      else if (token.length >= 2 && nm.startsWith(token)) score = 1000 - nm.length;
      else if (nm.length >= 2 && token.startsWith(nm)) score = 600 + nm.length;
      if (score > (best.get(n.book_number) ?? -1)) best.set(n.book_number, score);
    }
    let book: number | null = null;
    let top = -1;
    let tie = false;
    for (const [b, s] of best) {
      if (s > top) {
        top = s;
        book = b;
        tie = false;
      } else if (s === top) tie = true;
    }
    const r = tie ? null : book;
    cache.set(token, r);
    return r;
  };
}
