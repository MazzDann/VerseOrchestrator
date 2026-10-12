export interface StrongToken {
  text: string;
  strong: string | null;
  /** the grammar code after it, «V-AAI-3S» (1.16.0-beta.2) */
  morph?: string;
}

const squash = (t: string) => t.replace(/\s+/g, ' ').trim();

/**
 * Parse raw module verse markup into tokens, attaching each `<S>####</S>`
 * Strong number to the text segment that precedes it. A `<m>CODE</m>` grammar
 * code (1.16.0-beta.2) belongs to the word right before it: the one a Strong
 * number has just closed, or a word without a number. Other tags are dropped.
 */
export function parseStrongTokens(raw: string): StrongToken[] {
  if (!raw) return [];
  const s = raw.replace(/<(?!\/?[SM]>)[^>]*>/gi, ' '); // every tag except <S>/<m>

  const tokens: StrongToken[] = [];
  const re = /<S>\s*(\d+)\s*<\/S>|<m>([^<]*)<\/m>/gi;
  let pending = ''; // the text since the last tag
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    pending += s.slice(last, m.index);
    last = re.lastIndex;
    const word = squash(pending);
    const prev = tokens[tokens.length - 1];
    if (m[1] != null) {
      if (word) tokens.push({ text: word, strong: m[1] });
      // a code before the number («word <m>X</m><S>1</S>»): the number is still the word's
      else if (prev?.strong === null && prev.morph != null) prev.strong = m[1];
      pending = '';
      continue;
    }
    const morph = squash(m[2]);
    if (word) {
      tokens.push({ text: word, strong: null, ...(morph ? { morph } : {}) });
      pending = '';
    } else if (morph && prev?.strong != null && prev.morph == null) prev.morph = morph;
  }
  const tail = squash(pending + s.slice(last).replace(/<[^>]*>/g, ' '));
  if (tail) tokens.push({ text: tail, strong: null });
  return tokens;
}
