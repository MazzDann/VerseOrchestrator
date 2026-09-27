import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_SQL } from '@vo/shared';
import { selectModules, SelectionError, type Candidates } from './selection';

let dir: string;
let settingsFile: string;
let libraryPath: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-sel-'));
  settingsFile = path.join(dir, 'settings.json');
  libraryPath = path.join(dir, 'library.db');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const files = (n: number, suffix = '.SQLite3') =>
  Array.from({ length: n }, (_, i) => path.join(dir, `M${i}${suffix}`));
const cands = (over: Partial<Candidates> = {}): Candidates => ({
  bibles: [],
  dictionaries: [],
  commentaries: [],
  crossreferences: [],
  ...over,
});

describe('module selection (data/settings.json → library)', () => {
  it('small folder, nothing built yet: seeds "all" and keeps other settings keys', () => {
    fs.writeFileSync(settingsFile, JSON.stringify({ version: 1, remotes: { persist: false } }));
    const r = selectModules({ settingsFile, libraryPath, candidates: cands({ bibles: files(3) }) });
    expect(r.seeded).toBe(true);
    expect(r.files.bibles).toHaveLength(3);
    const saved = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    expect(saved.remotes.persist).toBe(false); // not clobbered
    expect(saved.library.bibles).toBeNull();
  });

  it('huge folder, nothing built yet: seeds an EMPTY choice instead of importing thousands', () => {
    const r = selectModules({
      settingsFile,
      libraryPath,
      candidates: cands({ bibles: files(500) }),
    });
    expect(r.files.bibles).toEqual([]);
    expect(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).library.bibles).toEqual([]);
  });

  it('refuses "all" for a huge folder with guidance', () => {
    fs.writeFileSync(settingsFile, JSON.stringify({ library: { bibles: null } }));
    expect(() =>
      selectModules({ settingsFile, libraryPath, candidates: cands({ bibles: files(61) }) }),
    ).toThrow(SelectionError);
  });

  it('seeds from an existing (pre-`sources`) library so a rebuild reproduces it', () => {
    const db = new Database(libraryPath);
    db.exec(SCHEMA_SQL);
    db.exec('DROP TABLE sources'); // an older library
    db.prepare(
      "INSERT INTO translations (id, abbr, source_file) VALUES (1, 'M1', 'M1.SQLite3')",
    ).run();
    db.prepare("INSERT INTO dictionaries (id, abbr, name) VALUES (1, 'Strong', 'S')").run();
    db.prepare(
      "INSERT INTO commentaries (source, book, chapter_from, verse_from, chapter_to, verse_to) VALUES ('CARSA', 1, 1, 1, 1, 1)",
    ).run();
    db.prepare(
      'INSERT INTO cross_references (book, chapter, verse, book_to, chapter_to, verse_to_start, verse_to_end) VALUES (1,1,1,2,2,2,2),(1,1,2,2,2,3,3)',
    ).run();
    db.close();
    // two crossref files; the one with 2 rows is the one that was used
    const xref = (name: string, rows: number) => {
      const p = path.join(dir, name);
      const x = new Database(p);
      x.exec(
        'CREATE TABLE cross_references (book, chapter, verse, book_to, chapter_to, verse_to_start, verse_to_end)',
      );
      for (let i = 0; i < rows; i++)
        x.prepare('INSERT INTO cross_references VALUES (1,1,1,1,1,1,1)').run();
      x.close();
      return p;
    };
    const r = selectModules({
      settingsFile,
      libraryPath,
      candidates: cands({
        bibles: files(200),
        dictionaries: [path.join(dir, 'Strong.dictionary.SQLite3')],
        commentaries: [path.join(dir, 'CARSA.commentaries.SQLite3')],
        crossreferences: [
          xref('A-x.crossreferences.SQLite3', 5),
          xref('B-x.crossreferences.SQLite3', 2),
        ],
      }),
    });
    expect(r.selection).toEqual({
      bibles: ['M1.SQLite3'],
      dictionaries: ['Strong.dictionary.SQLite3'],
      commentaries: ['CARSA.commentaries.SQLite3'],
      crossreferences: ['B-x.crossreferences.SQLite3'],
    });
    expect(r.files.bibles.map((p) => path.basename(p))).toEqual(['M1.SQLite3']);
  });

  it('seeds from the `sources` table when the library has one', () => {
    const db = new Database(libraryPath);
    db.exec(SCHEMA_SQL);
    db.prepare(
      "INSERT INTO sources (kind, file) VALUES ('bibles', 'M7.SQLite3'), ('dictionaries', 'D.dictionary.SQLite3')",
    ).run();
    db.close();
    const r = selectModules({
      settingsFile,
      libraryPath,
      candidates: cands({ bibles: files(10) }),
    });
    expect(r.selection.bibles).toEqual(['M7.SQLite3']);
    expect(r.missing).toEqual(['dictionaries: D.dictionary.SQLite3']);
  });

  it('matches names case-insensitively and reports missing files', () => {
    fs.writeFileSync(
      settingsFile,
      JSON.stringify({ library: { bibles: ['m2.sqlite3', 'Gone.SQLite3'] } }),
    );
    const r = selectModules({ settingsFile, libraryPath, candidates: cands({ bibles: files(3) }) });
    expect(r.files.bibles.map((p) => path.basename(p))).toEqual(['M2.SQLite3']);
    expect(r.missing).toEqual(['bibles: Gone.SQLite3']);
    expect(r.seeded).toBe(false);
  });
});
