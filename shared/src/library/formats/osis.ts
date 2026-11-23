import { bookOfOsis } from './books.js';
import { ModuleText, type ParsedModule } from './moduleText.js';
import { strongsOf } from './strongs.js';
import { lastNamed, readXml } from './xml.js';

type Attrs = Record<string, string>;

/** «Bible.X:Gen.1.1!a» → book, chapter, verse — the first of several ids. */
function placeOf(id: string | undefined): [string, number, number] | null {
  const first = id?.trim().split(/\s+/)[0].replace(/^.*:/, '').replace(/!.*$/, '');
  const m = first ? /^([^.]+)\.(\d+)\.(\d+)/.exec(first) : null;
  return m ? [m[1], Number(m[2]), Number(m[3])] : null;
}

/** Elements that stand for a space between words. */
const BREAKS = new Set(['l', 'lb', 'lg', 'p', 'item', 'list', 'row', 'cell', 'div', 'chapter']);
/** Titles that name the book, the chapter or a page, not a section. */
const NAMING = /^(main|chapter|runninghead|booktitle|continued)$/i;

const isJesus = (a: Attrs) => /^jesus$/i.test(a.who ?? '');

export function readOsis(xml: string): ParsedModule {
  const out = new ModuleText();
  /** open elements, the innermost last */
  const stack: { name: string; attrs: Attrs }[] = [];
  /** words of Jesus opened and not closed: elements, and milestones by their ids */
  let quotes = 0;
  const milestones = new Set<string>();
  let description = '';
  let language = '';
  let inHeader = false;
  let book: number | null = null;
  /** the text of something that is no verse's: a note, a title, the header's words */
  let catching: { what: string; depth: number; text: string; attrs: Attrs } | null = null;

  const red = () => {
    out.jesus = quotes + milestones.size > 0;
  };
  const startBook = (id: string) => {
    book = bookOfOsis(id);
    if (book === null) out.skip(id);
    quotes = 0;
    milestones.clear();
    out.startBook();
  };
  const startVerse = (id: string | undefined) => {
    const place = placeOf(id);
    if (!place) return;
    const n = bookOfOsis(place[0]);
    if (n === null) {
      out.endVerse();
      out.skip(place[0]);
      return;
    }
    book = n;
    out.startVerse(n, place[1], place[2]);
  };
  /** what was caught, put where it belongs */
  const caught = (what: string, text: string, attrs: Attrs) => {
    const type = attrs.type ?? '';
    if (inHeader) {
      if (what === 'title') description ||= text;
      else if (!/original|translat|base/i.test(type)) language ||= text;
    } else if (what === 'note') {
      if (!/cross-?reference/i.test(type)) out.note(attrs.n ?? '', text);
    } else if (NAMING.test(type)) {
      if (/^main$/i.test(type) && book !== null && !out.hasBook(book))
        out.name(book, { long: text, short: attrs.short });
    } else if (book !== null) out.title(text);
  };

  readXml(xml, {
    open(name, attrs, empty) {
      if (!empty) stack.push({ name, attrs });
      if (catching) {
        if (!empty && name === catching.what) catching.depth++;
        if (BREAKS.has(name)) catching.text += ' ';
        return;
      }
      if (name === 'osistext') language ||= attrs.lang ?? '';
      else if (name === 'header') inHeader = !empty;
      else if (!empty && (name === 'title' || name === (inHeader ? 'language' : 'note')))
        catching = { what: name, depth: 1, text: '', attrs };
      else if (inHeader) return;
      else if (name === 'verse') {
        if (attrs.eid !== undefined) out.endVerse();
        else startVerse(attrs.osisid ?? attrs.sid);
      } else if (name === 'div' && /^book$/i.test(attrs.type ?? '') && attrs.osisid)
        startBook(attrs.osisid.trim().split(/\s+/)[0]);
      else if (name === 'q' && attrs.eid !== undefined) {
        milestones.delete(attrs.eid);
        red();
      } else if (name === 'q' && isJesus(attrs)) {
        if (attrs.sid !== undefined) milestones.add(attrs.sid);
        else if (!empty) quotes++;
        red();
      } else if (BREAKS.has(name)) out.text(' ');
    },
    close(name) {
      // an unbalanced file: the nearest open one of that name is closed
      const at = lastNamed(stack, name);
      const attrs = at >= 0 ? stack[at].attrs : {};
      if (at >= 0) stack.length = at;
      if (catching) {
        if (name !== catching.what || --catching.depth > 0) return;
        const c = catching;
        catching = null;
        caught(c.what, c.text.replace(/\s+/g, ' ').trim(), c.attrs);
      } else if (name === 'header') inHeader = false;
      else if (inHeader) return;
      else if (name === 'verse') out.endVerse();
      else if (name === 'chapter') out.endVerse();
      else if (name === 'q' && isJesus(attrs) && attrs.sid === undefined) {
        quotes = Math.max(0, quotes - 1);
        red();
      } else if (name === 'w') {
        const lemma = (attrs.lemma ?? '').split(/\s+/).filter((l) => /strong/i.test(l));
        out.strong(
          strongsOf(lemma.join(' ')),
          /robinson:([^\s]+)/i.exec(attrs.morph ?? '')?.[1] ?? '',
        );
      } else if (name === 'div' && /^book$/i.test(attrs.type ?? '')) {
        out.startBook();
        book = null;
      } else if (BREAKS.has(name)) out.text(' ');
    },
    text(s) {
      if (catching) catching.text += s;
      else if (!inHeader) out.text(s);
    },
  });
  return out.finish('osis', { description, language });
}
