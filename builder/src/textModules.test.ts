import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { strToU8, zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  convertModule,
  createLibrary,
  parseTextModule,
  SCHEMA_SQL,
  SEGMENT_NORM_TABLE_SQL,
  writeModuleTables,
  type SqlDriver,
  type SyncConn,
} from '@vo/shared';
import { listTextModules } from '@vo/shared/modules-node';

/**
 * Modules in the text formats (1.25.0-beta.6) through both intakes that write a library: the
 * builder over a modules folder, and the browser's conversion of one dropped file.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let dir: string;
let lib: Database.Database;

const usfm = (code: string, text: string) =>
  `\\id ${code}\n\\h ${code}\n\\c 1\n\\s A title\n\\p\n\\v 1 ${text}\\f a \\ft A note & more\\f*\n\\v 2 He \\wj spoke\\wj* \\w grace|strong="G5485"\\w*\n`;
const OSIS =
  '<osis><osisText xml:lang="en"><div type="book" osisID="Gen"><chapter osisID="Gen.1"><verse osisID="Gen.1.1">In the beginning</verse></chapter></div></osisText></osis>';
const ZEFANIA =
  '<XMLBIBLE biblename="Z"><BIBLEBOOK bnumber="1" bname="Genesis"><CHAPTER cnumber="1"><VERS vnumber="1">In the beginning</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>';

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-text-'));
  const modules = path.join(dir, 'modules');
  fs.mkdirSync(path.join(modules, 'documents'), { recursive: true });
  fs.mkdirSync(path.join(modules, 'Folder'));
  fs.writeFileSync(path.join(modules, 'documents', 'GEN.usfm'), usfm('GEN', 'A document'));
  fs.writeFileSync(path.join(modules, 'Folder', '01-GEN.usfm'), usfm('GEN', 'First'));
  fs.writeFileSync(path.join(modules, 'Folder', '02-JHN.sfm'), usfm('JHN', 'Second'));
  fs.writeFileSync(
    path.join(modules, 'abc_usfm.zip'),
    zipSync({ 'GEN.usfm': strToU8(usfm('GEN', 'Zip')) }),
  );
  fs.writeFileSync(path.join(modules, 'o.osis.xml'), OSIS);
  fs.writeFileSync(path.join(modules, 'z.xml'), ZEFANIA);
  fs.writeFileSync(path.join(modules, 'v.txt'), 'GEN 1:1 In the beginning\nQQQ 1:1 Lost\n');
  fs.writeFileSync(path.join(modules, 'readme.txt'), 'Put the modules here');
  fs.writeFileSync(path.join(modules, 'other.zip'), zipSync({ 'a.bin': new Uint8Array(3) }));
  execFileSync(
    process.execPath,
    [path.join(root, 'node_modules/tsx/dist/cli.mjs'), path.join(root, 'builder/src/build.ts')],
    {
      env: {
        ...process.env,
        LIBRARY_DB: path.join(dir, 'library.db'),
        VO_DATA_DIR: dir,
        MODULES_DIR: modules,
      },
      stdio: 'pipe',
    },
  );
  lib = new Database(path.join(dir, 'library.db'), { readonly: true });
}, 60_000);
afterAll(() => {
  lib?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const driver = (db: Database.Database): SqlDriver => ({
  dialect: 'sqlite',
  all: async (sql, p = []) => db.prepare(sql).all(...p) as never[],
  get: async (sql, p = []) => db.prepare(sql).get(...p) as never,
});
const sync = (db: Database.Database): SyncConn => ({
  all: (sql, p = []) => db.prepare(sql).all(...p) as Record<string, unknown>[],
  prepare: (sql) => {
    const st = db.prepare(sql);
    return { run: (p) => void st.run(...p), done: () => undefined };
  },
});

describe('text modules in modules/ → library.db', () => {
  it('a file of each format and a folder of books are translations; other files are not', async () => {
    const all = await createLibrary(driver(lib)).getTranslations();
    expect(all.map((t) => t.abbr).sort()).toEqual(['Folder', 'abc', 'o', 'v', 'z']);
    expect(listTextModules(path.join(dir, 'modules'))).toEqual([
      'Folder',
      'abc_usfm.zip',
      'o.osis.xml',
      'v.txt',
      'z.xml',
    ]);
    const folder = all.find((t) => t.abbr === 'Folder')!;
    const rows = lib
      .prepare(
        'SELECT book_number b, verse v, text, text_raw raw FROM verses WHERE translation_id = ?',
      )
      .all(folder.id) as { b: number; v: number; text: string; raw: string | null }[];
    expect(rows.map((r) => [r.b, r.v, r.text])).toEqual([
      [10, 1, 'First'],
      [10, 2, 'He spoke grace'],
      [500, 1, 'Second'],
      [500, 2, 'He spoke grace'],
    ]);
    expect(rows[1].raw).toBe('He <J>spoke</J> grace<S>5485</S>');
  });

  it('titles, notes and Strong numbers come too', () => {
    expect(
      lib
        .prepare(
          "SELECT source, book, verse_from v, marker, text FROM commentaries WHERE source = 'abc'",
        )
        .all(),
    ).toEqual([{ source: 'abc', book: 10, v: 1, marker: 'a', text: 'A note & more' }]);
    const n = (table: string) =>
      (lib.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n;
    expect(n('subheadings')).toBe(3);
    expect(n('verse_strongs')).toBe(3);
  });
});

describe('a text module dropped into the browser → a segment', () => {
  it('has the same rows the builder writes', () => {
    const bytes = fs.readFileSync(path.join(dir, 'modules', 'abc_usfm.zip'));
    const src = new Database(':memory:');
    const out = new Database(':memory:');
    try {
      writeModuleTables(sync(src), parseTextModule('abc_usfm.zip', bytes));
      out.exec(SCHEMA_SQL);
      out.exec(SEGMENT_NORM_TABLE_SQL);
      const r = convertModule(sync(src), sync(out), {
        fileName: 'abc_usfm.zip',
        id: 1_000_001,
        notes: true,
      });
      expect(r).toMatchObject({ kind: 'bible', abbr: 'abc', items: 2 });
      const rows = (db: Database.Database, sql: string) => db.prepare(sql).all();
      const verses = `SELECT book_number, chapter, verse, text, text_raw FROM verses
        WHERE translation_id = (SELECT id FROM translations WHERE abbr = 'abc') ORDER BY 1, 2, 3`;
      expect(rows(out, verses)).toEqual(rows(lib, verses));
      const notes = "SELECT * FROM commentaries WHERE source = 'abc'";
      const bare = (list: unknown[]) =>
        (list as Record<string, unknown>[]).map(({ id: _id, ...rest }) => rest);
      expect(bare(rows(out, notes))).toEqual(bare(rows(lib, notes)));
      const titles =
        'SELECT DISTINCT book_number, chapter, verse, title FROM subheadings WHERE book_number = 10';
      expect(rows(out, titles)).toEqual(rows(lib, titles));
      const info = "SELECT title, language, rtl, has_strong FROM translations WHERE abbr = 'abc'";
      expect(rows(out, info)).toEqual(rows(lib, info));
    } finally {
      src.close();
      out.close();
    }
  });
});
