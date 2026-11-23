import type { Subheading } from '../moduleFormat.js';
import { bookColor, defaultBookName, type BookName } from './books.js';
import { guessLanguage, isRtl, normalizeLanguage } from './language.js';

/** The text formats a module may come in, beside .SQLite3. */
export type TextFormat = 'usfm' | 'osis' | 'zefania' | 'vpl';

export interface ModuleNote {
  book: number;
  chapter: number;
  verse: number;
  /** the note's letter or sign in the text; '' when the file leaves it to the reader */
  marker: string;
  text: string;
}

/** A text module read: what a .SQLite3 Bible module holds, before it is written anywhere. */
export interface ParsedModule {
  format: TextFormat;
  info: { description: string; language: string; rtl: boolean; hasStrong: boolean };
  books: { number: number; short: string; long: string; color: string }[];
  /** `text` in the modules' own markup: `<J>` the words of Jesus, `<S>` Strong, `<m>` grammar */
  verses: { book: number; chapter: number; verse: number; text: string }[];
  subheadings: Subheading[];
  notes: ModuleNote[];
  /** book codes the library has no number for: their text is left out */
  skipped: string[];
}

/** Text as it may stand among tags: a «<» of its own would open one. */
const escapeText = (s: string) => s.replace(/</g, '‹').replace(/>/g, '›');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

interface Verse {
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

/**
 * Puts a module together as a reader goes through its file: books, the verse being read and its
 * runs, titles (they stand before the next verse), notes. What the readers share, so that a word
 * of Jesus, a Strong number or a verse in two parts comes out the same whatever the format.
 */
export class ModuleText {
  private verses = new Map<string, Verse>();
  private names = new Map<number, Partial<BookName>>();
  private withVerses = new Set<number>();
  private headings: Subheading[] = [];
  private notes: ModuleNote[] = [];
  private skippedCodes = new Set<string>();
  private hasStrong = false;
  private cur: { book: number; chapter: number; verse: number } | null = null;
  private runs: { jesus: boolean; s: string }[] = [];
  private waitingTitles: string[] = [];
  private waitingNotes: { marker: string; text: string }[] = [];
  /** verse 0 — a superscription in some files — is read as a title */
  private asTitle: string | null = null;
  /** the words of Jesus go on until said otherwise (over verses too) */
  jesus = false;

  /** Has the book any verse yet? */
  hasBook(book: number): boolean {
    return this.withVerses.has(book);
  }

  skip(code: string): void {
    if (code) this.skippedCodes.add(code);
  }

  /** A book's names; what was said first stays. */
  name(book: number, name: Partial<BookName>): void {
    const had = this.names.get(book) ?? {};
    this.names.set(book, {
      short: had.short || (name.short && squash(name.short)),
      long: had.long || (name.long && squash(name.long)),
    });
  }

  /** A new book: what waited for a verse of the last one goes with it. */
  startBook(): void {
    this.endVerse();
    this.waitingTitles = [];
    this.waitingNotes = [];
    this.jesus = false;
  }

  startVerse(book: number, chapter: number, verse: number): void {
    this.endVerse();
    if (!(chapter >= 1) || !(verse >= 0)) return;
    if (verse === 0) {
      this.asTitle = '';
      return;
    }
    const at = { book, chapter, verse };
    this.cur = at;
    this.waitingTitles.forEach((title, ord) => this.headings.push({ ...at, ord, title }));
    this.waitingTitles = [];
    for (const n of this.waitingNotes) this.notes.push({ ...at, ...n });
    this.waitingNotes = [];
  }

  /** Is a verse being read (text outside one — an introduction — is no verse's)? */
  get inVerse(): boolean {
    return this.cur !== null || this.asTitle !== null;
  }

  text(s: string): void {
    if (this.asTitle !== null) this.asTitle += s;
    else if (this.cur && s) this.push(escapeText(s));
  }

  private push(s: string): void {
    const last = this.runs[this.runs.length - 1];
    if (last && last.jesus === this.jesus) last.s += s;
    else this.runs.push({ jesus: this.jesus, s });
  }

  /** The word just given has these Strong numbers (and a grammar code). */
  strong(numbers: number[], morph = ''): void {
    if (!this.cur) return;
    for (const n of numbers) {
      this.push(`<S>${n}</S>`);
      this.hasStrong = true;
    }
    const m = morph.replace(/[<>\s]/g, '');
    if (m) this.push(`<m>${m}</m>`);
  }

  title(s: string): void {
    const t = squash(escapeText(s));
    if (!t) return;
    // inside a verse before its first word it is the verse's own (a psalm's superscription)
    if (this.cur && this.runs.every((r) => !r.s.trim()))
      this.headings.push({ ...this.cur, ord: 0, title: t });
    else this.waitingTitles.push(t);
  }

  note(marker: string, s: string): void {
    const text = squash(escapeText(s));
    if (!text) return;
    const sign = marker.trim();
    // «+» asks the reader to number the notes, «-» to show no sign
    const n = { marker: sign === '+' || sign === '-' ? '' : sign, text };
    if (this.cur) this.notes.push({ ...this.cur, ...n });
    else this.waitingNotes.push(n);
  }

  endVerse(): void {
    if (this.asTitle !== null) {
      const title = this.asTitle;
      this.asTitle = null;
      this.title(title);
    }
    if (!this.cur) return;
    const at = this.cur;
    const text = squash(this.runs.map((r) => (r.jesus ? redLetters(r.s) : r.s)).join(''));
    this.cur = null;
    this.runs = [];
    if (!text) return;
    const key = keyOf(at);
    const had = this.verses.get(key);
    // a verse in parts («1a», «1b») is one verse; the very same text again is a repeat
    if (!had) this.verses.set(key, { ...at, text });
    else if (had.text !== text) had.text += ` ${text}`;
    this.withVerses.add(at.book);
  }

  finish(format: TextFormat, said: { description?: string; language?: string } = {}): ParsedModule {
    this.endVerse();
    const verses = [...this.verses.values()].sort(
      (a, b) => a.book - b.book || a.chapter - b.chapter || a.verse - b.verse,
    );
    const language = normalizeLanguage(said.language ?? '') || guessLanguage(sampleOf(verses));
    const books = [...this.withVerses]
      .sort((a, b) => a - b)
      .map((number) => {
        const own = this.names.get(number) ?? {};
        const other = defaultBookName(number, language);
        return {
          number,
          short: own.short || own.long || other.short,
          long: own.long || own.short || other.long,
          color: bookColor(number),
        };
      });
    return {
      format,
      info: {
        description: squash(said.description ?? ''),
        language,
        rtl: isRtl(language),
        hasStrong: this.hasStrong,
      },
      books,
      verses,
      subheadings: numbered(this.headings.filter((h) => this.verses.has(keyOf(h)))),
      notes: this.notes.filter((n) => this.verses.has(keyOf(n))),
      skipped: [...this.skippedCodes],
    };
  }
}

/** The words in red, the spaces around them outside. */
function redLetters(s: string): string {
  const words = s.trim();
  if (!words) return s;
  const at = s.indexOf(words);
  return `${s.slice(0, at)}<J>${words}</J>${s.slice(at + words.length)}`;
}

const keyOf = (p: { book: number; chapter: number; verse: number }) =>
  `${p.book}:${p.chapter}:${p.verse}`;

/** Several titles at one place: 0, 1, … in their order (a verse in parts starts twice). */
function numbered(titles: Subheading[]): Subheading[] {
  const at = new Map<string, number>();
  return titles.map((h) => {
    const ord = at.get(keyOf(h)) ?? 0;
    at.set(keyOf(h), ord + 1);
    return { ...h, ord };
  });
}

/** Text from all over the module, for guessing its language: a hundred or two verses. */
function sampleOf(verses: Verse[]): string {
  const step = Math.max(1, Math.floor(verses.length / 150));
  let out = '';
  for (let i = 0; i < verses.length; i += step) out += `${verses[i].text} `;
  return out.replace(/<(S|m)>[^<]*<\/\1>|<[^>]*>/g, ' ');
}
