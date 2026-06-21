export interface StrongToken {
  text: string;
  strong: string | null;
}

function safeFromCodePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}

/** Decode HTML entities (e.g. `&#x03B1;` → α) in dictionary definitions for display. */
export function decodeEntities(s: string): string {
  if (!s || !s.includes('&')) return s;
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(Number.parseInt(d, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
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
