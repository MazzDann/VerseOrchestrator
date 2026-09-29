import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  convertMyBible,
  createLibrary,
  DROPPED_ID_BASE,
  DROPPED_VERSE_STRIDE,
  droppedId,
  moduleHash,
  ftsFillSql,
  mergeSql,
  ModuleError,
  normalizeForSearch,
  SCHEMA_SQL,
  SEGMENT_NORM_TABLE_SQL,
  type SqlDriver,
  type SyncConn,
} from '@vo/shared';

/**
 * A raw MyBible module dropped into the browser is converted into a segment by the
 * shared converter (the worker runs it on SQLite-WASM; here on better-sqlite3), then
 * merged like any server segment.
 */

let dir: string;
const handles: Database.Database[] = [];
/** Every database a test opens is closed before the temp dir goes (Windows locks files). */
const open = (file: string, opts?: Database.Options) => {
  const db = new Database(file, opts);
  handles.push(db);
  return db;
};

const sync = (db: Database.Database): SyncConn => ({
  all: (sql, p = []) => db.prepare(sql).all(...p) as Record<string, unknown>[],
  prepare: (sql) => {
    const st = db.prepare(sql);
    return { run: (p) => void st.run(...p), done: () => undefined };
  },
});

const driver = (db: Database.Database): SqlDriver => ({
  dialect: 'sqlite',
  all: async (sql, p = []) => db.prepare(sql).all(...p) as never[],
  get: async (sql, p = []) => db.prepare(sql).get(...p) as never,
});

/** A MyBible file with the given DDL/DML. */
function module(name: string, sql: string): Database.Database {
  const db = open(path.join(dir, name));
  db.exec(sql);
  return db;
}

/** Convert `src` into a fresh segment file; returns its path and the summary. */
function convert(src: Database.Database, fileName: string, id: number) {
  const file = path.join(dir, `${fileName}.${id}.vodb`);
  fs.rmSync(file, { force: true });
  const out = new Database(file);
  try {
    out.exec(SCHEMA_SQL);
    out.exec(SEGMENT_NORM_TABLE_SQL);
    const r = out.transaction(() => convertMyBible(sync(src), sync(out), { fileName, id }))();
    return { file, ...r };
  } finally {
    out.close();
  }
}

const BIBLE = `
  CREATE TABLE info (name TEXT, value TEXT);
  INSERT INTO info VALUES ('description', 'Тестова Біблія'), ('language', 'uk'),
    ('strong_numbers', 'true'), ('right_to_left', 'false');
  CREATE TABLE books (book_color TEXT, book_number NUMERIC, short_name TEXT, long_name TEXT);
  INSERT INTO books VALUES ('#fff', 10, 'Бут', 'Буття'), ('#fff', 500, 'Ів', 'Від Івана');
  CREATE TABLE verses (book_number INTEGER, chapter INTEGER, verse INTEGER, text TEXT);
  -- deliberately out of canonical order: ids follow book/chapter/verse
  INSERT INTO verses VALUES
    (500, 3, 16, 'Так бо Бог <S>2316</S> полюбив світ'),
    (10, 1, 1, 'На початку <S>7225</S> створив Бог <S>430</S>'),
    (10, 1, 2, 'А земля була пуста');
`;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-conv-'));
});
afterAll(() => {
  for (const db of handles) if (db.open) db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('MyBible → segment conversion', () => {
  it('a Bible: builder rules for text, markup, search text and Strongs; ids in the dropped range', () => {
    const src = module('TST.SQLite3', BIBLE);
    const id = droppedId(12345);
    const r = convert(src, 'TST.SQLite3', id);
    expect(r).toMatchObject({ kind: 'bible', abbr: 'TST', title: 'Тестова Біблія', items: 3 });
    expect(id).toBeGreaterThanOrEqual(DROPPED_ID_BASE);

    const seg = open(r.file, { readonly: true });
    expect(seg.prepare('SELECT * FROM translations').get()).toMatchObject({
      id,
      abbr: 'TST',
      language: 'uk',
      has_strong: 1,
      source_file: 'TST.SQLite3',
    });
    const verses = seg
      .prepare('SELECT id, book_number, verse, text, text_raw FROM verses ORDER BY id')
      .all() as { id: number }[];
    expect(verses).toEqual([
      {
        id: id * DROPPED_VERSE_STRIDE + 1,
        book_number: 10,
        verse: 1,
        text: 'На початку створив Бог',
        text_raw: 'На початку <S>7225</S> створив Бог <S>430</S>',
      },
      // no markup → text_raw NULL (as the builder stores it)
      {
        id: id * DROPPED_VERSE_STRIDE + 2,
        book_number: 10,
        verse: 2,
        text: 'А земля була пуста',
        text_raw: null,
      },
      {
        id: id * DROPPED_VERSE_STRIDE + 3,
        book_number: 500,
        verse: 16,
        text: 'Так бо Бог полюбив світ',
        text_raw: 'Так бо Бог <S>2316</S> полюбив світ',
      },
    ]);
    expect(seg.prepare('SELECT text_norm FROM verses_norm WHERE id = ?').get(verses[2].id)).toEqual(
      { text_norm: normalizeForSearch('Так бо Бог <S>2316</S> полюбив світ') },
    );
    // OT numbers are Hebrew, NT Greek
    expect(
      seg.prepare('SELECT strong, lang FROM verse_strongs ORDER BY verse_id, strong').all(),
    ).toEqual([
      { strong: 430, lang: 'H' },
      { strong: 7225, lang: 'H' },
      { strong: 2316, lang: 'G' },
    ]);
    expect(
      seg.prepare('SELECT name_norm FROM book_names WHERE book_number = 500 ORDER BY 1').all(),
    ).toEqual([{ name_norm: 'від івана' }, { name_norm: 'ів' }]);
  });

  it('dictionary, commentaries and cross-references', () => {
    const dict = convert(
      module(
        'SD.dictionary.SQLite3',
        `CREATE TABLE info (name TEXT, value TEXT);
         INSERT INTO info VALUES ('description', 'Strong''s');
         CREATE TABLE dictionary (topic TEXT, definition TEXT);
         INSERT INTO dictionary VALUES ('G2316', '<b>θεός</b> — Бог'), ('H7225', 'початок');`,
      ),
      'SD.dictionary.SQLite3',
      droppedId(1),
    );
    expect(dict).toMatchObject({ kind: 'dictionary', abbr: 'SD', title: "Strong's", items: 2 });
    const d = open(dict.file, { readonly: true });
    expect(d.prepare('SELECT is_strong FROM dictionaries').get()).toEqual({ is_strong: 1 });
    expect(
      d.prepare('SELECT topic_norm, strong_lang, definition FROM dictionary_entries').all(),
    ).toEqual([
      { topic_norm: '2316', strong_lang: 'G', definition: 'θεός — Бог' },
      { topic_norm: '7225', strong_lang: 'H', definition: 'початок' },
    ]);

    const com = convert(
      module(
        'MH.commentaries.SQLite3',
        `CREATE TABLE commentaries (book_number NUMERIC, chapter_number_from NUMERIC,
           verse_number_from NUMERIC, chapter_number_to NUMERIC, verse_number_to NUMERIC,
           marker TEXT, text TEXT);
         INSERT INTO commentaries VALUES (500, 3, 16, NULL, NULL, '1', '<p>Любов Божа</p>'),
           (500, 3, 17, 3, 18, '', '   ');`,
      ),
      'MH.commentaries.SQLite3',
      droppedId(2),
    );
    expect(com).toMatchObject({ kind: 'commentaries', abbr: 'MH', items: 1 }); // blank note dropped
    expect(open(com.file).prepare('SELECT * FROM commentaries').get()).toMatchObject({
      source: 'MH',
      chapter_to: 3,
      verse_to: 16,
      text: 'Любов Божа',
    });

    const x = convert(
      module(
        'X.crossreferences.SQLite3',
        `CREATE TABLE cross_references (book INTEGER, chapter INTEGER, verse INTEGER,
           book_to INTEGER, chapter_to INTEGER, verse_to_start INTEGER, verse_to_end INTEGER);
         INSERT INTO cross_references VALUES (500, 3, 16, 450, 5, 8, 8);`,
      ),
      'X.crossreferences.SQLite3',
      droppedId(3),
    );
    expect(x).toMatchObject({ kind: 'crossreferences', items: 1 });
  });

  it('refuses files that are no module we import', () => {
    const src = module('plan.SQLite3', 'CREATE TABLE reading_plan (day INTEGER, reading TEXT);');
    expect(() => convert(src, 'plan.SQLite3', droppedId(4))).toThrow(ModuleError);
  });

  it('merges next to a server segment without id clashes and is searchable', async () => {
    const work = new Database(':memory:');
    work.exec(SCHEMA_SQL);
    // a "server" translation: small ids, as in a built library
    work.exec(`INSERT INTO translations (id, abbr, title, language) VALUES (1, 'KJV', 'King James', 'en');
      INSERT INTO books VALUES (1, 500, 'Jn', 'John', '');
      INSERT INTO verses (id, translation_id, book_number, chapter, verse, text) VALUES
        (1, 1, 500, 3, 16, 'For God so loved the world');
      INSERT INTO verses_fts (rowid, text_norm, tr) VALUES (1, 'for god so loved the world', 't1');`);

    const bytes = fs.readFileSync(path.join(dir, 'TST.SQLite3'));
    const id = droppedId(moduleHash(bytes));
    const seg = convert(open(path.join(dir, 'TST.SQLite3')), 'TST.SQLite3', id);
    work.exec(`ATTACH '${seg.file.replace(/'/g, "''")}' AS seg`);
    for (const sql of mergeSql('seg')) work.exec(sql);
    work.exec(ftsFillSql('seg'));
    work.exec('DETACH seg');

    const lib = createLibrary(driver(work));
    expect((await lib.getTranslations()).map((t) => t.abbr)).toEqual(['KJV', 'TST']);
    expect(work.prepare('SELECT COUNT(*) n FROM verses').get()).toEqual({ n: 4 });
    const hit = (await lib.search('полюбив', [id])).results;
    expect(hit.map((h) => [h.bookNumber, h.chapter, h.verse])).toEqual([[500, 3, 16]]);
    expect((await lib.search('loved', [id])).results).toEqual([]); // still segmented by translation
    expect((await lib.strongRefs('H7225', { translationId: id })).total).toBe(1);
  });

  it('the same file always converts to the same ids; another file to others', () => {
    const bytes = fs.readFileSync(path.join(dir, 'TST.SQLite3'));
    expect(droppedId(moduleHash(bytes))).toBe(droppedId(moduleHash(new Uint8Array(bytes))));
    // a change past the fully hashed 64 KB head, on the sampled stride, is still seen
    const big = new Uint8Array(200_000);
    const changed = big.slice();
    changed[65536 + 61 * 100] = 1;
    expect(moduleHash(changed)).not.toBe(moduleHash(big));
    expect(moduleHash(big.subarray(0, 199_999))).not.toBe(moduleHash(big)); // length counts
    // the FNV-1a constants: one byte hashes as FNV-1a of its length, then the byte («1a»)
    expect(moduleHash(new TextEncoder().encode('a'))).toBe(0x6ceba9c7);
  });
});
