/**
 * Text normalization shared by the builder (to precompute the search column)
 * and the server (to normalize the incoming query the same way).
 *
 * `stripTags` is a faithful port of `remove_xml_tags` from the old Godot app
 * (old/ShowBible/scr/BD_things.gd). MyBible verse text embeds markup such as
 * Strong's numbers `<S>7225</S>`, footnotes `<f>..</f>`, notes `<n>..</n>`,
 * italics `<i>..</i>`, and paragraph breaks `<pb/>`.
 *
 * Rule (matching the original): drop every `<...>` tag, AND for tag pairs whose
 * name starts with S / N / F also drop the inner content (Strong numbers and
 * footnotes are not meant to be displayed). Other tags (e.g. `<i>`) are removed
 * but their inner text is kept.
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
      (ch === 'S' || ch === 's' || ch === 'N' || ch === 'n' || ch === 'F' || ch === 'f')
    ) {
      // Opening S/N/F tag -> start swallowing inner content; closing tag -> stop.
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

/** Split a normalized string into search tokens. */
export function searchTokens(query: string): string[] {
  const normalized = normalizeForSearch(query);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}
