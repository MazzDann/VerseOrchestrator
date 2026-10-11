import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLibrary,
  loadSegmentPg,
  loadVectorsPg,
  mergeSql,
  packChapter,
  PG_SCHEMA_SQL,
  pgPlaceholders,
  quantize,
  SCHEMA_SQL,
  VECTORS_SQL,
  type LibraryOptions,
  type SearchResult,
  type SqlDriver,
  type SyncConn,
} from '@vo/shared';
import { buildSegments } from './segments';

/**
 * «Пошук за змістом» (1.15.0-beta.2) on both engines: the vectors a server made (data/vectors.db)
 * go into a segment, the SQLite engine keeps its chapter rows and scans them in JS, PostgreSQL
 * (PGlite + pgvector) takes a row per verse and orders by `<#>` — the same query, the same places,
 * in the same order.
 */

let dir: string;
let pg: PGlite;
let sqliteDriver: SqlDriver;
let pgDriver: SqlDriver;

/** A made-up model of 4 dims: verse k of a chapter points mostly along axis k % 4. */
const vecOf = (verse: number) => {
  const v = [0.1, 0.1, 0.1, 0.1];
  v[verse % 4] = 1 + verse / 10;
  return quantize(v, 4);
};
const QUERY = quantize([0.05, 0.1, 1, 0.1], 4); // nearest: verses 2, 6 (axis 2)…

const sync = (db: Database.Database): SyncConn => ({
  all: (sql, p = []) => db.prepare(sql).all(...p) as Record<string, unknown>[],
  prepare: (sql) => {
    const st = db.prepare(sql);
    return { run: (p) => void st.run(...p), done: () => undefined };
  },
});

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-vec-'));
  const libPath = path.join(dir, 'library.db');
  const lib = new Database(libPath);
  lib.exec(SCHEMA_SQL);
  lib.exec(`INSERT INTO translations (id, abbr, title, language, rtl, has_strong, source_file, source_hash)
    VALUES (1, 'UKR', 'Український', 'uk', 0, 0, 'UKR.SQLite3', 'h-ukr'), (2, 'KJV', 'King James', 'en', 0, 0, 'KJV.SQLite3', 'h-kjv')`);
  lib.exec(`INSERT INTO books VALUES (1, 500, 'Ів', 'Від Івана', ''), (2, 500, 'Jn', 'John', '')`);
  const verse = lib.prepare(
    'INSERT INTO verses (translation_id, book_number, chapter, verse, text) VALUES (?, ?, ?, ?, ?)',
  );
  for (let c = 1; c <= 2; c++)
    for (let v = 1; v <= 8; v++) {
      verse.run(1, 500, c, v, `укр ${c}:${v}`);
      verse.run(2, 500, c, v, `kjv ${c}:${v}`);
    }
  lib.close();
  // vectors for UKR only, made as the server's job writes them
  const vecPath = path.join(dir, 'vectors.db');
  const vdb = new Database(vecPath);
  vdb.exec(VECTORS_SQL);
  for (let c = 1; c <= 2; c++) {
    const nums = [1, 2, 3, 4, 5, 6, 7, 8];
    const p = packChapter(
      nums,
      nums.map((n) => vecOf(n + (c - 1) * 8)),
    );
    vdb
      .prepare('INSERT INTO chapter_vectors VALUES (?, ?, ?, ?, ?, ?)')
      .run('fast', 'h-ukr', 500, c, p.verses, p.vecs);
  }
  vdb.prepare("INSERT INTO vector_sets VALUES ('fast', 'h-ukr', 'UKR', 16, 1)").run();
  vdb.close();

  const manifest = buildSegments(libPath, path.join(dir, 'segments'), vecPath);
  // SQLite: what the SQLite-WASM engine does with each segment
  const work = new Database(':memory:');
  work.exec(SCHEMA_SQL);
  pg = await PGlite.create({ extensions: { vector } });
  await pg.exec(PG_SCHEMA_SQL);
  for (const s of manifest.segments) {
    const raw = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'segments', s.file)));
    const tmp = path.join(dir, `${s.file}.db`);
    fs.writeFileSync(tmp, raw);
    work.exec(`ATTACH '${tmp.replace(/'/g, "''")}' AS seg`);
    for (const sql of mergeSql('seg')) work.exec(sql);
    if (s.kind === 'vectors') {
      work.exec(VECTORS_SQL);
      work.exec('INSERT OR REPLACE INTO main.chapter_vectors SELECT * FROM seg.chapter_vectors');
      work.exec('INSERT OR REPLACE INTO main.vector_sets SELECT * FROM seg.vector_sets');
    }
    work.exec('DETACH seg');
    const seg = new Database(raw);
    await loadSegmentPg(sync(seg), pg);
    if (s.kind === 'vectors') await loadVectorsPg(sync(seg), pg);
    seg.close();
  }
  sqliteDriver = {
    dialect: 'sqlite',
    all: async (sql, p = []) => work.prepare(sql).all(...p) as never[],
    get: async (sql, p = []) => work.prepare(sql).get(...p) as never,
  };
  pgDriver = {
    dialect: 'postgres',
    all: async (sql, p = []) => (await pg.query(pgPlaceholders(sql), p)).rows as never[],
    get: async (sql, p = []) => (await pg.query(pgPlaceholders(sql), p)).rows[0] as never,
  };
}, 120_000);

afterAll(async () => {
  await pg?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const place = (r: SearchResult) => `${r.translationId}:${r.chapter}:${r.verse}`;
const embed: LibraryOptions['embed'] = async (_text, models) =>
  models.includes('fast') ? { model: 'fast', vec: QUERY } : null;

describe('search by meaning on both engines', () => {
  it('builds one vector segment per translation the vectors file has whole', () => {
    const files = fs.readdirSync(path.join(dir, 'segments'));
    expect(files).toContain('v-fast-1.vodb.gz');
    expect(files.some((f) => f.startsWith('v-') && f !== 'v-fast-1.vodb.gz')).toBe(false);
  });

  it('SQLite and PostgreSQL find the same places in the same order', async () => {
    const a = await createLibrary(sqliteDriver, { embed }).search('~ щось', [1]);
    const b = await createLibrary(pgDriver, { embed }).search('~ щось', [1]);
    expect(a.kind).toBe('meaning');
    // the four verses along the query's axis come first (their order is the vectors' business)
    expect(a.results.slice(0, 4).map(place).sort()).toEqual(['1:1:2', '1:1:6', '1:2:2', '1:2:6']);
    // the same places; the same order where the scores differ (a tie may fall either way)
    expect(b.results.slice(0, 4).map(place)).toEqual(a.results.slice(0, 4).map(place));
    expect(b.results.map(place).sort()).toEqual(a.results.map(place).sort());
    const [first] = a.results;
    expect(first.text).toBe(`укр ${first.chapter}:${first.verse}`);
    expect(a.results[0].shortName).toBe('Ів');
  });

  it('says what is missing: a model, or vectors for the translations asked', async () => {
    for (const d of [sqliteDriver, pgDriver]) {
      expect(await createLibrary(d).search('~ щось', [1])).toMatchObject({ missing: 'model' });
      expect(await createLibrary(d, { embed }).search('~ щось', [2])).toMatchObject({
        kind: 'meaning',
        missing: 'vectors',
        results: [],
      });
      // all translations: those with vectors answer
      expect((await createLibrary(d, { embed }).search('~щось', [])).results.length).toBe(16);
    }
  });
});
