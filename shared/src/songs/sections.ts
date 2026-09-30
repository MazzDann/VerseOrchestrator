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
