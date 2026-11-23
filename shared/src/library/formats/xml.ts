/**
 * A little XML reader for the module formats (no DOM: it runs in the builder, the server and a
 * worker alike): the tags and the texts in order. Only the named and numeric entities are read —
 * a document's own entities (DTD) are never expanded. Names come in lower case, without a
 * namespace: files differ in both.
 */
export interface XmlHandler {
  /** `empty`: `<tag/>` — no close follows */
  open(name: string, attrs: Record<string, string>, empty: boolean): void;
  close(name: string): void;
  text(s: string): void;
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Entities, each read once («&amp;lt;» is the text «&lt;»). */
function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|(\w{2,8}));/gi, (whole, hex, dec, name) => {
    if (name) return NAMED[name] ?? whole;
    const n = hex ? Number.parseInt(hex, 16) : Number(dec);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  });
}

/** Where the innermost open element of that name is; -1 when none is open. */
export function lastNamed(open: readonly { name: string }[], name: string): number {
  for (let i = open.length - 1; i >= 0; i--) if (open[i].name === name) return i;
  return -1;
}

const local = (name: string) => name.replace(/^.*:/, '').toLowerCase();

/** A tag's end, past the quoted values; -1 when it never ends. */
function tagEnd(s: string, from: number): number {
  let quote = 0;
  for (let i = from; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (quote) {
      if (c === quote) quote = 0;
    } else if (c === 34 || c === 39) quote = c;
    else if (c === 62) return i;
  }
  return -1;
}

function readAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) out[local(m[1])] = decodeEntities(m[2] ?? m[3] ?? '');
  return out;
}

/** Where the reading goes on past `mark`; the text's end when there is none. */
function past(s: string, mark: string, from: number): number {
  const end = s.indexOf(mark, from);
  return end < 0 ? s.length : end + mark.length;
}

export function readXml(s: string, h: XmlHandler): void {
  let at = 0;
  while (at < s.length) {
    const lt = s.indexOf('<', at);
    if (lt < 0) {
      h.text(decodeEntities(s.slice(at)));
      return;
    }
    if (lt > at) h.text(decodeEntities(s.slice(at, lt)));
    if (s.startsWith('<!--', lt)) at = past(s, '-->', lt);
    else if (s.startsWith('<![CDATA[', lt)) {
      at = past(s, ']]>', lt);
      h.text(s.slice(lt + 9, s.startsWith(']]>', at - 3) ? at - 3 : at));
    } else if (s[lt + 1] === '?') at = past(s, '?>', lt);
    else if (s[lt + 1] === '!') {
      // a DOCTYPE, its own declarations in [ … ] included
      const gt = s.indexOf('>', lt);
      const sub = s.indexOf('[', lt);
      at = sub >= 0 && sub < gt ? past(s, ']>', lt) : past(s, '>', lt);
    } else {
      const gt = tagEnd(s, lt + 1);
      if (gt < 0) return;
      const inner = s.slice(lt + 1, gt);
      at = gt + 1;
      const m = /^(\/?)\s*([^\s/]+)/.exec(inner);
      if (!m) continue;
      if (m[1]) h.close(local(m[2]));
      else h.open(local(m[2]), readAttrs(inner.slice(m[0].length)), inner.endsWith('/'));
    }
  }
}
