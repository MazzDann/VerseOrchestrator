/**
 * Quotes from Wikiquote (1.19.0-beta.10, the author: «if possible even quotes search in internet»): the
 * MediaWiki API of uk. or en.wikiquote.org, no key — a search finds pages, their wikitext gives the
 * quotes (a page's top-level «* …» lines), the ones with the words searched for first. Wikiquote's texts
 * are CC BY-SA: each quote carries «author · Вікіцитати» for the slide's reference line.
 */
export type QuoteLang = 'uk' | 'en';

export interface FoundQuote {
  text: string;
  /** the page: a person, a book, a film */
  author: string;
  page: string;
  /** the slide's reference line: who and where from */
  credit: string;
}

export type QuoteRefusal = 'query' | 'failed';

const UA = 'VerseOrchestrator/1.19 (https://github.com/MazzDann/VerseOrchestrator)';
const MAX = 30;

/**
 * No references and comments — on a whole page before it is split into lines (one over several lines
 * left its inner lines as «quotes» — review); bounded, so an unclosed one doesn't rescan the page
 */
const withoutNotes = (s: string) =>
  s
    .replace(/<ref[^>]{0,500}\/>/gi, '')
    .replace(/<ref[^>]{0,500}>[\s\S]{0,5000}?<\/ref>/gi, '')
    .replace(/<!--[\s\S]{0,5000}?-->/g, '');

/** wiki markup still in a quote (a broken template, an odd brace): not a quote for a slide */
const MARKUP_LEFT = /\{\{|\}\}|\[\[|\]\]/;

/** Wikitext → words: links to their text, no references, templates, files, bold or italics. */
export function plainWiki(s: string): string {
  let t = withoutNotes(s);
  // templates, innermost first
  for (let i = 0; i < 5 && /\{\{[^{}]*\}\}/.test(t); i++) t = t.replace(/\{\{[^{}]*\}\}/g, '');
  t = t
    .replace(/\[\[(?:File|Файл|Image|Зображення|Category|Категорія):[^\]]{0,500}\]\]/gi, '') // i18n-ignore: wiki markup
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1')
    .replace(/\[https?:\/\/\S+\]/g, '')
    .replace(/'{2,5}/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ');
  return t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

// the wiki's own words (not the interface's): a {{Q}} template's parameters, the headings of what
// isn't a person's words (\s, not \b: JavaScript's \b knows Latin letters only), a template's line
const QUOTE = 'цитата'; // i18n-ignore: wiki markup
const AUTHOR = 'автор'; // i18n-ignore: wiki markup
const NOT_THEIRS =
  /^(про\s|quotes about|about\s|див\.|дивіться також|see also|посилання|external links|джерела|sources|примітки|notes|література)/i; // i18n-ignore: wiki markup
const TEMPLATE_LINE = /^\s*\{\{\s*(Q|Цитата)\s*\|/i; // i18n-ignore: wiki markup

/** A page that only lists other pages («Шевченко» → the people of that name): no quotes there. */
export const isDisambiguation = (wikitext: string) =>
  // (no \b after a Cyrillic word: JavaScript's \b knows Latin letters only)
  /\{\{\s*(disambig|dab|неоднозначність|багатозначність|значення)\s*[|}]/iu.test(wikitext) || // i18n-ignore: wiki markup
  /\bmay refer to\b/i.test(wikitext.slice(0, 600));

/**
 * The {{Q …}} templates of a page (uk.wikiquote's way: «| Цитата = …», «| Автор = …», each on its own
 * page of a theme): the quote and its author.
 */
function templateQuotes(wikitext: string): { text: string; author?: string }[] {
  const out: { text: string; author?: string }[] = [];
  const open = /\{\{\s*(Q|Цитата)\s*\|/gi; // i18n-ignore: wiki markup
  let m: RegExpExecArray | null;
  while ((m = open.exec(wikitext))) {
    // its end: the }} that closes it, past templates inside (links counted apart: a stray [[ or ]]
    // in a quote doesn't hide the rest of the page — review); a template longer than 20 000
    // characters is no quote
    let braces = 0;
    let end = -1;
    const stop = Math.min(wikitext.length - 1, m.index + 20_000);
    for (let i = m.index; i < stop; i++) {
      const two = wikitext.slice(i, i + 2);
      if (two === '{{') {
        braces++;
        i++;
      } else if (two === '}}') {
        braces--;
        i++;
        if (braces === 0) {
          end = i - 1;
          break;
        }
      }
    }
    if (end < 0) {
      open.lastIndex = m.index + m[0].length;
      continue;
    }
    const body = wikitext.slice(m.index + m[0].length, end);
    open.lastIndex = end;
    // its parameters: «|» at the top level only (not inside [[a|b]] or {{…}})
    const params: string[] = [];
    let level = 0;
    let from = 0;
    for (let i = 0; i < body.length; i++) {
      const two = body.slice(i, i + 2);
      if (two === '{{' || two === '[[') level++;
      else if (two === '}}' || two === ']]') level--;
      else if (body[i] === '|' && level === 0) {
        params.push(body.slice(from, i));
        from = i + 1;
      }
    }
    params.push(body.slice(from));
    const named: Record<string, string> = {};
    params.forEach((p, i) => {
      const eq = /^\s*([^=|]{1,20}?)\s*=\s*([\s\S]*)$/.exec(p);
      if (eq) named[eq[1].toLowerCase()] = eq[2];
      else if (i === 0) named[QUOTE] = p;
    });
    const text = plainWiki(named[QUOTE] ?? named['quote'] ?? '');
    const author = plainWiki(named[AUTHOR] ?? named['author'] ?? '');
    if (text) out.push({ text, ...(author ? { author } : {}) });
  }
  return out;
}

/**
 * A page's quotes: its {{Q …}} templates, and its top-level «* …» lines (a «** …» line under one is
 * its source, left out); sensible lengths only. The sections about the person («Про …», «Quotes about
 * …») and the links at the end are not the person's words — left out (a theme page's «Цитати про …»
 * are its quotes, kept).
 */
export function quotesOf(page: string, title = ''): { text: string; author?: string }[] {
  if (isDisambiguation(page)) return [];
  const wikitext = withoutNotes(page);
  const out = templateQuotes(wikitext);
  // a theme's page («Hope»): the «** …» line under a quote starts with its author's link; on a
  // person's page that line is the source (a book, a speech) — the page is the author
  let last: { text: string; author?: string } | null = null;
  let skip = false;
  for (const line of wikitext.split('\n')) {
    const sub = /^\*\*(?!\*)\s*(.+)$/.exec(line);
    if (sub) {
      const lead = /^\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(sub[1]);
      const name = lead ? plainWiki(lead[2] ?? lead[1]) : '';
      if (last && !last.author && name && name.toLowerCase() !== title.toLowerCase())
        last.author = name.slice(0, 120);
      continue;
    }
    const heading = /^==+\s*(.*?)\s*==+\s*$/.exec(line);
    if (heading) {
      last = null;
      skip = NOT_THEIRS.test(heading[1]);
      continue;
    }
    if (skip) continue;
    const m = /^\*(?!\*)\s*(.+)$/.exec(line);
    if (!m || TEMPLATE_LINE.test(m[1])) continue;
    const text = plainWiki(m[1]);
    last = text ? { text } : null;
    if (last) out.push(last);
  }
  return out.filter(
    (q) => q.text.length >= 15 && q.text.length <= 600 && !MARKUP_LEFT.test(q.text),
  );
}

const wikiquote = (lang: QuoteLang) => `https://${lang}.wikiquote.org`;

export async function searchQuotes(
  q: string,
  lang: QuoteLang,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ quotes: FoundQuote[] } | { refused: QuoteRefusal }> {
  const query = q.trim().slice(0, 200);
  if (!query) return { refused: 'query' };
  const get = opts.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
  const api = async (params: Record<string, string>) => {
    const res = await get(
      `${wikiquote(lang)}/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`,
      { signal, headers: { 'User-Agent': UA, Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(String(res.status));
    return res.json() as Promise<Record<string, unknown>>;
  };
  try {
    const found = (await api({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: '5',
      srprop: '',
    })) as {
      query?: { search?: { title: string }[] };
    };
    const titles = (found.query?.search ?? []).map((s) => s.title).slice(0, 3);
    // the words that say something (3 letters and more) — or all of them, when every one is short («Ян»)
    const all = query
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    const long = all.filter((w) => w.length >= 3);
    const words = long.length > 0 ? long : all;
    const site = lang === 'uk' ? 'Вікіцитати' : 'Wikiquote'; // i18n-ignore: the site's own name
    // a page that doesn't answer leaves the others (review); none answers: refused
    const settled = await Promise.allSettled(
      titles.map(async (title) => {
        const p = (await api({
          action: 'parse',
          page: title,
          prop: 'wikitext',
          redirects: '1',
        })) as {
          parse?: { title?: string; wikitext?: string };
        };
        return { title: p.parse?.title ?? title, text: p.parse?.wikitext ?? '' };
      }),
    );
    const pages = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    if (titles.length > 0 && pages.length === 0) return { refused: 'failed' };
    const matching: FoundQuote[] = [];
    const rest: FoundQuote[] = [];
    for (const { title, text } of pages) {
      // a search for a name: that page's quotes are all the person's — the words needn't be in them
      const named = words.length > 0 && words.every((w) => title.toLowerCase().includes(w));
      for (const quote of quotesOf(text, title)) {
        // a theme page names each quote's author; a person's page is the author
        const author = (quote.author ?? title).slice(0, 160);
        const found: FoundQuote = {
          text: quote.text,
          author,
          page: `${wikiquote(lang)}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
          credit: `${author} · ${site}`,
        };
        const lower = quote.text.toLowerCase();
        if (words.some((w) => lower.includes(w))) matching.push(found);
        else if (named) rest.push(found);
      }
    }
    return { quotes: [...matching, ...rest].slice(0, MAX) };
  } catch {
    return { refused: 'failed' };
  }
}
