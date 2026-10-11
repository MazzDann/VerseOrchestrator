import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { VECTORS_SQL } from '@vo/shared';
import { legacyHash, oldHashes, rekeyVectors, textHash } from './textHash';

/** A translation's identity for its vectors (1.15.1): its text, not its file's date. */

let dir = '';
afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

const v = (book_number: number, chapter: number, verse: number, text: string) => ({
  book_number,
  chapter,
  verse,
  text,
});

describe('the text hash', () => {
  it('is the same for the same text in any order, another for any change', () => {
    const a = [v(10, 1, 1, 'На початку'), v(10, 1, 2, 'А земля')];
    expect(textHash(a)).toBe(textHash([...a].reverse()));
    expect(textHash(a)).toMatch(/^t1:[0-9a-f]{32}$/);
    expect(textHash([v(10, 1, 1, 'На початку!'), a[1]])).not.toBe(textHash(a));
    expect(textHash([v(10, 1, 3, 'На початку'), a[1]])).not.toBe(textHash(a));
  });

  it('tells the old identity of a file as it is now — a replaced file has another', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-rekey-'));
    const f = path.join(dir, 'A.SQLite3');
    fs.writeFileSync(f, 'one');
    fs.utimesSync(f, 1_700_000_000, 1_700_000_000);
    expect(legacyHash(f)).toBe('3:1700000000000');
    fs.writeFileSync(f, 'other');
    expect(legacyHash(f)).not.toBe('3:1700000000000');
    expect(legacyHash(path.join(dir, 'none'))).toBeNull();
  });

  it('carries vectors from an old identity to the new one, a set already there kept', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-rekey-'));
    const lib = path.join(dir, 'library.db');
    const l = new Database(lib);
    l.exec(
      "CREATE TABLE translations (source_file TEXT, source_hash TEXT); INSERT INTO translations VALUES ('A.SQLite3', '123:456'), ('B.SQLite3', NULL)",
    );
    l.close();
    expect([...oldHashes(lib)]).toEqual([['A.SQLite3', '123:456']]);
    expect(oldHashes(path.join(dir, 'none.db')).size).toBe(0);

    const file = path.join(dir, 'vectors.db');
    const db = new Database(file);
    db.exec(VECTORS_SQL);
    const put = db.prepare('INSERT INTO chapter_vectors VALUES (?, ?, ?, ?, ?, ?)');
    put.run('fast', '123:456', 10, 1, Buffer.alloc(2), Buffer.alloc(4));
    put.run('fast', '123:456', 10, 2, Buffer.alloc(2), Buffer.alloc(4));
    put.run('precise', '123:456', 10, 1, Buffer.alloc(2), Buffer.alloc(4));
    put.run('precise', 't1:new', 10, 1, Buffer.alloc(2), Buffer.alloc(4)); // made already
    db.exec(`INSERT INTO vector_sets VALUES ('fast', '123:456', 'A', 2, 1), ('precise', '123:456', 'A', 2, 0),
      ('precise', 't1:new', 'A', 2, 1)`);
    db.close();

    expect(rekeyVectors(file, new Map([['123:456', 't1:new']]))).toBe(1);
    const after = new Database(file, { readonly: true });
    expect(
      after.prepare('SELECT model, source_hash, done FROM vector_sets ORDER BY model').all(),
    ).toEqual([
      { model: 'fast', source_hash: 't1:new', done: 1 },
      { model: 'precise', source_hash: 't1:new', done: 1 },
    ]);
    expect(
      after.prepare("SELECT COUNT(*) n FROM chapter_vectors WHERE source_hash = '123:456'").get(),
    ).toEqual({
      n: 0,
    });
    expect(after.prepare('SELECT COUNT(*) n FROM chapter_vectors').get()).toEqual({ n: 3 });
    after.close();
    expect(rekeyVectors(path.join(dir, 'none.db'), new Map([['a', 'b']]))).toBe(0);
  });
});
