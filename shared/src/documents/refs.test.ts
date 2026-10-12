import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { bookResolver, scanReferences } from './refs.js';
import { writeLibraryDocuments } from './node.js';

const NAMES = [
  { book_number: 500, name_norm: 'ів' },
  { book_number: 500, name_norm: 'івана' },
  { book_number: 530, name_norm: '1 кор' },
  { book_number: 470, name_norm: 'мт' },
  { book_number: 470, name_norm: 'матвія' },
  { book_number: 290, name_norm: 'іс' },
  { book_number: 60, name_norm: 'ісус навин' },
];

describe('Bible references in a document', () => {
  it('finds «Book ch:v[-v]», with an ordinal, a dot, a dash; leaves times and lowercase alone', () => {
    const text = 'Як пише Ів 3:16 і 1 Кор 13:4–7, а також Мт. 5:44; о 10:30 зустріч, ів 3:16';
    const refs = scanReferences(text);
    expect(
      refs.map((r) => [text.slice(r.start, r.start + r.len), r.token, r.chapter, r.from, r.to]),
    ).toEqual([
      ['Ів 3:16', 'ів', 3, 16, 16],
      ['1 Кор 13:4–7', '1 кор', 13, 4, 7],
      ['Мт. 5:44', 'мт', 5, 44, 44],
    ]);
  });

  it('resolves a written name by the library’s names; a tie resolves to nothing', () => {
    const book = bookResolver(NAMES);
    expect(book('ів')).toBe(500);
    expect(book('іван')).toBe(500); // the start of «івана»
    expect(book('1 кор')).toBe(530);
    expect(book('матв')).toBe(470);
    expect(book('іс')).toBe(290); // its own name beats «ісус навин»
    expect(book('о')).toBeNull();
    expect(bookResolver([...NAMES, { book_number: 999, name_norm: 'ів' }])('ів')).toBeNull();
  });

  it('the library keeps them with each unit, only those it knows', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-refs-'));
    try {
      fs.writeFileSync(path.join(dir, 'Проповідь.md'), '# Вступ\n\nБо так (Ів 3:16), не Хв 1:2.');
      const db = new Database(':memory:');
      db.exec(
        'CREATE TABLE book_names (translation_id INTEGER, book_number INTEGER, name_norm TEXT)',
      );
      const ins = db.prepare('INSERT INTO book_names VALUES (1, ?, ?)');
      for (const n of NAMES) ins.run(n.book_number, n.name_norm);
      writeLibraryDocuments(db, dir);
      expect(
        db
          .prepare('SELECT ord, pos, len, book_number, chapter, verse_from, verse_to FROM doc_refs')
          .all(),
      ).toEqual([
        { ord: 1, pos: 8, len: 7, book_number: 500, chapter: 3, verse_from: 16, verse_to: 16 },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
