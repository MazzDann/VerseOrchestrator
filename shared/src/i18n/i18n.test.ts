import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EN } from './en.js';
import { fill, pickLang, translate, translatePlural, ukPluralIndex } from './index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SOURCES = ['web/src', 'server/src', 'shared/src', 'builder/src'];

/**
 * Files whose interface text is all translated (0.11.x, one surface per commit): no
 * Cyrillic may stand there outside `tr` / `trn` / `N_` keys and comments — a line that must
 * keep it (a regex, data such as the bundle name «ПС») says `i18n-ignore`.
 */
const TRANSLATED = ['web/src/i18n.ts', 'web/src/components/SettingsPanel.tsx'];

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'dist' ? [] : walk(full);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });

/** Comments out, strings and code kept (a crude lexer: enough for our sources). */
function stripComments(src: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === '\\') out += src[++i] ?? '';
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    out += c;
  }
  return out;
}

const unescape = (s: string) =>
  s.replace(/\\(.)/g, (_, ch: string) => (ch === 'n' ? '\n' : ch === 't' ? '\t' : ch));

interface Key {
  text: string;
  plural: boolean;
  file: string;
  /** where the literal stands in the stripped source: [start, end) */
  at: [number, number];
}

/** The string literal starting at `i` (a quote), or null. */
function literalAt(src: string, i: number): { text: string; end: number } | null {
  const q = src[i];
  if (q !== "'" && q !== '"') return null;
  let j = i + 1;
  while (j < src.length && src[j] !== q) j += src[j] === '\\' ? 2 : 1;
  return { text: unescape(src.slice(i + 1, j)), end: j + 1 };
}

/** Index after the first top-level comma from `i` (inside a call's parentheses), or -1. */
function afterTopComma(src: string, i: number): number {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      for (j++; j < src.length && src[j] !== q; j++) if (src[j] === '\\') j++;
    } else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return -1;
      depth--;
    } else if (c === ',' && depth === 0) return j + 1;
  }
  return -1;
}

const skipSpace = (src: string, i: number) => {
  while (i < src.length && /\s/.test(src[i])) i++;
  return i;
};

function keysOf(file: string, src: string): Key[] {
  const keys: Key[] = [];
  for (const m of src.matchAll(/\b(tr|trn|N_)\(/g)) {
    let i = m.index + m[0].length;
    if (m[1] === 'trn') {
      i = afterTopComma(src, i);
      if (i < 0) continue;
    }
    i = skipSpace(src, i);
    const lit = literalAt(src, i);
    if (lit) keys.push({ text: lit.text, plural: m[1] === 'trn', file, at: [i, lit.end] });
  }
  return keys;
}

const files = SOURCES.flatMap((d) => walk(path.join(ROOT, d))).filter(
  (f) => !f.endsWith(path.join('i18n', 'en.ts')),
);
const sources = new Map(files.map((f) => [f, stripComments(fs.readFileSync(f, 'utf8'))]));
const keys = [...sources].flatMap(([f, src]) => keysOf(path.relative(ROOT, f), src));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('the English interface (0.11.x)', () => {
  it('has an English entry for every key in the code, with the same placeholders', () => {
    const missing = [
      ...new Set(keys.filter((k) => !EN[k.text]).map((k) => `${k.file}: ${k.text}`)),
    ];
    expect(missing).toEqual([]);
    const mismatched = keys
      .filter((k) => EN[k.text])
      .filter((k) =>
        k.plural
          ? k.text.split('|').length !== 3 ||
            EN[k.text].split('|').length !== 2 ||
            k.text.split('|').some((form, i) => {
              const en = EN[k.text].split('|')[Math.min(i, 1)];
              return placeholders(form).join() !== placeholders(en).join();
            })
          : placeholders(k.text).join() !== placeholders(EN[k.text]).join(),
      )
      .map((k) => `${k.file}: ${k.text} → ${EN[k.text]}`);
    expect([...new Set(mismatched)]).toEqual([]);
  });

  it('has no English entry the code no longer uses', () => {
    const used = new Set(keys.map((k) => k.text));
    expect(Object.keys(EN).filter((k) => !used.has(k))).toEqual([]);
  });

  it('leaves no untranslated Ukrainian in the translated files', () => {
    const left: string[] = [];
    for (const rel of TRANSLATED) {
      const file = path.join(ROOT, rel);
      const raw = fs.readFileSync(file, 'utf8');
      // lines that keep Cyrillic on purpose
      const kept = raw
        .split('\n')
        .map((l) => (l.includes('i18n-ignore') ? '' : l))
        .join('\n');
      let src = stripComments(kept);
      // blank out the keys (same length, so later positions hold)
      for (const k of keysOf(rel, src).reverse()) {
        src = src.slice(0, k.at[0]) + ' '.repeat(k.at[1] - k.at[0]) + src.slice(k.at[1]);
      }
      src.split('\n').forEach((line, n) => {
        if (/[Ѐ-ӿ]/.test(line)) left.push(`${rel}:${n + 1}: ${line.trim()}`);
      });
    }
    expect(left).toEqual([]);
  });
});

describe('translating', () => {
  it('fills placeholders and falls back to the Ukrainian', () => {
    expect(fill('На екрані: {ref}', { ref: 'Ів 3:16' })).toBe('На екрані: Ів 3:16');
    expect(fill('{a} і {b}', { a: 1 })).toBe('1 і {b}');
    expect(translate('uk', 'Щось нове')).toBe('Щось нове');
    expect(translate('en', 'Щось, чого немає в словнику')).toBe('Щось, чого немає в словнику');
  });

  it('picks the plural form of each language', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map(ukPluralIndex)).toEqual([
      0, 1, 2, 2, 2, 0, 1, 2, 2,
    ]);
    const forms = '{n} тест|{n} тести|{n} тестів'; // not in the dictionary
    expect(translatePlural('uk', 3, forms)).toBe('3 тести');
    expect(translatePlural('uk', 31102, forms)).toBe(`${(31102).toLocaleString('uk-UA')} тести`);
    // no English entry: the Ukrainian forms stay
    expect(translatePlural('en', 5, forms)).toBe('5 тестів');
  });

  it('takes the first of the preferred languages that the app has', () => {
    expect(pickLang(['en-US', 'uk'])).toBe('en');
    expect(pickLang(['de-DE', 'uk-UA', 'en'])).toBe('uk');
    expect(pickLang(['de-DE', 'fr'])).toBe('uk');
    expect(pickLang([])).toBe('uk');
  });
});
