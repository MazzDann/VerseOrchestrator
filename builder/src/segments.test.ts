import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLibrary,
  FTS_INSERT_SQL,
  ftsFillSql,
  ftsRow,
  ftsSourceSql,
  mergeSql,
  normalizeForSearch,
  SCHEMA_SQL,
  type SegmentManifest,
  type SqlDriver,
} from '@vo/shared';
import { buildSegments } from './segments';

let dir: string;
let manifest: SegmentManifest;

const driver = (db: Database.Database): SqlDriver => ({
  dialect: 'sqlite',
  all: async (sql, p = []) => db.prepare(sql).all(...p) as never[],
  get: async (sql, p = []) => db.prepare(sql).get(...p) as never,
});

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-seg-'));
  const libPath = path.join(dir, 'library.db');
  const db = new Database(libPath);
  db.exec(SCHEMA_SQL);
  db.exec(`INSERT INTO translations (id, abbr, title, language, has_strong) VALUES
    (1, 'UKR', 'Український', 'uk', 1), (2, 'KJV', 'King James', 'en', 0)`);
  db.exec(`INSERT INTO books VALUES (1, 500, 'Ів', 'Від Івана', ''), (2, 500, 'Jn', 'John', '')`);
  db.exec(
    `INSERT INTO book_names VALUES (1, 500, 'ів'), (1, 500, 'від івана'), (2, 500, 'jn'), (2, 500, 'john')`,
  );
  const v = db.prepare(
    'INSERT INTO verses (id, translation_id, book_number, chapter, verse, text, text_raw) VALUES (?, ?, 500, 3, 16, ?, ?)',
  );
  const f = db.prepare('INSERT INTO verses_fts (rowid, text_norm, tr) VALUES (?, ?, ?)');
  // non-contiguous global ids, as in a real multi-translation library
  for (const [id, t, text, raw] of [
    [101, 1, 'Так бо Бог полюбив світ', 'Так бо Бог <S>2316</S> полюбив світ'],
    [900, 2, 'For God so loved the world', null],
  ] as [number, number, string, string | null][]) {
    v.run(id, t, text, raw);
    f.run(id, normalizeForSearch(raw ?? text), `t${t}`);
  }
  db.exec(`INSERT INTO verse_strongs VALUES (2316, 'G', 1, 101)`);
  db.exec(`INSERT INTO dictionaries VALUES (1, 'Strong', 'Strong', 'en', 'strong', 1)`);
  db.exec(`INSERT INTO dictionary_entries VALUES (1, 'G2316', '2316', 'G', 'θεός')`);
  db.exec(`INSERT INTO songs VALUES (1, 12, 'Боже Вічний', 'боже вічний', 'ПС')`);
  db.close();
  manifest = buildSegments(libPath, path.join(dir, 'segments'));
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const gunzip = (file: string) => zlib.gunzipSync(fs.readFileSync(path.join(dir, 'segments', file)));

describe('library segments', () => {
  it('writes one segment per translation / dictionary plus study & songs, with sizes and hashes', () => {
    expect(manifest.segments.map((s) => `${s.kind}:${s.abbr}`)).toEqual([
      'translation:UKR',
      'translation:KJV',
      'dictionary:Strong',
      'study:study',
      'songs:songs',
    ]);
    for (const s of manifest.segments) {
      const gz = fs.readFileSync(path.join(dir, 'segments', s.file));
      expect(s.bytes).toBe(gz.length);
      expect(s.sha256).toBe(createHash('sha256').update(gz).digest('hex'));
      expect(s.rawBytes).toBe(zlib.gunzipSync(gz).length);
    }
    // an empty study segment still appears (no rows) — songs has its row
    expect(manifest.segments.find((s) => s.kind === 'songs')?.items).toBe(1);
  });

  it('a translation segment is a working library on its own (after filling its FTS)', async () => {
    const seg = new Database(gunzip('t-1.vodb.gz'));
    expect(seg.prepare('SELECT COUNT(*) n FROM verses_fts').get()).toEqual({ n: 0 }); // no index shipped
    seg.exec(ftsFillSql('main'));
    const lib = createLibrary(driver(seg));
    expect((await lib.getTranslations()).map((t) => t.abbr)).toEqual(['UKR']);
    expect((await lib.getVerses(1, 500, 3))[0]).toMatchObject({
      verse: 16,
      textRaw: expect.stringContaining('<S>'),
    });
    expect((await lib.search('полюбив', [1])).results[0].translationId).toBe(1);
    expect((await lib.strongRefs('G2316', { translationId: 1 })).total).toBe(1);
  });

  it('translation segments ship normalized text; SQL fill = JS fill', async () => {
    const seg = new Database(gunzip('t-1.vodb.gz'));
    expect(seg.prepare('SELECT id, text_norm FROM verses_norm').all()).toEqual([
      { id: 101, text_norm: normalizeForSearch('Так бо Бог <S>2316</S> полюбив світ') },
    ]);
    const tmp = path.join(dir, 't1.sql.db');
    fs.writeFileSync(tmp, gunzip('t-1.vodb.gz'));
    const work = new Database(':memory:');
    work.exec(SCHEMA_SQL);
    work.exec(`ATTACH '${tmp.replace(/'/g, "''")}' AS seg`);
    for (const sql of mergeSql('seg')) work.exec(sql);
    work.exec(ftsFillSql('seg'));
    work.exec('DETACH seg');
    const lib = createLibrary(driver(work));
    expect((await lib.search('полюбив', [1])).results.map((r) => r.verse)).toEqual([16]);
  });

  it('segments merge into one working DB (what a browser engine does)', async () => {
    const work = new Database(':memory:');
    work.exec(SCHEMA_SQL);
    const ins = work.prepare(FTS_INSERT_SQL);
    for (const file of ['t-1.vodb.gz', 't-2.vodb.gz', 'd-1.vodb.gz']) {
      const tmp = path.join(dir, `${file}.db`);
      fs.writeFileSync(tmp, gunzip(file));
      work.exec(`ATTACH '${tmp.replace(/'/g, "''")}' AS seg`);
      for (const sql of mergeSql('seg')) work.exec(sql);
      const rows = work.prepare(ftsSourceSql('seg')).all() as Parameters<typeof ftsRow>[0][];
      for (const r of rows) ins.run(...ftsRow(r));
      work.exec('DETACH seg');
    }
    const lib = createLibrary(driver(work));
    expect((await lib.getTranslations()).map((t) => t.abbr)).toEqual(['KJV', 'UKR']);
    const both = await lib.search('Ів 3:16', [1, 2]);
    expect(both.results.map((r) => r.text)).toEqual([
      'Так бо Бог полюбив світ',
      'For God so loved the world',
    ]);
    expect((await lib.search('loved', [2])).results[0].bookNumber).toBe(500);
    expect((await lib.search('loved', [1])).results).toEqual([]); // segmented FTS still per translation
    expect((await lib.lookupStrong('2316', 500))[0].definition).toBe('θεός');
    // global verse ids survived the merge
    expect(work.prepare('SELECT id FROM verses ORDER BY id').all()).toEqual([
      { id: 101 },
      { id: 900 },
    ]);
  });
});
