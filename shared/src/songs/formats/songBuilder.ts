import { guessLanguage } from '../../library/formats/language.js';
import { songKey, songNumberTitle, type ParsedSong } from '../pptx.js';
import { isChordLine } from '../sections.js';

/**
 * What the song readers share (1.25.0-beta.7): a song from a text format comes out as one from a
 * .pptx does — slide 0 is the title (with the authors under it), then a slide per section; a chorus
 * starts with its label, so the list and «До приспіву» know it. No look of its own (`style: null`):
 * it is shown in the app's.
 */
export interface TextSong {
  /** what the file says; '' → the file's name */
  title: string;
  number: number | null;
  authors: string[];
  sections: SongSection[];
}

export interface SongSection {
  chorus: boolean;
  /** what the file calls the chorus, when it says more than «chorus» */
  label?: string;
  lines: SongLine[];
}

/** A line of words, the chords over it at their places (in characters). */
export interface SongLine {
  text: string;
  chords?: { at: number; chord: string }[];
}

/** The import's own limits (server/src/songs.ts parseSongImport). */
const TITLE_MAX = 300;
const SLIDES_MAX = 500;
const SLIDE_MAX = 20_000;

/** A chord as the app's chord lines have it: «B♭» and «♯» in letters, a comment none. */
const plainChord = (c: string) =>
  c.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, '');

/**
 * The chord line over a line of words, or '' — always one `isChordLine` knows, so it stays in the
 * operator's list and never goes on the screen: a chord it wouldn't know is left out, a letter alone
 * (a word as often as a chord) goes into brackets.
 */
export function chordLine(chords: { at: number; chord: string }[]): string {
  let out = '';
  let count = 0;
  for (const { at, chord } of chords) {
    const c = plainChord(chord);
    // two letters: a lone bare one is not taken for a chord line by itself
    if (!c || !isChordLine(`${c} ${c}`)) continue;
    out = out.length < at ? out.padEnd(at) : out && `${out} `;
    out += c;
    count++;
  }
  if (count === 1 && out.trim().length === 1) out = out.replace(/\S/, '($&)');
  return isChordLine(out) ? out : '';
}

/** A line's words and, over them, its chords. */
function linesOf(line: SongLine): string[] {
  const text = line.text.trimEnd();
  const chords = line.chords?.length ? chordLine(line.chords) : '';
  return [...(chords ? [chords] : []), ...(text.trim() ? [text] : [])];
}

/** The section's slide, or '' when it has no words (chords of an introduction alone). */
function slideOf(section: SongSection, label: string): string {
  if (!section.lines.some((l) => l.text.trim() && !isChordLine(l.text))) return '';
  const lines = section.lines.flatMap(linesOf);
  return [...(section.chorus ? [section.label || label] : []), ...lines]
    .join('\n')
    .slice(0, SLIDE_MAX);
}

/** The chorus's label in the song's language: what `songParts` reads. */
export function chorusLabel(song: TextSong): string {
  const words = song.sections.flatMap((s) => s.lines.map((l) => l.text)).join(' ');
  const language = guessLanguage(words);
  if (language === 'uk') return 'Приспів:'; // i18n-ignore: words of the song
  if (language === 'ru') return 'Припев:'; // i18n-ignore: words of the song
  return 'Chorus:';
}

/**
 * The song as a bundle keeps it; null when it has no words. `key`: what tells it from the file's
 * other songs (a ChordPro file may hold several).
 */
export function buildSong(song: TextSong, fileName: string, more = ''): ParsedSong | null {
  const label = chorusLabel(song);
  const slides = song.sections
    .map((s) => slideOf(s, label))
    .filter((t) => t !== '')
    .slice(0, SLIDES_MAX - 1);
  if (slides.length === 0) return null;
  const file = songFileKey(fileName);
  const named = songNumberTitle(file);
  const title = (song.title.trim() || named.title || file).slice(0, TITLE_MAX);
  return {
    key: keyOf(fileName, more),
    number: song.number ?? (more ? null : named.number),
    title,
    slides: [
      {
        text: [title, ...new Set(song.authors.map((a) => a.trim()).filter(Boolean))]
          .join('\n')
          .slice(0, SLIDE_MAX),
        style: null,
      },
      ...slides.map((text) => ({ text, style: null })),
    ],
  };
}

/**
 * The song's key in its bundle: the file's name with its extension — the same song in a .pptx and in
 * a .txt are two, neither takes the other's place — and which of the file's songs it is.
 */
function keyOf(fileName: string, more: string): string {
  const name = fileName.replace(/^.*[\\/]/, '').normalize('NFC');
  return `${name}${more && ` – ${more}`}`.slice(0, TITLE_MAX).trim();
}

/** The file's name without its extension, as `songKey` makes it for a .pptx. */
export function songFileKey(fileName: string): string {
  return songKey(fileName.replace(/\.(xml|cho|crd|chopro|chordpro|chord|txt)$/i, ''));
}
