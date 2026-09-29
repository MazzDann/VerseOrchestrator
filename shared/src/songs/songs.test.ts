import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_SQL } from '../library/schema.js';
import {
  bundleFileName,
  prepareBundle,
  readBundleMeta,
  readBundleSongs,
  stableSongId,
  upsertBundleSongs,
  writeBundleMeta,
  writeLibrarySongs,
  type Bundle,
} from './bundle.js';
import {
  importSongs,
  legacyBundleName,
  listBundles,
  syncFolderBundle,
  readBundles,
  refreshLibrarySongs,
} from './node.js';
import { isSongFile, parsePptx, songNumberTitle } from './pptx.js';

/** A minimal .pptx: a theme, a master with a scheme-coloured background, the given slides. */
function pptx(slides: string[]): Uint8Array {
  const slide = (text: string) =>
    `<p:sld><p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="914400" y="514350"/><a:ext cx="7315200" cy="4114800"/></a:xfrm></p:spPr>` +
    `<p:txBody><a:p><a:pPr algn="ctr"/>${text
      .split('\n')
      .map(
        (line, i) =>
          `${i ? '<a:br/>' : ''}<a:r><a:rPr lang="uk-UA" sz="4000" b="1"><a:solidFill><a:srgbClr val="FFFF00"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${line}</a:t></a:r>`,
      )
      .join('')}</a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const files: Record<string, Uint8Array> = {
    'ppt/presentation.xml': strToU8(
      '<p:presentation><p:sldSz cx="9144000" cy="5143500" type="custom"/></p:presentation>',
    ),
    'ppt/theme/theme1.xml': strToU8(
      '<a:theme><a:clrScheme name="x"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="1F3864"/></a:lt1></a:clrScheme>' +
        '<a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:theme>',
    ),
    'ppt/slideMasters/slideMaster1.xml': strToU8(
      '<p:sldMaster><p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill></p:bgPr></p:bg></p:cSld>' +
        '<p:clrMap bg1="lt1" tx1="dk1"/></p:sldMaster>',
    ),
  };
  slides.forEach((t, i) => (files[`ppt/slides/slide${i + 1}.xml`] = strToU8(slide(t))));
  return zipSync(files);
}

describe('a .pptx song', () => {
  it('number and title from the file name, one slide per slide with text, the look kept', () => {
    const song = parsePptx(pptx(['Слава', '', 'Слава Богу\nна висоті']), 'ПС/12. Слава.pptx');
    expect(song).toMatchObject({ key: '12. Слава', number: 12, title: 'Слава' });
    expect(song!.slides.map((s) => s.text)).toEqual(['Слава', 'Слава Богу\nна висоті']);
    expect(song!.slides[0].style).toMatchObject({
      bg: '#1f3864', // bg1 → lt1 through the master's colour map
      color: '#ffff00',
      bold: true,
      align: 'center',
      x: 10,
      y: 10,
      w: 80,
      h: 80,
    });
    expect(song!.slides[0].style!.font).toMatch(/^"Arial"/);
    expect(song!.slides[0].style!.size).toBeCloseTo((4000 * 12700) / 5143500, 5);
  });

  it('not a song: no text, or not a zip', () => {
    expect(parsePptx(pptx(['', '  ']), 'порожня.pptx')).toBeNull();
    expect(parsePptx(strToU8('not a zip'), 'x.pptx')).toBeNull();
  });

  it('names and files', () => {
    expect(songNumberTitle('123 - Назва')).toEqual({ number: 123, title: 'Назва' });
    expect(songNumberTitle('7) Назва')).toEqual({ number: 7, title: 'Назва' });
    expect(songNumberTitle('Назва без номера')).toEqual({
      number: null,
      title: 'Назва без номера',
    });
    expect(isSongFile('a/b/1. X.PPTX')).toBe(true);
    expect(isSongFile('~$1. X.pptx')).toBe(false);
    expect(isSongFile('1. X.ppt')).toBe(false);
  });
});

describe('song bundles', () => {
  it('stable ids: the same for the same bundle and key, positive, different otherwise', () => {
    const a = stableSongId('b1', '12. Слава');
    expect(stableSongId('b1', '12. Слава')).toBe(a);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(0x7fffffff);
    expect(stableSongId('b2', '12. Слава')).not.toBe(a);
    expect(stableSongId('b1', '13. Слава')).not.toBe(a);
  });

  it('file names: letters and digits kept, spaces to dashes, never one already taken', () => {
    expect(bundleFileName('ПС укр')).toBe('ПС-укр.vosongs');
    expect(bundleFileName('ПС укр', ['пс-укр.vosongs'])).toBe('ПС-укр-2.vosongs');
    expect(bundleFileName('***')).toBe('songs.vosongs');
  });

  it('a bundle file: meta, songs replaced by key', () => {
    const db = new Database(':memory:');
    prepareBundle(db);
    writeBundleMeta(db, { id: 'x', name: 'ПС', format: 1, created: '2026-09-29' });
    expect(readBundleMeta(db)).toEqual({ id: 'x', name: 'ПС', format: 1, created: '2026-09-29' });
    const slides = [{ text: 'a', style: null }];
    expect(
      upsertBundleSongs(db, [
        { key: '2. Б', number: 2, title: 'Б', slides },
        { key: '1. А', number: 1, title: 'А', slides },
      ]),
    ).toEqual({ added: 2, updated: 0 });
    expect(upsertBundleSongs(db, [{ key: '2. Б', number: 2, title: 'Бб', slides }])).toEqual({
      added: 0,
      updated: 1,
    });
    expect(readBundleSongs(db).map((s) => s.title)).toEqual(['А', 'Бб']);
  });

  it('the library: stable ids, the bundle name, slides; an old songs table gets its column', () => {
    const bundles: Bundle[] = [
      {
        meta: { id: 'b1', name: 'ПС', format: 1, created: '' },
        songs: [{ key: '1. А', number: 1, title: 'А', slides: [{ text: 'a', style: null }] }],
      },
    ];
    const lib = new Database(':memory:');
    lib.exec(SCHEMA_SQL);
    expect(writeLibrarySongs(lib, bundles)).toBe(1);
    const row = lib.prepare('SELECT id, bundle, title_norm FROM songs').get() as {
      id: number;
      bundle: string;
    };
    expect(row).toMatchObject({ id: stableSongId('b1', '1. А'), bundle: 'ПС' });
    writeLibrarySongs(lib, bundles); // again: the same id, nothing doubled
    expect(lib.prepare('SELECT COUNT(*) AS n FROM song_slides').get()).toEqual({ n: 1 });

    const old = new Database(':memory:');
    old.exec(
      'CREATE TABLE songs (id INTEGER PRIMARY KEY, number INTEGER, title TEXT, title_norm TEXT);' +
        'CREATE TABLE song_slides (song_id INTEGER, ord INTEGER, text TEXT, render TEXT);',
    );
    expect(writeLibrarySongs(old, bundles)).toBe(1);
  });
});

describe('song bundles on disk', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-songs-'));
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('a .pptx folder feeds its own bundle; imports add to one or make new ones', () => {
    const legacy = path.join(tmp, 'ПС укр 1-477');
    fs.mkdirSync(path.join(legacy, '1-100'), { recursive: true });
    fs.writeFileSync(path.join(legacy, '1-100', '1. Боже Вічний.pptx'), pptx(['Боже Вічний']));
    fs.writeFileSync(path.join(legacy, '1-100', '2. Слава.pptx'), pptx(['Слава']));
    fs.writeFileSync(path.join(legacy, '1-100', '~$2. Слава.pptx'), 'lock');
    fs.writeFileSync(path.join(legacy, 'зламаний.pptx'), 'not a zip');
    const dir = path.join(tmp, 'data', 'songs');

    const made = syncFolderBundle(dir, legacy);
    expect(made).toMatchObject({ count: 2, failed: ['зламаний.pptx'] });
    expect(made!.meta).toMatchObject({ name: 'ПС', source: 'ПС укр 1-477' });
    expect(syncFolderBundle(dir, legacy)).toBeNull(); // nothing newer than the bundle

    // a new file in the folder (newer than the bundle) goes into the same bundle
    const later = path.join(legacy, '1-100', '4. Нова.pptx');
    fs.writeFileSync(later, pptx(['Нова']));
    const future = new Date(Date.now() + 60_000);
    fs.utimesSync(later, future, future);
    expect(syncFolderBundle(dir, legacy)).toMatchObject({ count: 3 });
    expect(listBundles(dir)).toHaveLength(1);

    const [ps] = listBundles(dir);
    const again = importSongs(dir, { id: ps.meta.id }, [
      { key: '2. Слава', number: 2, title: 'Слава', slides: [{ text: 'Слава!', style: null }] },
      { key: '3. Хвала', number: 3, title: 'Хвала', slides: [{ text: 'Хвала', style: null }] },
    ]);
    expect(again).toMatchObject({ added: 1, updated: 1 }); // «2. Слава» again, «3. Хвала» new
    importSongs(dir, { name: 'Molodizhni' }, [
      { key: 'Song', number: null, title: 'Song', slides: [{ text: 'x', style: null }] },
    ]);
    // by name, Ukrainian order: Cyrillic before Latin
    expect(readBundles(dir).map((b) => [b.meta.name, b.songs.length])).toEqual([
      ['ПС', 4],
      ['Molodizhni', 1],
    ]);

    const libFile = path.join(tmp, 'library.db');
    const lib = new Database(libFile);
    lib.exec(SCHEMA_SQL);
    lib.close();
    expect(refreshLibrarySongs(libFile, dir)).toBe(5);
  });

  it('a bundle made before it remembered its folder is adopted, not doubled', () => {
    const legacy = path.join(tmp, 'ПС укр 1-477');
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, '1. Боже Вічний.pptx'), pptx(['Боже Вічний']));
    const dir = path.join(tmp, 'data', 'songs');
    importSongs(dir, { name: 'ПС' }, []); // no source
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(legacy, '1. Боже Вічний.pptx'), past, past);
    expect(syncFolderBundle(dir, legacy)).toBeNull();
    expect(listBundles(dir).map((b) => b.meta.source)).toEqual(['ПС укр 1-477']);
  });

  it('names for old folders', () => {
    expect(legacyBundleName('/x/ПС укр 1-477')).toBe('ПС');
    expect(legacyBundleName('/x/songs')).toBe('Пісні');
    expect(legacyBundleName('/x/Молодіжні')).toBe('Молодіжні');
  });
});
