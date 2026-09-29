export interface StrongToken {
  text: string;
  strong: string | null;
}

/**
 * Parse MyBible raw verse markup into tokens, attaching each `<S>####</S>`
 * Strong number to the text segment that precedes it. Morphology (`<m>`) and
 * other tags are dropped.
 */
export function parseStrongTokens(raw: string): StrongToken[] {
  if (!raw) return [];
  const s = raw
    .replace(/<m>.*?<\/m>/gi, ' ') // morphology codes
    .replace(/<(?!\/?S>)[^>]*>/gi, ' '); // every tag except <S>/</S>

  const tokens: StrongToken[] = [];
  const re = /([^<]*?)<S>\s*(\d+)\s*<\/S>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const word = m[1].replace(/\s+/g, ' ').trim();
    if (word) tokens.push({ text: word, strong: m[2] });
    last = re.lastIndex;
  }
  const tail = s
    .slice(last)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (tail) tokens.push({ text: tail, strong: null });
  return tokens;
}
