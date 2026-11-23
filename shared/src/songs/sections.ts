/**
 * The parts of a song (1.3.0): which slide is the title, a verse, or a chorus — so the song
 * list says «Приспів» where it used to count every slide as «Куплет N», and «До приспіву»
 * finds the chorus that comes next.
 *
 * A chorus is a slide whose first line names it («Приспів:», «Приспів (до 5-го куплету):»,
 * «Припев», «Chorus», «Refrain»), or an unlabelled slide with the same words as a labelled
 * one. Slides of a chorus in a row are one chorus in parts (a long chorus over two slides).
 * Choruses with different words are variants, numbered in the order they first come: some
 * songs have their own chorus after each verse, or a different one before the last.
 *
 * Measured on the reference songbook (479 songs): 184 label their chorus, 183 of them
 * repeat it after every verse; 11 have more than one chorus slide that differ.
 */

export type SongPart =
  | { kind: 'title' }
  | { kind: 'verse'; verse: number }
  | {
      kind: 'chorus';
      /** which of the song's different choruses (1-based) — only when it has more than one */
      variant?: number;
      /** its part and their count, for a chorus over several slides in a row */
      part?: number;
      parts?: number;
      /** the label as the file writes it, when it says more than the word itself */
      name?: string;
      /** the slide the chorus starts on */
      start: number;
    };

const LABEL = /^\s*(приспів|припев|chorus|refrain)(?![\p{L}\d])/iu; // i18n-ignore: words in song files

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** The label line, if the slide starts with one: «Приспів (до 5-го куплету):». */
function labelOf(text: string): string | null {
  const first = text.split('\n')[0] ?? '';
  return LABEL.test(first) ? first.trim() : null;
}

/** The slide's words without its label line. */
function bodyOf(text: string): string {
  return labelOf(text) === null ? text : text.split('\n').slice(1).join('\n');
}

/**
 * The part of every slide, in order. Slide 0 is the title (a song's first slide names it);
 * verses are counted among themselves.
 */
export function songParts(texts: string[]): SongPart[] {
  const labelled = new Set(
    texts.flatMap((t, i) => (i > 0 && labelOf(t) !== null ? [norm(bodyOf(t))] : [])),
  );
  const isChorus = texts.map(
    (t, i) => i > 0 && (labelOf(t) !== null || (norm(t) !== '' && labelled.has(norm(t)))),
  );
  // choruses in a row are one chorus; the words of all its slides tell variants apart
  const blocks: { start: number; end: number; key: string }[] = [];
  for (let i = 0; i < texts.length; i++) {
    if (!isChorus[i]) continue;
    const last = blocks[blocks.length - 1];
    if (last && last.end === i - 1) {
      last.end = i;
      last.key += `\u0000${norm(bodyOf(texts[i]))}`;
    } else blocks.push({ start: i, end: i, key: norm(bodyOf(texts[i])) });
  }
  const variants = [...new Set(blocks.map((b) => b.key))];
  const parts: SongPart[] = [];
  let verse = 0;
  for (let i = 0; i < texts.length; i++) {
    if (i === 0) parts.push({ kind: 'title' });
    else if (!isChorus[i]) parts.push({ kind: 'verse', verse: ++verse });
    else {
      const b = blocks.find((x) => x.start <= i && i <= x.end)!;
      const label = labelOf(texts[i])?.replace(/[:.\s]+$/, '') ?? '';
      const count = b.end - b.start + 1;
      parts.push({
        kind: 'chorus',
        start: b.start,
        ...(variants.length > 1 ? { variant: variants.indexOf(b.key) + 1 } : {}),
        ...(count > 1 ? { part: i - b.start + 1, parts: count } : {}),
        // «Приспів (до 5-го куплету)» says which one it is; a bare «Приспів:» doesn't
        ...(label.replace(LABEL, '').trim() ? { name: label } : {}),
      });
    }
  }
  return parts;
}

/**
 * «До приспіву»: the chorus to go to from slide `current` (null: nothing shown yet) — the
 * next one after it (after all of the chorus it is in); in the last chorus, its start; past
 * the last chorus, the one before (a song that writes its chorus once). Null: none.
 */
export function nextChorus(parts: SongPart[], current: number | null): number | null {
  const starts = parts.flatMap((p, i) => (p.kind === 'chorus' && p.start === i ? [i] : []));
  if (starts.length === 0) return null;
  const here = current === null ? undefined : parts[current];
  const inChorus = here?.kind === 'chorus';
  const from = inChorus ? here.start : (current ?? -1);
  // the last slide of the chorus we are in: go past all of it
  let to = from;
  while (inChorus && startOf(parts[to + 1]) === from) to++;
  const after = starts.find((s) => s > to);
  if (after !== undefined) return after;
  // in the last chorus: back to its start, if not there already
  if (inChorus) return current !== from ? from : null;
  return [...starts].reverse().find((s) => s < from) ?? null;
}

const startOf = (p: SongPart | undefined): number | undefined =>
  p?.kind === 'chorus' ? p.start : undefined;

/** A slide's words without its label line («Приспів:»), for a model that weighs words (1.25.0-beta.1). */
export function slideWords(text: string): string {
  return bodyOf(text);
}

// ── Chord lines (1.25.0-beta.5 «Зручність»: «F Dm Gm C-C7» went to the hall) ──────────────────

/** A chord: a note A–H, a sharp or flat, a kind (m, maj7, sus4, dim …), a bass after «/». */
const CHORD =
  /^\(?[A-H](?:#|b|♯|♭)?(?:m|maj|min|dim|aug|sus|add|M)?\d*(?:(?:sus|add|maj)\d+)?(?:\/[A-H](?:#|b|♯|♭)?)?\)?$/;

/** Cyrillic letters typed for notes: «С-С7» in a file is C-C7. */
const LOOKALIKE: Record<string, string> = { А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H' }; // i18n-ignore

/**
 * Is a line nothing but chords («F Dm Gm C-C7», «(Am) G», «С-С7» with Cyrillic letters)? A line of
 * Cyrillic capitals alone is words, not chords: a Latin letter, a digit or a ♯ ♭ / is asked for.
 */
export function isChordLine(line: string): boolean {
  const tokens = line
    .trim()
    .split(/[\s\-–—|]+/)
    .filter(Boolean);
  if (!tokens.length || !tokens.some((t) => /[A-Za-z0-9#♯♭/]/.test(t))) return false;
  // one bare letter alone is a word as often as a chord (a lyric line «A»): left as it is
  if (tokens.length === 1 && tokens[0].length === 1) return false;
  return tokens.every((t) => CHORD.test(t.replace(/[АВСЕН]/g, (c) => LOOKALIKE[c]))); // i18n-ignore
}

/**
 * A slide's text for the screen: its chord-only lines gone — the operator's list keeps them. `second`
 * (a marked copy of the same text, pptx.ts `markedText`) loses the same lines, so the two still match.
 */
export function withoutChordLines(
  text: string,
  second?: string,
): { text: string; second?: string } {
  const lines = text.split('\n');
  const drop = lines.map((l) => isChordLine(l.replace(/[]/g, '')));
  if (!drop.some(Boolean)) return { text, second };
  const keep = (t: string) =>
    t
      .split('\n')
      .filter((_, i) => !drop[i])
      .join('\n');
  const secondLines = second?.split('\n');
  return {
    text: keep(text),
    ...(second !== undefined
      ? { second: secondLines && secondLines.length === lines.length ? keep(second) : second }
      : {}),
  };
}
