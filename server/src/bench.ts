/**
 * Library query benchmark: `npm run bench:db [-- path/to/library.db]`.
 * Runs the app's real queries (the shared createLibrary) against a library file and
 * prints median / p95 latency per query, plus the SQLite query plan of the hot SQL —
 * so indexing and tuning decisions are made from numbers, not guesses.
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { createLibrary } from '@vo/shared';
import { betterSqliteDriver, tuneReadOnly } from './db.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const file = fileArg ?? process.env.LIBRARY_DB ?? path.join(repoRoot, 'data', 'library.db');
const raw = process.argv.includes('--raw'); // skip the read-only tuning, for before/after

const db = new Database(file, { readonly: true, fileMustExist: true });
if (!raw) tuneReadOnly(db);
const lib = createLibrary(betterSqliteDriver(() => db));

const translations = await lib.getTranslations();
const byAbbr = (a: string) => translations.find((t) => t.abbr === a)?.id;
const ukr = byAbbr('UKRK') ?? translations[0].id;
const kjv = byAbbr('KJV+') ?? translations[1]?.id ?? ukr;
const all = translations.map((t) => t.id);

const cases: [string, () => Promise<unknown>][] = [
  ['translations', () => lib.getTranslations()],
  ['books', () => lib.getBooks(ukr)],
  ['chapters', () => lib.getChapters(ukr, 230)],
  ['verses Ps 119', () => lib.getVerses(ukr, 230, 119)],
  ['ref «Ів 3:16»', () => lib.search('Ів 3:16', [ukr])],
  ['ref «іс 4:7» (disambig)', () => lib.search('іс 4:7', [ukr])],
  ['ref «Ів 3:16» ×all', () => lib.search('Ів 3:16', all)],
  ['ref typo «навен 4:1»', () => lib.search('навен 4:1', [ukr])],
  ['fts rare «никодим»', () => lib.search('никодим', [ukr])],
  ['fts common «бог»', () => lib.search('бог', [ukr])],
  ['fts common «бог» ×all', () => lib.search('бог', all)],
  ['fts phrase', () => lib.search('"так бо полюбив"', [ukr])],
  ['strong G2424 search', () => lib.search('G2424', [kjv])],
  ['concordance 2424', () => lib.strongRefs('2424', { translationId: kjv })],
  ['strong def', () => lib.lookupStrong('2424', 500)],
  ['crossrefs', () => lib.getCrossrefs(500, 3, 16)],
  ['commentary', () => lib.getCommentary(500, 3, 16)],
  ['songs «боже»', () => lib.searchSongs('боже')],
];

function pct(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

const size = fs.statSync(file).size / 1048576;
console.log(
  `\n${path.basename(file)} — ${size.toFixed(0)} MB, ${translations.length} translations${raw ? ' (untuned)' : ''}\n`,
);
console.log('query'.padEnd(28), 'median ms'.padStart(10), 'p95 ms'.padStart(9), '  rows');
for (const [name, run] of cases) {
  await run(); // warm-up (statement prepare, page cache)
  const times: number[] = [];
  let rows = 0;
  for (let i = 0; i < 15; i++) {
    const t0 = performance.now();
    const r = (await run()) as { results?: unknown[] } | unknown[];
    times.push(performance.now() - t0);
    rows = Array.isArray(r) ? r.length : (r?.results?.length ?? 0);
  }
  console.log(
    name.padEnd(28),
    pct(times, 50).toFixed(2).padStart(10),
    pct(times, 95).toFixed(2).padStart(9),
    String(rows).padStart(6),
  );
}

if (process.argv.includes('--plan')) {
  const plans: [string, string, unknown[]][] = [
    [
      'locationExists',
      'SELECT 1 FROM verses WHERE book_number = ? AND chapter = ? AND translation_id IN (?) AND verse = ? LIMIT 1',
      [500, 3, ukr, 16],
    ],
    [
      'chapters',
      'SELECT DISTINCT chapter FROM verses WHERE translation_id = ? AND book_number = ? ORDER BY chapter',
      [ukr, 230],
    ],
    [
      'book_names LIKE',
      "SELECT DISTINCT book_number, name_norm FROM book_names WHERE name_norm LIKE ? OR name_norm LIKE ? OR (length(name_norm) >= 2 AND ? LIKE name_norm || '%')",
      ['ів%', '% ів%', 'ів'],
    ],
    [
      'concordance count',
      'SELECT COUNT(*) AS n FROM verse_strongs vs WHERE vs.strong = ? AND vs.translation_id = ?',
      [2424, kjv],
    ],
    [
      'commentary',
      'SELECT source FROM commentaries WHERE book = ? AND (chapter_from < ? OR (chapter_from = ? AND verse_from <= ?)) AND (chapter_to > ? OR (chapter_to = ? AND verse_to >= ?))',
      [500, 3, 3, 16, 3, 3, 16],
    ],
  ];
  for (const [name, sql, params] of plans) {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params) as { detail: string }[];
    console.log(`\n${name}:`);
    for (const p of plan) console.log('   ', p.detail);
  }
}
db.close();
