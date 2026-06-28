import { normalizeForSearch } from './normalize.js';

export interface ParsedReference {
  /** Normalized book token to look up in `book_names` (e.g. "iv", "1 kor"). */
  bookToken: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}

/**
 * Parse a free-form reference into its parts. Supports both colon and space
 * separators and verse ranges, e.g.:
 *   "Ів 3:16"      -> John 3:16
 *   "бут 2 3"      -> Genesis 2:3        (space instead of colon)
 *   "бут 2 3-5"    -> Genesis 2:3-5      (range)
 *   "бут 2:3-5"    -> Genesis 2:3-5
 *   "бут 2"        -> Genesis 2          (whole chapter)
 *   "1 Кор 13:4-7" -> 1 Corinthians 13:4-7 (leading ordinal kept on the book)
 *   "Ісус Навин 4:10" -> Joshua 4:10       (multi-word book name)
 *   "Пісня над піснями 3" -> Song of Songs 3
 * Returns null if the string is not a reference (then the caller does text search).
 */
export function parseReference(query: string): ParsedReference | null {
  let q = query.trim();
  if (!q) return null;

  // Optional leading ordinal that belongs to the book name ("1 Кор", "2Ин").
  let ordinal = '';
  const ord = q.match(/^([1-3])\s*(?=\p{L})/u);
  if (ord) {
    ordinal = `${ord[1]} `;
    q = q.slice(ord[0].length);
  }

  // Book name: one or more words of letters (with dots/apostrophes), up to where the
  // chapter number begins — so multi-word names ("Ісус Навин", "Пісня над піснями")
  // are captured, not just the first word. The location starts at the first digit.
  const book = q.match(/^([\p{L}][\p{L}.'’\s]*?)\s*(\d.*)$/u);
  if (!book) return null;
  const bookRaw = `${ordinal}${book[1]}`.trim();

  // Remaining must start with a chapter number, optionally a verse / range.
  const rest = book[2].trim();
  const loc = rest.match(/^(\d+)(?:\s*[:\s]\s*(\d+)(?:\s*-\s*(\d+))?)?$/);
  if (!loc) return null;

  const chapter = Number.parseInt(loc[1], 10);
  if (!Number.isFinite(chapter)) return null;

  const bookToken = normalizeForSearch(bookRaw);
  if (!bookToken) return null;

  const verseStart = loc[2] ? Number.parseInt(loc[2], 10) : undefined;
  const verseEnd = loc[3] ? Number.parseInt(loc[3], 10) : verseStart;

  return { bookToken, chapter, verseStart, verseEnd };
}
