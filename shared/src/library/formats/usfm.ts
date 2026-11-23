import { bookOfCode } from './books.js';
import { ModuleText, type ParsedModule } from './moduleText.js';
import { strongsOf } from './strongs.js';
import { lastNamed } from './xml.js';

/** Paragraphs whose text is a name of the book: what `\toc2`, `\h` … say. */
const NAMES = /^(h\d?|toc[123]|mt\d?)$/;
/** Paragraphs that are section titles. */
const TITLES = /^(s\d?|ms\d?|d|sp|qa)$/;
/** Paragraphs that are no text of a verse: the file's own lines, introductions, cross-references. */
const NO_TEXT =
  /^(id|ide|usfm|rem|sts|toca\d|mte\d?|i(?:p|pi|m|mi|pq|mq|pr|q|b|li|ot|o|ex|mte?|e|s)\d?|r|mr|sr|cl|cd|cp|restore|periph|lit|sd\d?)$/;
/** Paragraphs a verse's text goes on in. */
const TEXT =
  /^(p|m|po|pr|cls|pmo|pm|pmc|pmr|pi\d?|mi|nb|pc|ph\d?|b|q\d?|qr|qc|qm\d?|qd|lh|li\d?|lf|lim\d?|tr|t[hc][rc]?\d(-\d)?|pb)$/;
/** Characters' markers whose text is not a verse's: figures, cross-references, other numberings. */
const APART = new Set(['x', 'ex', 'fig', 'rq', 'va', 'vp', 'ca', 'cat', 'pro']);
const NOTES = new Set(['f', 'fe', 'ef']);
/** Books that are no book of the Bible (front and back matter): left out without a word. */
const MATTER = /^(FRT|INT|BAK|CNC|GLO|TDX|NDX|OTH|XX[A-G])$/i;

const MARKER = /\\(\+?)([a-z]+\d*(?:-\d+)?)(\*)?|\\\*/gi;
/** A milestone: `\zaln-s |…\*`, `\qt-e\*`. */
const MILESTONE = /\\([a-z]+\d*)-([se])\s*([^\\]*)\\\*/iy;

const clean = (s: string) => s.replace(/~/g, ' ').replace(/\/\//g, ' ');
const STRONG = /(?:^|[\s|])(?:x-)?strong\s*=\s*"([^"]*)"/i;
const WHO_JESUS = /(?:^|[\s|])who\s*=\s*"jesus"/i;

/** The end of the line `from` is in. */
function lineEnd(s: string, from: number): number {
  const i = s.indexOf('\n', from);
  return i < 0 ? s.length : i;
}

/** A footnote's words: its place (`\fr`) and the markers left out, what `|` adds to a word too. */
function noteText(s: string): string {
  return clean(
    s
      .replace(/\\\+?(?:fr|xo)\s[^\\]*(?:\\\+?(?:fr|xo)\*)?/g, ' ')
      .replace(/\|[^\\]*(?=\\|$)/g, '')
      .replace(/\\fp\s?/g, ' ')
      .replace(/\\\+?[a-z]+\d*(?:\*|\s|(?=\\)|$)/gi, ''),
  );
}

interface Char {
  name: string;
  attrs: string;
}

class UsfmReader {
  private book: number | null = null;
  private chapter = 0;
  /** the paragraph a text belongs to: a verse's, a title's, a name's, none's */
  private para: 'text' | 'title' | 'name' | 'none' = 'none';
  private paraName = '';
  private gathered = '';
  /** the book's names as the file gives them, by marker */
  private names: Record<string, string> = {};
  private chars: Char[] = [];
  private quoted = false;
  private ids = new Set<string>();
  private books = 0;
  private marks = new Map<string, number>();
  /** `\zaln-s`: the Strong numbers of the words up to its end */
  private aligned: number[][] = [];

  constructor(private out: ModuleText) {}

  private red(): void {
    this.out.jesus = this.quoted || this.chars.some((c) => c.name === 'wj');
  }

  /** The paragraph ends: a title or a name gathered goes where it belongs. */
  private endPara(): void {
    if (this.para === 'title' && this.book !== null) this.out.title(clean(this.gathered));
    else if (this.para === 'name' && !this.names[this.paraName])
      this.names[this.paraName] = clean(this.gathered).replace(/\s+/g, ' ').trim();
    this.gathered = '';
  }

  private giveNames(): void {
    const n = this.names;
    if (this.book !== null)
      this.out.name(this.book, {
        short: n.toc3 || n.h || n.toc2,
        long: n.toc2 || n.h || n.toc1 || n.mt || n.mt1,
      });
  }

  endBook(): void {
    this.endPara();
    this.giveNames();
    this.out.startBook();
    this.book = null;
    this.chapter = 0;
    this.names = {};
    this.chars = [];
    this.quoted = false;
    this.para = 'none';
  }

  private startBook(line: string): void {
    this.endBook();
    const [, code, rest] = /^\s*(\S+)\s*(.*)/.exec(line) ?? ['', '', ''];
    const n = bookOfCode(code);
    if (n === null && !MATTER.test(code)) this.out.skip(code.toUpperCase());
    if (n === null || this.out.hasBook(n)) return;
    this.book = n;
    this.books++;
    this.ids.add(rest.replace(/^[-–—\s]+/, '').trim());
  }

  /** What every book's `\id` line says after its code is the translation's name. */
  get description(): string {
    const [only] = this.ids;
    return this.ids.size === 1 && this.books > 1 ? only : '';
  }

  private text(s: string): void {
    if (!s) return;
    const top = this.chars[this.chars.length - 1];
    let shown = s;
    // «word|lemma="…" strong="…"»: past the bar is the marker's own
    const bar = top ? s.indexOf('|') : -1;
    if (top && bar >= 0) {
      top.attrs += s.slice(bar + 1);
      shown = s.slice(0, bar);
    } else if (top?.attrs) return;
    if (this.para === 'text') {
      if (this.book !== null) this.out.text(clean(shown));
    } else if (this.para !== 'none') this.gathered += shown;
  }

  private closeChar(name: string): void {
    const at = lastNamed(this.chars, name);
    if (at < 0) return;
    const { attrs } = this.chars[at];
    this.chars.length = at;
    if (/^w[agh]?$/.test(name) && attrs && this.para === 'text') {
      const strong = STRONG.exec(attrs)?.[1];
      if (strong) this.out.strong(strongsOf(strong, true));
    }
    this.red();
  }

  /** A new paragraph ends the character styles — but words of Jesus closed only further on. */
  private keepRed(s: string, from: number): void {
    const open = this.chars.some((c) => c.name === 'wj');
    this.chars = [];
    if (open) {
      const next = /\\(?:\+?wj(\*)?|c)(?![a-z])/gi;
      next.lastIndex = from;
      if (next.exec(s)?.[1]) this.chars.push({ name: 'wj', attrs: '' });
    }
    this.red();
  }

  /** Where `mark` is next; asked over and over in one file, each stretch of it is searched once. */
  private ahead(s: string, mark: string, from: number): number {
    const known = this.marks.get(mark);
    if (known !== undefined && known >= from) return known;
    const at = s.indexOf(mark, from);
    const next = at < 0 ? Infinity : at;
    this.marks.set(mark, next);
    return next;
  }

  read(s: string): void {
    this.marks.clear();
    const re = new RegExp(MARKER);
    const milestone = new RegExp(MILESTONE);
    let at = 0;
    for (;;) {
      re.lastIndex = at;
      const m = re.exec(s);
      this.text(s.slice(at, m ? m.index : s.length));
      if (!m) break;
      milestone.lastIndex = m.index;
      const ms = milestone.exec(s);
      at = ms ? milestone.lastIndex : this.marker(s, m, re.lastIndex);
      if (ms) this.atMilestone(ms[1], ms[2], ms[3]);
    }
  }

  private atMilestone(name: string, side: string, attrs: string): void {
    if (/^zaln$/i.test(name)) {
      // words aligned to the original's: its number goes after them
      if (side === 's') this.aligned.push(strongsOf(STRONG.exec(attrs)?.[1] ?? '', true));
      else {
        const strong = this.aligned.pop();
        if (strong && this.para === 'text') this.out.strong(strong);
      }
      return;
    }
    if (!/^qt\d?$/i.test(name)) return;
    if (side === 's') this.quoted = this.quoted || WHO_JESUS.test(attrs);
    else this.quoted = false;
    this.red();
  }

  /** One marker; where the reading goes on. */
  private marker(s: string, m: RegExpExecArray, after: number): number {
    if (!m[2]) {
      this.chars.pop(); // «\*»: a milestone without a side ends
      this.red();
      return after;
    }
    const name = m[2].toLowerCase();
    if (m[3]) {
      this.closeChar(name);
      return after;
    }
    // the one space (or line end) after a marker is its own
    const from = /\s/.test(s[after] ?? '') ? after + 1 : after;
    if (name === 'id') {
      const end = lineEnd(s, after);
      this.startBook(s.slice(after, end));
      return end;
    }
    if (name === 'c') {
      const [whole, n] = /^\s*(\d*)[^\s\\]*/.exec(s.slice(after, after + 20)) ?? ['', ''];
      this.endPara();
      this.out.endVerse();
      if (this.chapter === 0) this.giveNames();
      this.chapter = Number(n);
      this.para = 'none';
      this.keepRed(s, after + whole.length);
      return after + whole.length;
    }
    if (name === 'v') {
      const [whole, n] = /^\s*(\d*)[^\s\\]*[ \t]?/.exec(s.slice(after, after + 40)) ?? ['', ''];
      this.endPara();
      this.para = 'text';
      this.chars = this.chars.filter((c) => c.name === 'wj');
      this.aligned = [];
      if (this.book !== null && n) this.out.startVerse(this.book, this.chapter, Number(n));
      return after + whole.length;
    }
    if (name === 'esb') {
      const end = this.ahead(s, '\\esbe', after);
      return end === Infinity ? lineEnd(s, after) : end + 5;
    }
    const kind = TEXT.test(name)
      ? 'text'
      : TITLES.test(name)
        ? 'title'
        : NAMES.test(name)
          ? 'name'
          : NO_TEXT.test(name)
            ? 'none'
            : null;
    if (kind) {
      this.endPara();
      this.keepRed(s, after);
      if (kind === 'text') this.out.text(' ');
      this.para = kind;
      this.paraName = name;
      return from;
    }
    if (NOTES.has(name) || APART.has(name)) {
      const end = this.ahead(s, `\\${m[1]}${name}*`, after);
      // never closed: the marker's line at most
      if (end === Infinity || this.ahead(s, '\\c ', after) < end) return lineEnd(s, after);
      if (NOTES.has(name) && this.book !== null && this.para !== 'none') {
        const [, caller, words] = /^\s*(\S*)\s*([\s\S]*)$/.exec(s.slice(after, end)) ?? [
          '',
          '',
          '',
        ];
        // a note without a caller starts with its first marker
        if (caller.startsWith('\\')) this.out.note('', noteText(`${caller} ${words}`));
        else this.out.note(caller, noteText(words));
      }
      return end + m[1].length + name.length + 2;
    }
    this.chars.push({ name, attrs: '' });
    this.red();
    return from;
  }
}

/** USFM: the books of a module, a file each (or several in one). */
export function readUsfm(files: string[]): ParsedModule {
  const out = new ModuleText();
  const reader = new UsfmReader(out);
  for (const f of files) {
    reader.read(f);
    reader.endBook();
  }
  return out.finish('usfm', { description: reader.description });
}
