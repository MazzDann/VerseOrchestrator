import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import {
  decodeText,
  documentKind,
  documentTitle,
  parseDocument,
  readMarkdown,
  readPlainText,
  splitLong,
} from './parse.js';
import {
  addDocumentFile,
  docSections,
  listDocumentFiles,
  restoreDocument,
  stableDocId,
  trashDocument,
  writeLibraryDocuments,
  safeDocumentName,
  setExtraDocumentKinds,
} from './node.js';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function docx(body: string, styles = ''): Uint8Array {
  return zipSync({
    'word/document.xml': strToU8(
      `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
    ),
    ...(styles ? { 'word/styles.xml': strToU8(`<w:styles ${W}>${styles}</w:styles>`) } : {}),
  });
}

const p = (text: string, pPr = '') =>
  `<w:p w:rsidR="00A1">${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

describe('document files', () => {
  it('knows its kinds and leaves lock files and resource forks alone', () => {
    expect(documentKind('Проповідь.DOCX')).toBe('docx');
    expect(documentKind('нотатки.markdown')).toBe('md');
    expect(documentKind('a/b/текст.txt')).toBe('txt');
    expect(documentKind('~$оповідь.docx')).toBeNull();
    expect(documentKind('._x.md')).toBeNull();
    expect(documentKind('song.pptx')).toBeNull();
    expect(documentTitle('a/Неділя 12.10.docx')).toBe('Неділя 12.10');
  });

  it('reads text in UTF-8, UTF-16 and Windows-1251', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0xd0, 0x91, 0xd0, 0xbe, 0xd0, 0xb3]))).toBe(
      'Бог',
    );
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x11, 0x04, 0x3e, 0x04]))).toBe('Бо');
    // «Бог» in Windows-1251 isn't valid UTF-8
    expect(decodeText(new Uint8Array([0xc1, 0xee, 0xe3]))).toBe('Бог');
  });
});

describe('plain text', () => {
  it('an empty line ends a paragraph, its own lines stay', () => {
    expect(readPlainText('Перший рядок\nдругий\n\nНовий абзац\r\n').map((u) => u.text)).toEqual([
      'Перший рядок\nдругий',
      'Новий абзац',
    ]);
  });
  it('with no empty line at all, each line is a paragraph', () => {
    expect(readPlainText('Один\nДва\nТри').map((u) => u.text)).toEqual(['Один', 'Два', 'Три']);
  });
});

describe('Markdown', () => {
  it('headings, quotes, items, paragraphs; inline marks away', () => {
    const units = readMarkdown(
      [
        '---',
        'title: x',
        '---',
        '# Вступ',
        '',
        'Текст **жирний** і [посилання](http://x) та `код`',
        'на два рядки.',
        '',
        '> Бо так полюбив Бог',
        '> світ',
        '',
        '- перше',
        '  - вкладене',
        '1. номер',
        '',
        'Підрозділ',
        '---------',
        '',
        '| a | b |',
        '|---|---|',
        '| 1 | 2 |',
      ].join('\n'),
    );
    expect(units.map((u) => [u.kind, u.level, u.text])).toEqual([
      ['heading', 1, 'Вступ'],
      ['para', 0, 'Текст жирний і посилання та код на два рядки.'],
      ['quote', 0, 'Бо так полюбив Бог світ'],
      ['item', 0, 'перше'],
      ['item', 1, 'вкладене'],
      ['item', 0, 'номер'],
      ['heading', 2, 'Підрозділ'],
      ['para', 0, 'a · b'],
      ['para', 0, '1 · 2'],
    ]);
  });
  it('emphasis marks go, underscores inside words (any alphabet) and «C#» stay', () => {
    expect(
      readMarkdown('*курсив* і _нахил_, file_name_x_ та слово_слово_, 2**3**').map((u) => u.text),
    ).toEqual(['курсив і нахил, file_name_x_ та слово_слово_, 23']);
    expect(readMarkdown('# C#\n\n## Тема #1 ##').map((u) => u.text)).toEqual(['C#', 'Тема #1']);
  });
  it('keeps a code block as written', () => {
    expect(readMarkdown('```\nрядок 1\n  рядок 2\n```').map((u) => u.text)).toEqual([
      'рядок 1\n  рядок 2',
    ]);
  });
});

describe('Word', () => {
  it('headings by style name (a Ukrainian Word names ids «1»), outline levels, quotes, lists', () => {
    const styles =
      '<w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="a5"><w:name w:val="Title"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="Q"><w:name w:val="Intense Quote"/></w:style>' +
      '<w:style w:type="paragraph" w:styleId="My"><w:name w:val="Мій"/><w:basedOn w:val="1"/></w:style>';
    const doc = parseDocument(
      docx(
        p('Назва', '<w:pStyle w:val="a5"/>') +
          p('Розділ', '<w:pStyle w:val="1"/>') +
          p('Свій стиль', '<w:pStyle w:val="My"/>') +
          p('Свій рівень', '<w:outlineLvl w:val="2"/>') +
          `<w:p><w:r><w:t>Слово</w:t><w:tab/><w:t>за</w:t><w:br/><w:t>словом</w:t><w:delText>стерте</w:delText></w:r></w:p>` +
          p('Цитата', '<w:pStyle w:val="Q"/>') +
          p('Пункт', '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr>') +
          '<w:p/>' +
          '<w:p w14:paraId="1A2B"/>' +
          `<w:tbl><w:tr><w:tc>${p('Клітинка &amp; &lt;x&gt;')}</w:tc></w:tr></w:tbl>`,
        styles,
      ),
      'x.docx',
    );
    expect(doc?.units.map((u) => [u.kind, u.level, u.text])).toEqual([
      ['heading', 1, 'Назва'],
      ['heading', 1, 'Розділ'],
      ['heading', 1, 'Свій стиль'],
      ['heading', 3, 'Свій рівень'],
      ['para', 0, 'Слово за\nсловом'],
      ['quote', 0, 'Цитата'],
      ['item', 1, 'Пункт'],
      ['para', 0, 'Клітинка & <x>'],
    ]);
  });
  it('a file that is no Word document, or holds no text, gives null', () => {
    expect(parseDocument(new Uint8Array([1, 2, 3]), 'x.docx')).toBeNull();
    expect(parseDocument(docx('<w:p/>'), 'x.docx')).toBeNull();
    expect(parseDocument(strToU8('  \n\n '), 'x.txt')).toBeNull();
  });
});

describe('long paragraphs', () => {
  it('are cut at a sentence end', () => {
    const s = 'Речення одне. '.repeat(40).trim();
    const parts = splitLong(s, 100);
    expect(parts.every((x) => x.length <= 100)).toBe(true);
    expect(parts.every((x) => x.endsWith('.'))).toBe(true);
    expect(parts.join(' ')).toBe(s);
  });
});

describe('the folder and the library', () => {
  let dir = '';
  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });
  const lib = () => new Database(':memory:');

  it('a Mac’s converted kinds: listed, read only as converted, kept by their own kind', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-docs-'));
    fs.writeFileSync(path.join(dir, 'Проповідь.pages'), 'x');
    fs.writeFileSync(path.join(dir, 'Лекція.md'), '# Л\n\nтекст');
    setExtraDocumentKinds(['pages']);
    try {
      expect(listDocumentFiles(dir).map((f) => f.file)).toEqual(['Лекція.md', 'Проповідь.pages']);
      const db = lib();
      // not converted yet: not in, and nothing failed
      expect(writeLibraryDocuments(db, dir)).toMatchObject({ documents: 1, failed: [] });
      const f = listDocumentFiles(dir).find((x) => x.file === 'Проповідь.pages')!;
      const doc = { units: [{ kind: 'para' as const, level: 0, text: 'З Pages' }] };
      const pre = new Map([[f.file, { doc, size: f.size, mtime: f.mtime }]]);
      expect(writeLibraryDocuments(db, dir, undefined, pre)).toMatchObject({ documents: 2 });
      expect(
        db.prepare('SELECT kind, title FROM documents WHERE file = ?').get('Проповідь.pages'),
      ).toEqual({ kind: 'pages', title: 'Проповідь' });
      expect(safeDocumentName('a/Нова.pages')).toBe('Нова.pages');
    } finally {
      setExtraDocumentKinds([]);
    }
    // elsewhere (no conversion): not a document
    expect(listDocumentFiles(dir).map((f) => f.file)).toEqual(['Лекція.md']);
    expect(safeDocumentName('Нова.pages')).toBeNull();
  });

  it('reads what changed, keeps what didn’t, drops what’s gone', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-docs-'));
    fs.writeFileSync(path.join(dir, 'Перша.md'), '# А\n\nтекст');
    fs.mkdirSync(path.join(dir, 'серія'));
    fs.writeFileSync(path.join(dir, 'серія', 'Друга.txt'), 'рядок');
    fs.writeFileSync(path.join(dir, 'пісня.pptx'), 'x');
    fs.writeFileSync(path.join(dir, 'Зламана.docx'), 'not a zip');
    fs.mkdirSync(path.join(dir, '.trash'));
    fs.writeFileSync(path.join(dir, '.trash', '1-Стара.md'), 'x');
    expect(listDocumentFiles(dir).map((f) => f.file)).toEqual([
      'Зламана.docx',
      'Перша.md',
      'серія/Друга.txt',
    ]);
    const db = lib();
    const r1 = writeLibraryDocuments(db, dir);
    expect(r1).toMatchObject({ documents: 2, read: 2, removed: 0, changed: true });
    expect(r1.failed).toEqual(['Зламана.docx']);
    const id = stableDocId('Перша.md');
    expect(db.prepare('SELECT title FROM documents WHERE id = ?').get(id)).toEqual({
      title: 'Перша',
    });
    expect(
      db
        .prepare(
          'SELECT kind, section, text_norm FROM doc_units WHERE document_id = ? ORDER BY ord',
        )
        .all(id),
    ).toEqual([
      { kind: 'heading', section: 0, text_norm: 'а' },
      { kind: 'para', section: 0, text_norm: 'текст' },
    ]);
    // nothing changed: nothing written
    expect(writeLibraryDocuments(db, dir)).toMatchObject({ read: 0, changed: false });
    // one changed (another size), one gone
    fs.writeFileSync(path.join(dir, 'Перша.md'), '# А\n\nтекст довший');
    fs.rmSync(path.join(dir, 'серія', 'Друга.txt'));
    expect(writeLibraryDocuments(db, dir)).toMatchObject({ documents: 1, read: 1, removed: 1 });
    expect(db.prepare('SELECT id FROM documents').all()).toEqual([{ id }]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM doc_units').get()).toEqual({ n: 2 });
  });

  it('adds a dropped file, replaces another copy into the trash, brings it back', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-docs-'));
    const a = addDocumentFile(dir, 'C:\\x\\Неділя.md', strToU8('# Один'));
    expect(a).toEqual({ file: 'Неділя.md', replaced: null, same: false });
    expect(addDocumentFile(dir, 'Неділя.md', strToU8('# Один'))?.same).toBe(true);
    const b = addDocumentFile(dir, 'Неділя.md', strToU8('# Два'));
    expect(b?.replaced).toMatch(/^\d+-Неділя\.md$/);
    expect(fs.readFileSync(path.join(dir, 'Неділя.md'), 'utf8')).toBe('# Два');
    expect(addDocumentFile(dir, 'CON.md', strToU8('x'))).toBeNull();
    expect(addDocumentFile(dir, 'x.exe', strToU8('x'))).toBeNull();
    const t = trashDocument(dir, 'Неділя.md')!;
    expect(fs.existsSync(path.join(dir, 'Неділя.md'))).toBe(false);
    expect(restoreDocument(dir, t)).toBe('Неділя.md');
    expect(restoreDocument(dir, '../../etc')).toBeNull();
    // a subfolder's file, and a name with «__» in it, come back where they were
    fs.mkdirSync(path.join(dir, 'рік'));
    fs.writeFileSync(path.join(dir, 'рік', 'a__b.md'), '# x');
    const t2 = trashDocument(dir, 'рік/a__b.md')!;
    expect(restoreDocument(dir, t2)).toBe('рік/a__b.md');
    expect(fs.existsSync(path.join(dir, 'рік', 'a__b.md'))).toBe(true);
    // a note pointing outside the folder is refused
    const t3 = trashDocument(dir, 'рік/a__b.md')!;
    fs.writeFileSync(path.join(dir, '.trash', `${t3}.path`), '../escape.md');
    expect(restoreDocument(dir, t3)).toBeNull();
  });

  it('sections: the heading each unit stands under', () => {
    expect(
      docSections([{ kind: 'para' }, { kind: 'heading' }, { kind: 'para' }, { kind: 'heading' }]),
    ).toEqual([-1, 1, 1, 3]);
  });
});
