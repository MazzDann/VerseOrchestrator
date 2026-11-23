import { decodeText } from '../documents/parse.js';
import { decodeXmlFile } from '../library/formats/decode.js';
import { readChordPro } from './formats/chordPro.js';
import { readOpenLyrics } from './formats/openLyrics.js';
import { readPlainSong } from './formats/plainText.js';
import { buildSong } from './formats/songBuilder.js';
import { isSongFile, parsePptx, type ParsedSong } from './pptx.js';

/**
 * Songs in text formats (1.25.0-beta.7): OpenLyrics, ChordPro and plain text, beside .pptx. Pure —
 * bytes in, songs out — so the import reads them in the browser as it reads .pptx, and they go into a
 * bundle the same way.
 */
export type SongFormat = 'pptx' | 'openlyrics' | 'chordpro' | 'text';

/** Bigger than this is no song's text. */
export const SONG_TEXT_MAX = 2 * 1024 * 1024;

const baseName = (name: string) => name.replace(/^.*[\\/]/, '');
const CHORDPRO = /\.(cho|crd|chopro|chordpro|chord)$/i;

/** The format a file's name says; an .xml is OpenLyrics only by its content (`isOpenLyrics`). */
export function songFormat(fileName: string): SongFormat | null {
  if (isSongFile(fileName)) return 'pptx';
  const base = baseName(fileName);
  if (base.startsWith('.') || base.startsWith('~$')) return null;
  if (CHORDPRO.test(base)) return 'chordpro';
  if (/\.xml$/i.test(base)) return 'openlyrics';
  return /\.txt$/i.test(base) ? 'text' : null;
}

/** Is an .xml a song (its first few KB are enough)? */
export function isOpenLyrics(head: Uint8Array): boolean {
  const s = decodeXmlFile(head.subarray(0, 4096));
  return /<(\w+:)?song[\s>]/i.test(s) && !/<(\w+:)?(osis|xmlbible)[\s>]/i.test(s);
}

/** The songs in a file of any format the import takes; none when it can't be read as one. */
export function parseSongFile(bytes: Uint8Array, fileName: string): ParsedSong[] {
  const format = songFormat(fileName);
  if (format === 'pptx') {
    const song = parsePptx(bytes, fileName);
    return song ? [song] : [];
  }
  if (format === null || bytes.length > SONG_TEXT_MAX) return [];
  const one = (song: ParsedSong | null) => (song ? [song] : []);
  if (format === 'openlyrics')
    return isOpenLyrics(bytes)
      ? one(buildSong(readOpenLyrics(decodeXmlFile(bytes)), fileName))
      : [];
  const text = decodeText(bytes);
  if (format === 'text') return one(buildSong(readPlainSong(text), fileName));
  const songs = readChordPro(text);
  if (songs.length === 1) return one(buildSong(songs[0], fileName));
  // several in one file: each known by its title beside the file's name
  const taken = new Set<string>();
  return songs.flatMap((s, i) => {
    let more = s.title.trim() || String(i + 1);
    if (taken.has(more)) more = `${more} (${i + 1})`;
    taken.add(more);
    return one(buildSong(s, fileName, more));
  });
}

/**
 * Which of a chosen folder's files the import reads: a plain .txt among presentations is a note
 * beside them, not a song.
 */
export function songFilesOf<T>(files: T[], nameOf: (f: T) => string, folder: boolean): T[] {
  const songs = files.filter((f) => songFormat(nameOf(f)) !== null);
  const text = (f: T) => songFormat(nameOf(f)) === 'text';
  return folder && songs.some((f) => songFormat(nameOf(f)) === 'pptx')
    ? songs.filter((f) => !text(f))
    : songs;
}
