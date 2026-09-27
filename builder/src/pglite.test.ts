import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLibrary,
  ftsFillSql,
  loadSegmentPg,
  mergeSql,
  normalizeForSearch,
  PG_SCHEMA_SQL,
  pgPlaceholders,
  SCHEMA_SQL,
  tsQuery,
  type Library,
  type SearchResult,
  type SqlDriver,
  type SyncConn,
} from '@vo/shared';
import { buildSegments } from './segments';

/**
 * The hybrid-DB claim in one test: the same segments loaded into SQLite and into
 * PostgreSQL (PGlite, the engine the browser runs), the same shared queries on both —
 * the answers must agree. Text-search ORDER may differ (bm25 vs ts_rank), so text hits
 * are compared as sets.
 */

let dir: string;
let pg: PGlite;
let sqlite: Library;
let postgres: Library;

const sqliteDriver = (db: Database.Database): SqlDriver => ({
  dialect: 'sqlite',
  all: async (sql, p = []) => db.prepare(sql).all(...p) as never[],
  get: async (sql, p = []) => db.prepare(sql).get(...p) as never,
});

const pgDriver = (db: PGlite): SqlDriver => ({
  dialect: 'postgres',
  all: async (sql, p = []) => (await db.query(pgPlaceholders(sql), p)).rows as never[],
  get: async (sql, p = []) => (await db.query(pgPlaceholders(sql), p)).rows[0] as never,
});

const sync = (db: Database.Database): SyncConn => ({
  all: (sql, p = []) => db.prepare(sql).all(...p) as Record<string, unknown>[],
  prepare: (sql) => {
    const st = db.prepare(sql);
    return { run: (p) => void st.run(...p), done: () => undefined };
  },
});

function fixtureLibrary(file: string): void {
  const db = new Database(file);
  db.exec(SCHEMA_SQL);
  const tr = db.prepare(
    'INSERT INTO translations (id, abbr, title, language, rtl, has_strong) VALUES (?, ?, ?, ?, 0, ?)',
  );
  tr.run(1, 'UKR', 'Український переклад', 'uk', 1);
  tr.run(2, 'KJV', 'King James', 'en', 0);
  const book = db.prepare('INSERT INTO books VALUES (?, ?, ?, ?, ?)');
  const name = db.prepare('INSERT INTO book_names VALUES (?, ?, ?)');
  for (const [t, b, s, l] of [
    [1, 60, 'Нав', 'Ісус Навин'],
    [1, 290, 'Іс', 'Ісая'],
    [1, 500, 'Ів', 'Від Івана'],
    [2, 500, 'Jn', 'John'],
  ] as [number, number, string, string][]) {
    book.run(t, b, s, l, '');
    for (const n of new Set([normalizeForSearch(s), normalizeForSearch(l)])) name.run(t, b, n);
  }
  const verse = db.prepare(
    'INSERT INTO verses (translation_id, book_number, chapter, verse, text, text_raw) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const fts = db.prepare('INSERT INTO verses_fts (rowid, text_norm, tr) VALUES (?, ?, ?)');
  const rows: [number, number, number, number, string, string | null][] = [
    [1, 500, 3, 16, 'Так бо Бог полюбив світ', 'Так бо Бог <S>2316</S> полюбив світ'],
    [1, 500, 3, 17, 'Бо Бог не послав Сина', null],
    [2, 500, 3, 16, 'For God so loved the world', null],
    ...Array.from(
      { length: 6 },
      (_, i) =>
        [1, 290, 4, i + 1, `Ісая чотири ${i + 1}`, null] as [
          number,
          number,
          number,
          number,
          string,
          null,
        ],
    ),
    ...Array.from(
      { length: 24 },
      (_, i) =>
        [1, 60, 4, i + 1, `Навин чотири ${i + 1}`, null] as [
          number,
          number,
          number,
          number,
          string,
          null,
        ],
    ),
  ];
  for (const [t, b, c, v, text, raw] of rows) {
    const id = verse.run(t, b, c, v, text, raw).lastInsertRowid;
    fts.run(id, normalizeForSearch(raw ?? text), `t${t}`);
  }
  db.exec(`INSERT INTO verse_strongs SELECT 2316, 'G', 1, id FROM verses WHERE translation_id = 1 AND book_number = 500 AND verse = 16;
    INSERT INTO verse_strongs SELECT 2316, 'H', 1, id FROM verses WHERE translation_id = 1 AND book_number = 60 AND chapter = 4 AND verse = 1;
    INSERT INTO dictionaries VALUES (1, 'SG', 'Strong Greek', 'el', 'strong', 1), (2, 'SH', 'Strong Hebrew', 'he', 'strong', 1), (3, 'BD', 'Біблійний словник', 'uk', 'explanatory', 0);
    INSERT INTO dictionary_entries VALUES (1, 'G2316', '2316', 'G', 'θεός'), (2, 'H2316', '2316', 'H', 'אֱלֹהִים'), (3, 'Любов', 'любов', '', 'Основа всього');
    INSERT INTO cross_references VALUES (500, 3, 16, 450, 5, 8, 8), (500, 3, 16, 690, 4, 9, 10);
    INSERT INTO commentaries VALUES ('MH', 500, 3, 14, 3, 18, '1', 'Про любов Божу'), ('MH', 500, 4, 1, 4, 1, '', 'Інше');
    INSERT INTO songs VALUES (1, 12, 'Боже Вічний', 'боже вічний'), (2, 120, 'Слава', 'слава');
    INSERT INTO song_slides VALUES (1, 0, 'Боже Вічний, Боже сили', '{"bg":"#000"}'), (1, 1, 'Другий куплет', NULL);`);
  db.close();
}

const gunzip = (file: string) => zlib.gunzipSync(fs.readFileSync(path.join(dir, 'segments', file)));

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-pg-'));
  const libPath = path.join(dir, 'library.db');
  fixtureLibrary(libPath);
  const manifest = buildSegments(libPath, path.join(dir, 'segments'));

  // SQLite: what the SQLite-WASM engine does (ATTACH + merge + FTS fill)
  const work = new Database(':memory:');
  work.exec(SCHEMA_SQL);
  // PostgreSQL: what the PGlite engine does (read the segment with SQLite, bulk-load)
  pg = new PGlite();
  await pg.exec(PG_SCHEMA_SQL);
  for (const s of manifest.segments) {
    const raw = gunzip(s.file);
    const tmp = path.join(dir, `${s.file}.db`);
    fs.writeFileSync(tmp, raw);
    work.exec(`ATTACH '${tmp.replace(/'/g, "''")}' AS seg`);
    for (const sql of mergeSql('seg')) work.exec(sql);
    try {
      work.exec(ftsFillSql('seg'));
    } catch {
      /* no verses_norm in non-translation segments */
    }
    work.exec('DETACH seg');
    const seg = new Database(raw);
    await loadSegmentPg(sync(seg), pg);
    seg.close();
  }
  sqlite = createLibrary(sqliteDriver(work));
  postgres = createLibrary(pgDriver(pg));
}, 60_000);

afterAll(async () => {
  await pg?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const key = (r: SearchResult) => `${r.translationId}:${r.bookNumber}:${r.chapter}:${r.verse}`;
const asSet = (rs: SearchResult[]) => rs.map(key).sort();

describe('PostgreSQL (PGlite) answers like SQLite', () => {
  it('translations, books, chapters, verses', async () => {
    expect(await postgres.getTranslations()).toEqual(await sqlite.getTranslations());
    expect(await postgres.getBooks(1)).toEqual(await sqlite.getBooks(1));
    expect(await postgres.getChapters(1, 60)).toEqual(await sqlite.getChapters(1, 60));
    const v = await postgres.getVerses(1, 500, 3);
    expect(v).toEqual(await sqlite.getVerses(1, 500, 3));
    expect(v[0].textRaw).toContain('<S>2316</S>');
  });

  it('references: cross-language, validity disambiguation, fuzzy book names, suggestions', async () => {
    for (const [q, ids] of [
      ['Ів 3:16', [1, 2]],
      ['john 3:16', [1]],
      ['іс 4:6', [1]],
      ['іс 4:7', [1]],
      ['іс 4:6-24', [1]],
      ['навен 4:2', [1]],
      ['Ів 3', [1]],
    ] as [string, number[]][]) {
      expect(await postgres.search(q, ids), q).toEqual(await sqlite.search(q, ids));
    }
    expect(await postgres.resolveBookCandidates('ів')).toEqual(
      await sqlite.resolveBookCandidates('ів'),
    );
  });

  it('full-text search: prefix, phrase, exclusion, per-translation filter', async () => {
    for (const [q, ids] of [
      ['бог', [1]],
      ['бог', [1, 2]],
      ['полюб', [1]],
      ['"бог полюбив"', [1]],
      ['"полюбив бог"', [1]],
      ['бог -послав', [1]],
      ['бог !"полюбив світ"', [1]],
      ['чотири', [1]],
      ['loved', [1]],
      ['loved world', [2]],
      ['-бог', [1]],
    ] as [string, number[]][]) {
      const a = await sqlite.search(q, ids);
      const b = await postgres.search(q, ids);
      expect(b.kind, q).toBe(a.kind);
      expect(asSet(b.results), q).toEqual(asSet(a.results));
    }
    expect((await postgres.search('чотири', [1])).results).toHaveLength(30);
  });

  it('Strong numbers: lookup (H/G by testament), concordance, G-search', async () => {
    expect(await postgres.lookupStrong('2316', 500)).toEqual(
      await sqlite.lookupStrong('2316', 500),
    );
    expect((await postgres.lookupStrong('2316', 10))[0].topic).toBe('H2316');
    expect(await postgres.strongRefs('G2316')).toEqual(await sqlite.strongRefs('G2316'));
    expect(await postgres.strongRefs('2316', { translationId: 1 })).toEqual(
      await sqlite.strongRefs('2316', { translationId: 1 }),
    );
    expect(await postgres.search('G2316', [1])).toEqual(await sqlite.search('G2316', [1]));
    expect(await postgres.lookupWord('любов')).toEqual(await sqlite.lookupWord('любов'));
    expect(await postgres.listDictionaries()).toEqual(await sqlite.listDictionaries());
  });

  it('cross-references, commentaries, songs', async () => {
    expect(await postgres.getCrossrefs(500, 3, 16)).toEqual(await sqlite.getCrossrefs(500, 3, 16));
    expect(await postgres.getCommentary(500, 3, 16)).toEqual(
      await sqlite.getCommentary(500, 3, 16),
    );
    for (const q of ['', '1', '12', 'вічн', 'нема'])
      expect(await postgres.searchSongs(q), q).toEqual(await sqlite.searchSongs(q));
    expect(await postgres.getSong(1)).toEqual(await sqlite.getSong(1));
  });

  it('builds tsqueries from the same clauses as FTS5', () => {
    expect(tsQuery('бог -послав')).toBe("'бог':* & !('послав':*)");
    expect(tsQuery('"бог полюбив" світ')).toBe("('бог' <-> 'полюбив') & 'світ':*");
    expect(tsQuery('-лише')).toBeNull();
    expect(pgPlaceholders("SELECT ? , '?' , ?")).toBe("SELECT $1 , '?' , $2");
  });

  // last: it loads data again
  it('the same rows loaded twice: COPY clashes, the load is redone skipping duplicates', async () => {
    const count = async () =>
      (await pg.query<{ n: number }>('SELECT count(*)::int AS n FROM verses')).rows[0].n;
    const before = await count();
    const seg = new Database(gunzip('t-1.vodb.gz'));
    await expect(loadSegmentPg(sync(seg), pg)).resolves.toBe(32); // UKR verses: Ів 3:16-17, Іс 4:1-6, Нав 4:1-24
    seg.close();
    expect(await count()).toBe(before);
    expect(asSet((await postgres.search('бог', [1])).results)).toEqual(
      asSet((await sqlite.search('бог', [1])).results),
    );
    // nothing left behind by the failed fast path
    const temp = await pg.query("SELECT 1 FROM pg_class WHERE relname LIKE 'vo_%stage'");
    expect(temp.rows).toEqual([]);
  });
});
