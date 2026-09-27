import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { createLibrary, normalizeForSearch, SCHEMA_SQL, type Library } from '@vo/shared';
import { betterSqliteDriver } from './db';

/**
 * The shared library queries against a tiny in-memory fixture built with the real
 * schema — first tests for search/reference resolution (previously untested), and the
 * reference behaviour any other engine (sql.js, PGlite) must reproduce.
 */

let lib: Library;

beforeAll(() => {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  const tr = db.prepare(
    'INSERT INTO translations (id, abbr, title, language, rtl, has_strong) VALUES (?, ?, ?, ?, 0, ?)',
  );
  tr.run(1, 'UKR', 'Український переклад', 'uk', 1);
  tr.run(2, 'KJV', 'King James', 'en', 0);

  const book = db.prepare(
    'INSERT INTO books (translation_id, book_number, short_name, long_name, color) VALUES (?, ?, ?, ?, ?)',
  );
  const name = db.prepare(
    'INSERT INTO book_names (translation_id, book_number, name_norm) VALUES (?, ?, ?)',
  );
  const books: [number, number, string, string][] = [
    [1, 60, 'Нав', 'Ісус Навин'],
    [1, 290, 'Іс', 'Ісая'],
    [1, 500, 'Ів', 'Від Івана'],
    [2, 500, 'Jn', 'John'],
  ];
  for (const [t, b, s, l] of books) {
    book.run(t, b, s, l, '');
    for (const n of new Set([normalizeForSearch(s), normalizeForSearch(l)])) name.run(t, b, n);
  }

  const verse = db.prepare(
    `INSERT INTO verses (translation_id, book_number, chapter, verse, text, text_norm, text_raw)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const verses: [number, number, number, number, string, string?][] = [
    [1, 500, 3, 16, 'Так бо Бог полюбив світ', 'Так бо Бог <S>2316</S> полюбив світ'],
    [1, 500, 3, 17, 'Бо Бог не послав Сина', undefined],
    [2, 500, 3, 16, 'For God so loved the world', undefined],
    // Isaiah 4 has 6 verses, Joshua 4 has 24 — for validity disambiguation.
    ...Array.from(
      { length: 6 },
      (_, i) =>
        [1, 290, 4, i + 1, `Ісая чотири ${i + 1}`] as [number, number, number, number, string],
    ),
    ...Array.from(
      { length: 24 },
      (_, i) =>
        [1, 60, 4, i + 1, `Навин чотири ${i + 1}`] as [number, number, number, number, string],
    ),
  ];
  for (const [t, b, c, v, text, raw] of verses) {
    verse.run(t, b, c, v, text, normalizeForSearch(text), raw ?? text);
  }
  db.exec("INSERT INTO verses_fts(verses_fts) VALUES('rebuild')");
  db.prepare(
    'INSERT INTO verse_strongs (translation_id, verse_id, strong) SELECT 1, id, 2316 FROM verses WHERE translation_id = 1 AND book_number = 500 AND verse = 16',
  ).run();

  db.prepare(
    "INSERT INTO dictionaries (id, abbr, name, language, type, is_strong) VALUES (1, 'SH', 'Strong Heb', 'he', 'strong', 1), (2, 'SG', 'Strong Gr', 'el', 'strong', 1)",
  ).run();
  db.prepare(
    "INSERT INTO dictionary_entries (dictionary_id, topic, topic_norm, strong_lang, definition) VALUES (1, 'H2316', '2316', 'H', 'heb def'), (2, 'G2316', '2316', 'G', 'θεός')",
  ).run();
  db.prepare(
    "INSERT INTO songs (id, number, title, title_norm) VALUES (1, 12, 'Боже Вічний', ?)",
  ).run(normalizeForSearch('Боже Вічний'));
  db.prepare(
    "INSERT INTO song_slides (song_id, ord, text, render) VALUES (1, 0, 'Куплет', NULL)",
  ).run();

  lib = createLibrary(betterSqliteDriver(() => db));
});

describe('library queries (shared, engine-agnostic)', () => {
  it('lists translations, books, chapters and verses', async () => {
    expect((await lib.getTranslations()).map((t) => t.abbr)).toEqual(['KJV', 'UKR']);
    expect((await lib.getBooks(1)).map((b) => b.bookNumber)).toEqual([60, 290, 500]);
    expect(await lib.getChapters(1, 500)).toEqual([3]);
    const vs = await lib.getVerses(1, 500, 3);
    expect(vs.map((v) => v.verse)).toEqual([16, 17]);
    expect(vs[0].textRaw).toContain('<S>');
  });

  it('resolves a reference and reads it from the selected translation (cross-language)', async () => {
    const r = await lib.search('Ів 3:16', [2]);
    expect(r.kind).toBe('reference');
    expect(r.results[0]).toMatchObject({ translationId: 2, text: 'For God so loved the world' });
  });

  it('disambiguates «іс» by which book actually has the verse', async () => {
    expect((await lib.search('іс 4:6', [1])).results[0].bookNumber).toBe(290); // Isaiah
    const j = await lib.search('іс 4:7', [1]);
    expect(j.results[0].bookNumber).toBe(60); // Joshua (Isaiah 4 has no v7)
    // a range prefers the book that has the END verse
    expect((await lib.search('іс 4:6-24', [1])).results[0].bookNumber).toBe(60);
    // and offers the other candidate as "did you mean"
    expect((await lib.search('іс 4:1', [1])).suggestions?.map((s) => s.bookNumber)).toContain(60);
  });

  it('falls back to a fuzzy book name for typos', async () => {
    expect((await lib.search('навен 4:1', [1])).results[0]?.bookNumber).toBe(60);
  });

  it('full-text search with prefix, phrase and exclusion', async () => {
    expect((await lib.search('полюб', [1])).results.map((r) => r.verse)).toEqual([16]);
    expect((await lib.search('"бог полюбив"', [1])).results.map((r) => r.verse)).toEqual([16]);
    const ex = await lib.search('бог -сина', [1]);
    expect(ex.results.map((r) => r.verse)).toEqual([16]);
    expect((await lib.search('-лише', [1])).kind).toBe('empty');
  });

  it('Strong lookup prefers Hebrew in the OT and Greek in the NT; concordance + G search', async () => {
    expect((await lib.lookupStrong('2316', 500))[0].definition).toBe('θεός');
    expect((await lib.lookupStrong('2316', 60))[0].definition).toBe('heb def');
    const refs = await lib.strongRefs('G2316', { translationId: 1 });
    expect(refs).toMatchObject({ strong: 2316, total: 1, truncated: false });
    expect((await lib.search('G2316', [1])).results[0].verse).toBe(16);
  });

  it('songs by number prefix and by title', async () => {
    expect((await lib.searchSongs('1')).map((s) => s.number)).toEqual([12]);
    expect((await lib.searchSongs('вічн')).map((s) => s.title)).toEqual(['Боже Вічний']);
    expect((await lib.getSong(1))?.slides).toEqual([{ text: 'Куплет', style: null }]);
  });

  it('optional tables absent → empty, not an error', async () => {
    expect(await lib.getCrossrefs(500, 3, 16)).toEqual([]);
    expect(await lib.getCommentary(500, 3, 16)).toEqual([]);
  });
});
