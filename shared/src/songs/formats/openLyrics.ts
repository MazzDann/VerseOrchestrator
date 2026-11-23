import { lastNamed, readXml } from '../../library/formats/xml.js';
import type { SongLine, SongSection, TextSong } from './songBuilder.js';

type Attrs = Record<string, string>;

/** A chord's name: in one attribute, or its root, kind and bass apart (a newer form). */
function chordOf(a: Attrs): string {
  if (a.name) return a.name;
  if (!a.root) return '';
  return `${a.root}${a.structure ?? ''}${a.bass ? `/${a.bass}` : ''}`;
}

interface Verse extends SongSection {
  name: string;
  lang: string;
}

/** What a verse may hold that is not sung: an operator's note, an instrument's part. */
const UNSUNG = new Set(['comment', 'instrument']);
/** Spaces of the file's own layout: a line break in the XML is no line of the song. */
const squash = (s: string) => s.replace(/\s+/g, ' ');

export function readOpenLyrics(xml: string): TextSong {
  const song: TextSong = { title: '', number: null, authors: [], sections: [] };
  const verses: Verse[] = [];
  const stack: { name: string; attrs: Attrs }[] = [];
  let order: string[] = [];
  let verse: Verse | null = null;
  let line: SongLine | null = null;
  let unsung = 0;
  /** a property's text: title, author, verseOrder */
  let said = '';

  const endLine = () => {
    if (verse && line) {
      const lead = line.text.length - line.text.trimStart().length;
      line.text = line.text.trim();
      if (lead) line.chords = line.chords?.map((c) => ({ ...c, at: Math.max(0, c.at - lead) }));
      if (line.text || line.chords?.length) verse.lines.push(line);
    }
    line = null;
  };
  const within = (name: string) => lastNamed(stack, name) >= 0;

  readXml(xml, {
    open(name, attrs, empty) {
      if (!empty) stack.push({ name, attrs });
      if (name === 'verse') {
        verse = { name: attrs.name ?? '', lang: attrs.lang ?? '', chorus: false, lines: [] };
        verse.chorus = /^c/i.test(verse.name);
        if (empty) verse = null;
      } else if (verse && UNSUNG.has(name)) unsung += empty ? 0 : 1;
      else if (verse && name === 'lines') line = { text: '' };
      else if (verse && name === 'br' && !unsung) {
        endLine();
        line = { text: '' };
      } else if (verse && name === 'chord' && line && !unsung) {
        line.chords = [...(line.chords ?? []), { at: line.text.length, chord: chordOf(attrs) }];
      } else if (name === 'title' || name === 'author' || name === 'verseorder') said = '';
      else if (name === 'songbook' && song.number === null) {
        const n = /^\s*(\d{1,6})/.exec(attrs.entry ?? '');
        if (n) song.number = Number(n[1]);
      }
    },
    close(name) {
      const at = lastNamed(stack, name);
      if (at >= 0) stack.length = at;
      if (verse) {
        if (UNSUNG.has(name)) unsung = Math.max(0, unsung - 1);
        else if (name === 'lines') endLine();
        else if (name === 'verse') {
          endLine();
          if (verse.lines.length) verses.push(verse);
          verse = null;
          unsung = 0;
        }
        return;
      }
      const words = squash(said).trim();
      if (name === 'title') song.title ||= words;
      else if (name === 'author' && words) song.authors.push(words);
      else if (name === 'verseorder') order = words.split(' ').filter(Boolean);
      else return;
      said = '';
    },
    text(s) {
      if (line && !unsung) {
        const t = squash(s);
        line.text += line.text === '' || line.text.endsWith(' ') ? t.trimStart() : t;
      } else if (!verse && within('properties')) said += s;
    },
  });

  // a song in several languages: the first one's words (the others would be other songs)
  const lang = verses[0]?.lang ?? '';
  const own = verses.filter((v) => v.lang === lang);
  const byName = new Map<string, Verse[]>();
  for (const v of own) byName.set(v.name, [...(byName.get(v.name) ?? []), v]);
  const ordered = order.flatMap((n) => byName.get(n) ?? []);
  // an order that leaves verses out means it; one that names none of them says nothing
  song.sections = ordered.length > 0 ? ordered : own;
  return song;
}
