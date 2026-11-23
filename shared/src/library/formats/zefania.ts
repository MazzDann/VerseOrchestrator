import { bookOfZefania } from './books.js';
import { ModuleText, type ParsedModule } from './moduleText.js';
import { strongsOf } from './strongs.js';
import { readXml } from './xml.js';

type Attrs = Record<string, string>;

/** Elements whose text is no verse's: read apart (or left out). */
const APART = new Set(['note', 'remark', 'caption', 'prolog', 'xref', 'media']);
/** What INFORMATION says that a module keeps. */
const SAID = new Set(['title', 'language']);

const isRed = (a: Attrs) =>
  /color\s*:\s*(red|#f00\b|#ff0000)/i.test(a.css ?? '') ||
  /\b(jesus|red-?letters?|words-?of-?(christ|jesus))\b/i.test(`${a.fs ?? ''} ${a.id ?? ''}`);

export function readZefania(xml: string): ParsedModule {
  const out = new ModuleText();
  const said: Record<string, string> = {};
  let description = '';
  let book: number | null = null;
  let chapter = 0;
  let inInfo = false;
  /** open STYLE tags (is it red?) and gr tags, the innermost last */
  const styles: boolean[] = [];
  const words: Attrs[] = [];
  let catching: { what: string; depth: number; text: string } | null = null;

  const red = () => {
    out.jesus = styles.includes(true);
  };
  const reset = () => {
    styles.length = 0;
    words.length = 0;
    red();
  };

  readXml(xml, {
    open(name, attrs, empty) {
      if (catching) {
        if (!empty && name === catching.what) catching.depth++;
        else if (name === 'br') catching.text += ' ';
        return;
      }
      if (name === 'xmlbible') description = attrs.biblename ?? '';
      else if (name === 'information') inInfo = !empty;
      else if (inInfo) {
        if (SAID.has(name) && !empty) catching = { what: name, depth: 1, text: '' };
      } else if (name === 'biblebook') {
        out.startBook();
        reset();
        book = bookOfZefania(Number(attrs.bnumber));
        if (book === null) out.skip(attrs.bsname || attrs.bname || attrs.bnumber || '?');
        else out.name(book, { long: attrs.bname, short: attrs.bsname });
      } else if (name === 'chapter') chapter = Number(attrs.cnumber);
      else if (name === 'vers') {
        // a style never goes on past its verse
        reset();
        if (book === null) out.endVerse();
        else if (!empty) out.startVerse(book, chapter, Number(attrs.vnumber));
      } else if (APART.has(name)) {
        if (!empty) catching = { what: name, depth: 1, text: '' };
      } else if (name === 'style') {
        if (!empty) styles.push(isRed(attrs));
        red();
      } else if (name === 'gr') {
        if (empty) out.strong(strongsOf(attrs.str ?? ''), attrs.rmac ?? '');
        else words.push(attrs);
      } else if (name === 'br') out.text(' ');
    },
    close(name) {
      if (catching) {
        if (name !== catching.what || --catching.depth > 0) return;
        const { what, text } = catching;
        catching = null;
        if (inInfo) said[what] ||= text.trim();
        else if (book === null) return;
        else if (what === 'caption') out.title(text);
        else if (what === 'note' || what === 'remark') out.note('', text);
      } else if (name === 'information') inInfo = false;
      else if (name === 'vers') out.endVerse();
      else if (name === 'biblebook') {
        out.startBook();
        book = null;
      } else if (name === 'style') {
        styles.pop();
        red();
      } else if (name === 'gr') {
        const a = words.pop();
        if (a) out.strong(strongsOf(a.str ?? ''), a.rmac ?? '');
      }
    },
    text(s) {
      if (catching) catching.text += s;
      else if (!inInfo) out.text(s);
    },
  });
  return out.finish('zefania', {
    description: said.title || description,
    language: said.language,
  });
}
