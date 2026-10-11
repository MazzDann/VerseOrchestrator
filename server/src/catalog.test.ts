import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibrarySelection } from '@vo/shared';
import {
  createCatalog,
  htmlText,
  kindOfFil,
  listModuleFiles,
  moduleFileName,
  moduleKindOf,
  parseRegistry,
  parseSize,
  placeModule,
  withFiles,
} from './catalog';
import { zip } from './zip';

/** A tiny Module database of a kind, as bytes. */
function moduleBytes(
  kind: 'bible' | 'commentaries' | 'dictionary' | 'subheadings' | 'none',
  wal = false,
): Buffer {
  const db = new Database(':memory:');
  if (kind === 'bible')
    db.exec('CREATE TABLE books (book_number INT); CREATE TABLE verses (text TEXT)');
  if (kind === 'commentaries') db.exec('CREATE TABLE commentaries (text TEXT)');
  if (kind === 'dictionary') db.exec('CREATE TABLE dictionary (topic TEXT)');
  if (kind === 'subheadings') db.exec('CREATE TABLE subheadings (subheading TEXT)');
  if (kind === 'none') db.exec('CREATE TABLE other (x INT)');
  db.exec('CREATE TABLE info (name TEXT, value TEXT)');
  const buf = db.serialize();
  db.close();
  if (wal) {
    buf[18] = 2;
    buf[19] = 2;
  }
  return buf;
}

/** The registry's files start with one (UTF-8 BOM). */
const BOM = String.fromCharCode(0xfeff);

const REGISTRY = {
  version: 42,
  hosts: [
    { alias: 'mz', path: 'https://mz.example/m/%s.zip', priority: 1 },
    { alias: 'old', path: 'http://old.example/m/%s.zip', priority: 1 },
    { alias: 'inf', path: 'https://inf.example/m/%s.zip', priority: 2 },
  ],
  downloads: [
    {
      abr: "UBIO'62",
      fil: "UBIO'62",
      des: 'Біблія в пер. Івана Огієнка',
      lng: 'uk',
      siz: '2.1M',
      upd: '2026-08-14',
      inf: 'Біблія <br/>British &amp; Foreign Bible Society',
      url: ['{inf}UBIO%2762', '{mz}UBIO%2762', '{old}UBIO%2762'],
    },
    { abr: 'РИ', fil: 'РИ ББД', lng: 'ru', siz: '512K', url: ['{mz}РИ ББД'], lic: '*' },
    {
      abr: 'S',
      fil: 'Strong.dictionary',
      siz: '1,7M',
      url: ['{mz}Strong.dictionary'],
      lic: '<h4>Owner</h4> x',
    },
    { abr: 'P', fil: '10CD-p.plan', url: ['{mz}10CD-p.plan'] },
    { abr: 'H', fil: 'HIDDEN', hid: true, url: ['{mz}HIDDEN'] },
    { abr: 'N', fil: 'NOURL', url: ['{old}NOURL'] },
    { abr: 'T', fil: '../evil', url: ['{mz}evil'] },
    { abr: 'C', fil: 'C:evil', url: ['{mz}evil'] },
    { abr: 'N', fil: 'NUL', url: ['{mz}evil'] },
    { abr: 'D', fil: 'dot.', url: ['{mz}evil'] },
  ],
};

describe('registry', () => {
  it('keeps the kinds the library reads, with HTTPS mirrors in priority order', () => {
    const { version, entries } = parseRegistry(REGISTRY);
    expect(version).toBe(42);
    expect(entries.map((e) => e.fil)).toEqual(["UBIO'62", 'РИ ББД', 'Strong.dictionary']);
    const [ubio, ri, strong] = entries;
    // already percent-encoded stays as it is; a raw name is encoded; http mirrors left out
    expect(ubio.urls).toEqual([
      'https://mz.example/m/UBIO%2762.zip',
      'https://inf.example/m/UBIO%2762.zip',
    ]);
    expect(ri.urls).toEqual([`https://mz.example/m/${encodeURIComponent('РИ ББД')}.zip`]);
    expect(ubio).toMatchObject({ kind: 'bibles', lang: 'uk', size: Math.round(2.1 * 1024 ** 2) });
    expect(ubio.info).toBe('Біблія\nBritish & Foreign Bible Society');
    expect(strong).toMatchObject({ kind: 'dictionaries', licence: 'Owner\nx' });
    expect(ri.licence).toBeUndefined(); // «*» names nobody
  });

  it('reads sizes, kinds and file names', () => {
    expect(parseSize('690K')).toBe(690 * 1024);
    expect(parseSize('1,5M')).toBe(1.5 * 1024 ** 2);
    expect(parseSize('?')).toBe(0);
    expect(kindOfFil('KJV+')).toBe('bibles');
    expect(kindOfFil('OBX.crossreferences')).toBe('crossreferences');
    expect(kindOfFil('KJV-s.subheadings')).toBe('subheadings');
    expect(kindOfFil('X.devotions')).toBeNull();
    expect(moduleFileName('KJV+', 'bibles')).toBe('KJV+.SQLite3');
    expect(moduleFileName('CUV', 'commentaries')).toBe('CUV.commentaries.SQLite3');
    expect(moduleFileName('Strong.dictionary', 'dictionaries')).toBe('Strong.dictionary.SQLite3');
    expect(htmlText('a'.repeat(20), 10)).toBe('aaaaaaaaa…');
  });
});

describe('modules on disk', () => {
  let dir = '';
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

  it('names each member by what it holds, never over a file already there', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-catalog-'));
    // the 2026-10-01 trap: text + notes in one zip, the text's member name empty
    const z = await zip([
      { name: '.SQLite3', data: moduleBytes('bible', true) },
      { name: 'CUV.commentaries.SQLite3', data: moduleBytes('commentaries') },
      { name: 'readme.txt', data: Buffer.from('hi') },
    ]);
    expect(await placeModule(z, 'CUV', dir)).toEqual([
      { name: 'CUV.SQLite3', kind: 'bibles' },
      { name: 'CUV.commentaries.SQLite3', kind: 'commentaries' },
    ]);
    // the WAL bytes were only patched to read it
    expect(fs.readFileSync(path.join(dir, 'CUV.SQLite3'))[18]).toBe(2);
    expect(await placeModule(z, 'cuv', dir)).toEqual([
      { name: 'cuv.SQLite3', kind: 'bibles', present: true },
      { name: 'cuv.commentaries.SQLite3', kind: 'commentaries', present: true },
    ]);
    fs.writeFileSync(path.join(dir, 'X.devotions.SQLite3'), '');
    expect(listModuleFiles(dir)).toEqual({
      bibles: ['CUV.SQLite3'],
      dictionaries: [],
      commentaries: ['CUV.commentaries.SQLite3'],
      crossreferences: [],
      subheadings: [],
    });
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('tells a module kind from its tables', () => {
    expect(moduleKindOf(moduleBytes('dictionary'))).toBe('dictionaries');
    expect(moduleKindOf(moduleBytes('subheadings'))).toBe('subheadings');
    expect(moduleKindOf(moduleBytes('none'))).toBeNull();
    expect(
      moduleKindOf(Buffer.from('not a database at all, not at all, really not at all')),
    ).toBeNull();
  });

  it('adds files to a selection by name, leaves «all» and a missing one', () => {
    const sel: LibrarySelection = {
      bibles: ['KJV+.SQLite3'],
      dictionaries: null,
      commentaries: [],
      crossreferences: [],
      subheadings: [],
    };
    expect(
      withFiles(sel, [
        { name: 'kjv+.SQLite3', kind: 'bibles' },
        { name: 'UBIO.SQLite3', kind: 'bibles' },
        { name: 'S.dictionary.SQLite3', kind: 'dictionaries' },
      ]),
    ).toEqual({ ...sel, bibles: ['KJV+.SQLite3', 'UBIO.SQLite3'] });
    expect(withFiles(sel, [{ name: 'KJV+.SQLite3', kind: 'bibles' }])).toBeNull();
    expect(withFiles(undefined, [{ name: 'A.SQLite3', kind: 'bibles' }])).toBeNull();
  });
});

describe('the download queue', () => {
  let tmp = '';
  afterEach(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));

  async function setup(
    fail: (url: string) => boolean = () => false,
    o: { stall?: (url: string) => boolean; noSelection?: boolean } = {},
  ) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-catalog-'));
    const registry = await zip([
      { name: 'registry.json', data: Buffer.from(BOM + JSON.stringify(REGISTRY)) },
    ]);
    const bible = await zip([{ name: "UBIO'62.SQLite3", data: moduleBytes('bible') }]);
    const asked: { url: string; ua: string | null }[] = [];
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      asked.push({ url: u, ua: new Headers(init?.headers).get('user-agent') });
      if (fail(u)) return new Response('gone', { status: 404 });
      // a mirror that sends a little and then nothing more, until the request is dropped
      if (o.stall?.(u)) {
        const body = new ReadableStream({
          start(ctl) {
            ctl.enqueue(new Uint8Array([1, 2, 3]));
            init?.signal?.addEventListener('abort', () => ctl.error(new Error('aborted')));
          },
        });
        return new Response(body);
      }
      if (u.endsWith('registry_info.json')) return new Response(BOM + '{"version":42}');
      if (u.endsWith('registry.zip')) return new Response(registry);
      if (u.includes('UBIO'))
        return new Response(bible, { headers: { 'content-length': String(bible.length) } });
      return new Response('nope', { status: 404 });
    });
    let sel: LibrarySelection | undefined = o.noSelection
      ? undefined
      : { bibles: [], dictionaries: [], commentaries: [], crossreferences: [], subheadings: [] };
    const rebuild = vi.fn();
    const c = createCatalog({
      dataDir: path.join(tmp, 'data'),
      modulesDir: () => path.join(tmp, 'modules'),
      version: '9.9.9',
      fetch: fakeFetch as typeof fetch,
      selection: () => sel,
      setSelection: (s) => (sel = s),
      rebuild,
      stallMs: 200,
    });
    const idle = () =>
      vi.waitFor(() =>
        expect(
          c.queue().items.every((i) => !['waiting', 'downloading', 'placing'].includes(i.phase)),
        ).toBe(true),
      );
    return { c, asked, rebuild, idle, sel: () => sel };
  }

  it('downloads from the next mirror, files it, adds it to the library and rebuilds once', async () => {
    const t = await setup((u) => u.startsWith('https://mz.example/m/UBIO'));
    const list = await t.c.catalog();
    expect(list.entries).toHaveLength(3);
    t.c.enqueue("UBIO'62");
    t.c.enqueue("UBIO'62"); // the same twice: one item
    await t.idle();
    const [item] = t.c.queue().items;
    expect(t.c.queue().items).toHaveLength(1);
    expect(item).toMatchObject({
      phase: 'done',
      files: [{ name: "UBIO'62.SQLite3", kind: 'bibles' }],
    });
    expect(item.got).toBe(item.total);
    expect(t.sel()?.bibles).toEqual(["UBIO'62.SQLite3"]);
    expect(t.rebuild).toHaveBeenCalledTimes(1);
    expect(t.asked.map((a) => a.url)).toContain('https://inf.example/m/UBIO%2762.zip');
    expect(
      t.asked.every(
        (a) => a.ua === 'VerseOrchestrator/9.9.9 (+https://github.com/MazzDann/VerseOrchestrator)',
      ),
    ).toBe(true);
  });

  it('leaves a mirror that stops sending for the next one', async () => {
    const t = await setup(undefined, { stall: (u) => u.startsWith('https://mz.example/m/UBIO') });
    await t.c.catalog();
    t.c.enqueue("UBIO'62");
    await t.idle();
    expect(t.c.queue().items[0].phase).toBe('done');
  });

  it('writes a selection when there was none, so the builder takes the download', async () => {
    const t = await setup(undefined, { noSelection: true });
    await t.c.catalog();
    t.c.enqueue("UBIO'62");
    await t.idle();
    // a small folder: «all» of every kind, as the builder seeds it — written, not left to its seed
    expect(t.sel()).toEqual({
      bibles: null,
      dictionaries: null,
      commentaries: null,
      crossreferences: null,
      subheadings: null,
    });
    expect(t.rebuild).toHaveBeenCalledTimes(1);
  });

  it('keeps the list a day, then asks for the version alone', async () => {
    const t = await setup();
    await t.c.catalog();
    await t.c.catalog();
    expect(t.asked.filter((a) => a.url.endsWith('registry.zip'))).toHaveLength(1);
    await t.c.catalog(true);
    expect(t.asked.filter((a) => a.url.endsWith('registry.zip'))).toHaveLength(1);
    expect(t.asked.filter((a) => a.url.endsWith('registry_info.json'))).toHaveLength(1);
  });

  it('says so when every mirror fails, and rebuilds nothing', async () => {
    const t = await setup((u) => u.includes('UBIO'));
    await t.c.catalog();
    t.c.enqueue("UBIO'62");
    await t.idle();
    expect(t.c.queue().items[0]).toMatchObject({
      phase: 'failed',
      note: { key: 'Не вдалося завантажити модуль: дзеркала Module не відповідають' },
    });
    expect(t.rebuild).not.toHaveBeenCalled();
    expect(() => t.c.enqueue('NOPE')).toThrow(/NOPE/);
  });

  it('chooses the files of a kind that are in modules/', async () => {
    const t = await setup();
    fs.mkdirSync(path.join(tmp, 'modules'));
    fs.writeFileSync(path.join(tmp, 'modules', 'A.SQLite3'), '');
    fs.writeFileSync(path.join(tmp, 'modules', 'B.SQLite3'), '');
    expect(t.c.select('bibles', ['b.sqlite3', 'missing.SQLite3', 'B.SQLite3']).bibles).toEqual([
      'B.SQLite3',
    ]);
    expect(t.c.modules().files.bibles).toEqual(['A.SQLite3', 'B.SQLite3']);
  });
});
