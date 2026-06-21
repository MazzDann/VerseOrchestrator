/**
 * Text normalization shared by the builder (to precompute the search column)
 * and the server (to normalize the incoming query the same way).
 *
 * `stripTags` is a faithful port of `remove_xml_tags` from the old Godot app
 * (old/ShowBible/scr/BD_things.gd). MyBible verse text embeds markup such as
 * Strong's numbers `<S>7225</S>`, footnotes `<f>..</f>`, notes `<n>..</n>`,
 * italics `<i>..</i>`, and paragraph breaks `<pb/>`.
 *
 * Rule (matching the original, extended): drop every `<...>` tag, AND for tag
 * pairs whose name starts with S / N / F / M also drop the inner content —
 * Strong numbers (`<S>`), footnotes (`<f>`/`<n>`) and grammar/morphology codes
 * (`<m>PREP</m>`, `<m>N-DSF</m>`) are not meant to be displayed. Other tags
 * (e.g. `<i>`) are removed but their inner text is kept.
 */
export function stripTags(input: string): string {
  if (!input) return '';
  if (!input.includes('<') || !input.includes('>')) return input.replace(/\s+/g, ' ').trim();

  let out = '';
  let insideTag = false;
  let endOfTag = false;
  let removeInside = false;

  for (const ch of input) {
    if (ch === '<') {
      insideTag = true;
    } else if (ch === '/' && insideTag) {
      endOfTag = true;
    } else if (
      insideTag &&
      (ch === 'S' ||
        ch === 's' ||
        ch === 'N' ||
        ch === 'n' ||
        ch === 'F' ||
        ch === 'f' ||
        ch === 'M' ||
        ch === 'm')
    ) {
      // Opening S/N/F/M tag -> swallow inner content; closing tag -> stop.
      removeInside = !endOfTag;
    } else if (ch === '>') {
      endOfTag = false;
      if (!removeInside) insideTag = false;
    } else if (!insideTag) {
      out += ch;
    }
  }

  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Normalize text for case- and diacritic-insensitive search.
 *
 * Why this exists: SQLite's `LIKE` is only case-insensitive for ASCII, so a
 * naive query misses Cyrillic/Greek. Instead of relying on the engine we
 * precompute a normalized column at build time and normalize the query the
 * same way here, so matching is engine-independent.
 *
 * Note for Ukrainian/Russian: NFKD + combining-mark removal folds accented
 * forms onto their base letters (й→и, ї→і, ё→е). This makes search forgiving
 * of accents/typos, mirroring the "bare letters" approach of the old app.
 */
export function normalizeForSearch(text: string): string {
  return stripTags(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // drop punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

function safeFromCodePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}

/** Decode HTML entities (`&#x03B1;` → α, `&amp;` → &) used in dictionary text. */
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
 * Convert a dictionary definition's HTML to readable plain text: paragraph and
 * line-break tags become newlines (so the lemma/pronunciation and the gloss stay
 * on separate lines), other tags are dropped, entities are decoded.
 */
export function cleanDefinition(html: string): string {
  if (!html) return '';
  const withBreaks = html
    .replace(/<\s*(p|br)\b[^>]*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|li|tr|h[1-6]|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(withBreaks)
    .replace(/[ \t ]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Split a normalized string into search tokens. */
export function searchTokens(query: string): string[] {
  const normalized = normalizeForSearch(query);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

export interface TextSegment {
  text: string;
  /** Inside `<J>…</J>` — the words of Jesus (red-letter). */
  jesus?: boolean;
}

/**
 * Split a verse's raw MyBible markup into display segments, marking the words of
 * Jesus (`<J>…</J>`, "red-letter") while stripping all other markup. Adjacent
 * segments are word-groups, so the renderer joins them with a single space.
 */
export function parseRedLetter(raw: string): TextSegment[] {
  if (!raw) return [];
  if (!/<J>/i.test(raw)) {
    const t = stripTags(raw);
    return t ? [{ text: t }] : [];
  }
  const out: TextSegment[] = [];
  const push = (chunk: string, jesus: boolean) => {
    const t = stripTags(chunk);
    if (t) out.push(jesus ? { text: t, jesus: true } : { text: t });
  };
  const re = /<J>([\s\S]*?)<\/J>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) push(raw.slice(last, m.index), false);
    push(m[1], true);
    last = re.lastIndex;
  }
  if (last < raw.length) push(raw.slice(last), false);
  return out;
}

/**
 * Extract the unique Strong's numbers embedded in a verse's raw MyBible markup
 * (`<S>7225</S>`), in first-seen order. Feeds the concordance index so we can
 * answer "which verses use this Strong number" without re-scanning text at query
 * time. Mirrors the tag shape used by the web parser (`parseStrongTokens`).
 */
export function strongNumbers(raw: string): number[] {
  if (!raw || !raw.includes('<S>')) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  const re = /<S>\s*(\d+)\s*<\/S>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const n = Number.parseInt(m[1], 10);
    if (n > 0 && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
