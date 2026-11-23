import type { SongLine, SongSection, TextSong } from './songBuilder.js';
import { sectionLabel, type SectionLabel } from './labels.js';

/** Blocks that are no words: tablature, chord grids, notation. */
const NO_WORDS = /^(tab|grid|abc|ly|svg|textblock)$/;
/** The short names of directives. */
const SHORT: Record<string, string> = {
  t: 'title',
  st: 'subtitle',
  c: 'comment',
  ci: 'comment',
  cb: 'comment',
  comment_italic: 'comment',
  comment_box: 'comment',
  highlight: 'comment',
  ns: 'new_song',
  soc: 'start_of_chorus',
  eoc: 'end_of_chorus',
  sov: 'start_of_verse',
  eov: 'end_of_verse',
  sob: 'start_of_bridge',
  eob: 'end_of_bridge',
  sot: 'start_of_tab',
  eot: 'end_of_tab',
  sog: 'start_of_grid',
  eog: 'end_of_grid',
};
/** Who made the song: under the title, as a .pptx title slide has it. */
const AUTHORS = /^(artist|composer|lyricist|arranger|subtitle)$/;

/** «[Am]Words [G]here» → the words and the chords at their places; «[*note]» is neither. */
export function chordedLine(s: string): SongLine {
  const chords: { at: number; chord: string }[] = [];
  let text = '';
  let last = 0;
  const re = /\[([^[\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    text += s.slice(last, m.index);
    last = re.lastIndex;
    if (!m[1].startsWith('*')) chords.push({ at: text.length, chord: m[1] });
  }
  text += s.slice(last);
  return chords.length ? { text, chords } : { text };
}

/** A ChordPro file's songs («{new_song}» starts the next). */
export function readChordPro(source: string): TextSong[] {
  const songs: TextSong[] = [];
  let song: TextSong;
  let section: SongSection | null = null;
  /** inside {start_of_chorus} … {end_of_chorus} */
  let chorus: { label?: string } | null = null;
  /** the next paragraph is a chorus: a comment or a label line said so */
  let next: { label?: string } | null = null;
  let skipping = '';

  const start = () => {
    song = { title: '', number: null, authors: [], sections: [] };
    songs.push(song);
    section = null;
    chorus = null;
    next = null;
    skipping = '';
  };
  const lastChorus = () => [...song.sections].reverse().find((s) => s.chorus);
  const endSection = () => {
    // a chorus's label with no words under it: the chorus again
    const done = section?.lines.length ? section : section?.chorus ? lastChorus() : null;
    if (done) song.sections.push(done);
    section = null;
  };
  const again = () => {
    endSection();
    const had = lastChorus();
    if (had) song.sections.push(had);
  };
  start();

  for (const raw of source.split(/\r\n|\r|\n/)) {
    const d = /^\s*\{\s*([\w-]+)\s*:?\s*(.*?)\s*\}\s*$/.exec(raw);
    if (d) {
      let name = d[1].toLowerCase().replace(/-.*$/, '');
      let value = d[2];
      name = SHORT[name] ?? name;
      if (name === 'meta') {
        const m = /^(\S+)\s+(.*)$/.exec(value);
        if (!m) continue;
        name = m[1].toLowerCase();
        value = m[2];
      }
      if (name === 'new_song') {
        endSection();
        start();
      } else if (name === 'title') song!.title ||= value;
      else if (AUTHORS.test(name)) song!.authors.push(value);
      else if (name === 'chorus') again();
      else if (name === 'comment') {
        const l = sectionLabel(value);
        if (l?.kind === 'chorus') {
          endSection();
          next = { label: l.label };
        }
      } else if (name.startsWith('start_of_')) {
        endSection();
        next = null;
        const what = name.slice(9);
        if (NO_WORDS.test(what)) skipping = what;
        else if (what === 'chorus') {
          const label = value.replace(/^label\s*=\s*["']?|["']$/g, '');
          chorus = { label: sectionLabel(label)?.label };
        }
      } else if (name.startsWith('end_of_')) {
        endSection();
        if (name.slice(7) === skipping) skipping = '';
        chorus = null;
      }
      continue;
    }
    if (skipping || /^\s*#/.test(raw)) continue;
    if (!raw.trim()) {
      endSection();
      continue;
    }
    const label: SectionLabel | null = section ? null : sectionLabel(raw);
    if (label) {
      // a label line of its own: the paragraph under it
      // …or, when it is blank, the first chorus under it
      next = label.kind === 'chorus' && !lastChorus() ? { label: label.label } : null;
      section = { chorus: label.kind === 'chorus', label: label.label, lines: [] };
      continue;
    }
    section ??= {
      chorus: chorus !== null || next !== null,
      label: (chorus ?? next)?.label,
      lines: [],
    };
    next = null;
    section.lines.push(chordedLine(raw));
  }
  endSection();
  return songs.filter((s) => s.sections.length > 0);
}
