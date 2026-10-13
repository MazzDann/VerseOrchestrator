import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { VECTORS_SQL } from '@vo/shared';
import { mergeVectors, moduleFileName, placeModule } from './dropImport.js';

let dir = '';
afterEach(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});
const sqlite = (file: string, sql: string) => {
  const db = new Database(file);
  db.exec(sql);
  db.close();
};

describe('a module dropped anywhere (1.17.1)', () => {
  it('is named by its tables, the builder reads the kind from the name', () => {
    expect(moduleFileName('C:\\x\\Strong.SQLite3', 'dictionary')).toBe('Strong.dictionary.SQLite3');
    expect(moduleFileName('MH.commentaries.SQLite3', 'commentaries')).toBe(
      'MH.commentaries.SQLite3',
    );
    expect(moduleFileName('UBIO.dictionary.SQLite3', 'bible')).toBe('UBIO.SQLite3');
    expect(moduleFileName('CON.SQLite3', 'bible')).toBeNull();
    // every kind suffix away: «.plan» left in a Bible's name would make the builder skip it
    expect(moduleFileName('X.plan.dictionary.SQLite3', 'bible')).toBe('X.SQLite3');
  });

  it('goes into modules/, never over another file; what is no module is refused', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-drop-'));
    const modules = path.join(dir, 'modules');
    fs.mkdirSync(modules);
    const tmp = () => path.join(dir, `in-${Math.random()}.part`);
    let t = tmp();
    sqlite(t, 'CREATE TABLE dictionary (topic TEXT, definition TEXT)');
    expect(placeModule(t, 'Strong.SQLite3', modules)).toEqual({
      file: 'Strong.dictionary.SQLite3',
      kind: 'dictionaries',
      same: false,
    });
    expect(fs.existsSync(path.join(modules, 'Strong.dictionary.SQLite3'))).toBe(true);
    // the same file again: nothing written; another one of that name: refused
    t = tmp();
    fs.copyFileSync(path.join(modules, 'Strong.dictionary.SQLite3'), t);
    expect(placeModule(t, 'Strong.SQLite3', modules).same).toBe(true);
    t = tmp();
    sqlite(
      t,
      'CREATE TABLE dictionary (topic TEXT, definition TEXT, more TEXT); INSERT INTO dictionary VALUES (1, 2, 3)',
    );
    expect(() => placeModule(t, 'Strong.SQLite3', modules)).toThrow(/уже є інший/);
    t = tmp();
    sqlite(t, 'CREATE TABLE notes (x)');
    expect(() => placeModule(t, 'X.SQLite3', modules)).toThrow(/не модуль/);
    t = tmp();
    fs.writeFileSync(t, 'not sqlite');
    expect(() => placeModule(t, 'Y.SQLite3', modules)).toThrow(/не модуль/);
    expect(fs.readdirSync(modules)).toEqual(['Strong.dictionary.SQLite3']);
  });
});

describe('another copy’s vectors.db dropped (1.17.1)', () => {
  it('brings the finished sets this copy lacks, keeps the ones it has whole', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-drop-'));
    const mine = path.join(dir, 'data', 'vectors.db');
    fs.mkdirSync(path.dirname(mine));
    sqlite(
      mine,
      `${VECTORS_SQL}
       INSERT INTO vector_sets VALUES ('fast', 'h-a', 'A', 10, 1), ('fast', 'h-b', 'B', 4, 0);
       INSERT INTO chapter_vectors VALUES ('fast', 'h-a', 1, 1, x'01', x'01'), ('fast', 'h-b', 1, 1, x'02', x'02');`,
    );
    const theirs = path.join(dir, 'in.part');
    sqlite(
      theirs,
      `${VECTORS_SQL}
       INSERT INTO vector_sets VALUES ('fast', 'h-a', 'A', 10, 1), ('fast', 'h-b', 'B', 9, 1),
         ('precise', 'h-a', 'A', 10, 1), ('fast', 'h-c', 'C', 3, 0);
       INSERT INTO chapter_vectors VALUES ('fast', 'h-a', 1, 1, x'09', x'09'), ('fast', 'h-b', 1, 1, x'03', x'03'),
         ('fast', 'h-b', 1, 2, x'04', x'04'), ('precise', 'h-a', 1, 1, x'05', x'05'), ('fast', 'h-c', 1, 1, x'06', x'06');`,
    );
    expect(mergeVectors(theirs, mine)).toEqual({ sets: 2, verses: 19, kept: 1 });
    const db = new Database(mine, { readonly: true });
    expect(
      db.prepare('SELECT model, source_hash, verses, done FROM vector_sets ORDER BY 1, 2').all(),
    ).toEqual([
      { model: 'fast', source_hash: 'h-a', verses: 10, done: 1 },
      { model: 'fast', source_hash: 'h-b', verses: 9, done: 1 },
      { model: 'precise', source_hash: 'h-a', verses: 10, done: 1 },
    ]);
    // this copy's own set stayed as it was; the unfinished one replaced whole
    expect(
      db
        .prepare(
          "SELECT hex(vecs) AS v FROM chapter_vectors WHERE model = 'fast' ORDER BY source_hash, chapter",
        )
        .all()
        .map((r) => (r as { v: string }).v),
    ).toEqual(['01', '03', '04']);
    db.close();
    expect(fs.existsSync(theirs)).toBe(false);
  });

  it('a file that holds no vectors is refused', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-drop-'));
    const t = path.join(dir, 'x.part');
    sqlite(t, 'CREATE TABLE other (x)');
    expect(() => mergeVectors(t, path.join(dir, 'vectors.db'))).toThrow(/не файл векторів/);
  });
});
