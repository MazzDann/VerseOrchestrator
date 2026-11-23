import { isChordLine } from '../sections.js';
import { sectionLabel } from './labels.js';
import type { SongSection, TextSong } from './songBuilder.js';

const sameWords = (section: SongSection, words: string[]) =>
  section.lines.map((l) => l.text.trim()).join('\n') === words.map((w) => w.trim()).join('\n');

/**
 * A song in plain text: a blank line starts the next slide. One line alone at the top is the title
 * (a number before it — the song's); a line «Приспів:» names the chorus under it, and alone means the
 * chorus again; «Куплет 2» names nothing a screen needs.
 */
export function readPlainSong(source: string): TextSong {
  const song: TextSong = { title: '', number: null, authors: [], sections: [] };
  const paragraphs = source
    .replace(/\r\n?/g, '\n')
    .split(/\n[^\S\n]*(?:\n[^\S\n]*)+/)
    .map((p) => p.split('\n').filter((l) => l.trim()))
    .filter((p) => p.length > 0);

  const top = paragraphs[0];
  if (paragraphs.length > 1 && top.length === 1 && !sectionLabel(top[0]) && !isChordLine(top[0])) {
    paragraphs.shift();
    const m = /^\s*(?:№\s*)?(\d{1,4})\s*[.)\-–—]\s*(\S.*)$/.exec(top[0]);
    song.title = (m ? m[2] : top[0]).trim();
    if (m) song.number = Number(m[1]);
  }

  let chorus: SongSection | null = null;
  /** a label on a paragraph of its own: the chorus, if it stands under it */
  let waiting: SongSection | null = null;
  const repeat = () => {
    if (waiting && chorus) song.sections.push(chorus);
    waiting = null;
  };
  for (const lines of paragraphs) {
    const label = sectionLabel(lines[0]);
    const words = label ? lines.slice(1) : lines;
    if (label && words.length === 0) {
      repeat();
      if (label.kind === 'chorus') waiting = { chorus: true, label: label.label, lines: [] };
      continue;
    }
    // «Приспів:» alone and its words under it: the first time, or the same ones again
    const isChorus = label
      ? label.kind === 'chorus'
      : waiting !== null && (chorus === null || sameWords(chorus, words));
    // «Приспів:» alone, and the chorus known already: it is sung again here
    if (!isChorus || label) repeat();
    const section: SongSection = {
      chorus: isChorus,
      label: label ? label.label : isChorus ? (waiting as SongSection | null)?.label : undefined,
      lines: words.map((text) => ({ text: text.trimEnd() })),
    };
    waiting = null;
    if (isChorus) chorus = section;
    song.sections.push(section);
  }
  repeat();
  return song;
}
