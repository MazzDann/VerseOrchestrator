import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_SQL } from '../library/schema.js';
import {
  bundleFileName,
  countBundleSongs,
  prepareBundle,
  readBundleMeta,
  readBundleSongs,
  sameBundleName,
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
  renameBundle,
  restoreBundle,
  snapshotBundle,
  trashBundle,
  undoImport,
  syncFolderBundle,
  readBundles,
  refreshLibrarySongs,
} from './node.js';
import {
  isSongFile,
  mainText,
  markedText,
  parsePptx,
  PPTX_READER,
  SECOND_CLOSE,
  SECOND_OPEN,
  secondParts,
  songKey,
  songNumberTitle,
  unmark,
} from './pptx.js';

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

/**
 * A song as PowerPoint makes one (1.2.1): a title slide (a title placeholder the layout
 * anchors to the bottom + the authors in a subtitle), a chorus with a «Приспів:» text box
 * over it, a plain stanza. The master centres titles.
 */
function titledPptx(): Uint8Array {
  const para = (t: string, sz: number) =>
    `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="uk-UA" sz="${sz}"/><a:t>${t}</a:t></a:r></a:p>`;
  const sp = (ph: string, x: number, y: number, cx: number, cy: number, body: string) =>
    `<p:sp><p:nvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/>` +
    `<a:ext cx="${cx}" cy="${cy}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/>${body}</p:txBody></p:sp>`;
  const sld = (shapes: string) => `<p:sld><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`;
  const run = (t: string, fill: string) =>
    `<a:r><a:rPr lang="uk-UA" sz="7200"><a:solidFill>${fill}</a:solidFill></a:rPr><a:t>${t}</a:t></a:r>`;
  const rels = (layout: number) =>
    `<Relationships><Relationship Id="rId1" Target="../slideLayouts/slideLayout${layout}.xml"/></Relationships>`;
  const layoutSp = (ph: string, bodyPr: string) =>
    `<p:sp><p:nvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:txBody>${bodyPr}</p:txBody></p:sp>`;
  const files: Record<string, string> = {
    'ppt/presentation.xml':
      '<p:presentation><p:sldSz cx="9144000" cy="5143500" type="screen16x9"/></p:presentation>',
    'ppt/theme/theme1.xml':
      '<a:theme><a:clrScheme name="x"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1></a:clrScheme></a:theme>',
    'ppt/slideMasters/slideMaster1.xml':
      '<p:sldMaster><p:cSld><p:spTree>' +
      layoutSp('<p:ph type="title"/>', '<a:bodyPr vert="horz" anchor="ctr"/>') +
      layoutSp('<p:ph type="body" idx="1"/>', '<a:bodyPr vert="horz"/>') +
      '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1"/></p:sldMaster>',
    'ppt/slideLayouts/slideLayout1.xml':
      '<p:sldLayout><p:cSld><p:spTree>' +
      layoutSp('<p:ph type="ctrTitle"/>', '<a:bodyPr anchor="b"/>') +
      layoutSp('<p:ph type="subTitle" idx="1"/>', '<a:bodyPr/>') +
      '</p:spTree></p:cSld></p:sldLayout>',
    'ppt/slideLayouts/slideLayout6.xml':
      '<p:sldLayout><p:cSld><p:spTree>' +
      layoutSp('<p:ph type="title"/>', '<a:bodyPr/>') +
      '</p:spTree></p:cSld></p:sldLayout>',
    'ppt/slides/slide1.xml': sld(
      sp('<p:ph type="ctrTitle"/>', 0, 841772, 9144000, 1790700, para('10. Вся шир землі', 6000)) +
        sp(
          '<p:ph type="subTitle" idx="1"/>',
          728663,
          4135211,
          7686675,
          1241822,
          para('Ян Вільсон', 2000) + para('Укр. текст: О. Павлюк', 2000),
        ),
    ),
    'ppt/slides/_rels/slide1.xml.rels': rels(1),
    'ppt/slides/slide2.xml': sld(
      sp('<p:ph type="title"/>', 0, 273844, 9144000, 4597701, para('Алілуя, Алілуя', 7200)) +
        sp('', 2996419, 340000, 3094892, 400110, para('Приспів:', 2000)),
    ),
    'ppt/slides/_rels/slide2.xml.rels': rels(6),
    'ppt/slides/slide3.xml': sld(
      sp('<p:ph type="title"/>', 0, 273844, 9144000, 4597701, para('Строфа', 7200)),
    ),
    'ppt/slides/_rels/slide3.xml.rels': rels(6),
    // an echo in yellow (1.3.0): «Слово істини (істини)», then a whole yellow line with a
    // space at its end; «white» as a preset colour is the same white, not a second part
    'ppt/slides/slide4.xml': sld(
      sp(
        '<p:ph type="title"/>',
        0,
        273844,
        9144000,
        4597701,
        '<a:p>' +
          run('Слово істини (', '<a:schemeClr val="bg1"/>') +
          run('істини', '<a:srgbClr val="FFFF00"/>') +
          run(')', '<a:prstClr val="white"/>') +
          '</a:p><a:p>' +
          run('вічне ', '<a:srgbClr val="FFFF00"/>') +
          '</a:p>',
      ),
    ),
    'ppt/slides/_rels/slide4.xml.rels': rels(6),
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
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

  it('a title slide keeps its authors in their own box, the title at its box’s bottom (1.2.1)', () => {
    const song = parsePptx(titledPptx(), '10. Вся шир землі.pptx')!;
    const [title, chorus, stanza] = song.slides;
    // plain text and search: everything, top to bottom
    expect(title.text.split('\n')).toEqual([
      '10. Вся шир землі',
      'Ян Вільсон',
      'Укр. текст: О. Павлюк',
    ]);
    expect(title.style).toMatchObject({ anchor: 'bottom', x: 0, w: 100 });
    expect(title.style!.y).toBeCloseTo(16.37, 1);
    expect(title.style!.sub!.text.split('\n')).toEqual(['Ян Вільсон', 'Укр. текст: О. Павлюк']);
    expect(title.style!.sub).toMatchObject({
      anchor: 'top', // the subtitle: the layout says nothing, the master's body neither
      align: 'center',
    });
    expect(title.style!.sub!.y).toBeCloseTo(80.4, 1);
    expect(title.style!.sub!.size).toBeCloseTo((2000 * 12700) / 5143500, 5);
    expect(mainText(title.text, title.style)).toBe('10. Вся шир землі');

    // a label over the chorus comes first in the text; the chorus itself centred (master)
    expect(chorus.text.split('\n')).toEqual(['Приспів:', 'Алілуя, Алілуя']);
    expect(chorus.style).toMatchObject({
      anchor: 'middle',
      sub: { text: 'Приспів:', anchor: 'top' },
    });
    expect(mainText(chorus.text, chorus.style)).toBe('Алілуя, Алілуя');

    expect(stanza.text).toBe('Строфа');
    expect(stanza.style).toMatchObject({ anchor: 'middle' });
    expect(stanza.style!.sub).toBeUndefined();
    expect(mainText(stanza.text, stanza.style)).toBe('Строфа');
    expect(mainText('Старий текст', null)).toBe('Старий текст');
  });

  it('words in another colour are the second part, marked in the main text (1.3.0)', () => {
    const song = parsePptx(titledPptx(), '10. Вся шир землі.pptx')!;
    const echo = song.slides[3];
    const [o, c] = [SECOND_OPEN, SECOND_CLOSE];
    expect(echo.text).toBe('Слово істини (істини)\nвічне');
    // the space at the yellow line's end goes, as in the plain text
    expect(echo.style!.second).toEqual({
      text: `Слово істини (${o}істини${c})\n${o}вічне${c}`,
      color: '#ffff00',
    });
    expect(secondParts(echo.style!.second!.text)).toEqual([
      { text: 'Слово істини (', second: false },
      { text: 'істини', second: true },
      { text: ')\n', second: false },
      { text: 'вічне', second: true },
    ]);
    expect(unmark(echo.style!.second!.text)).toBe(echo.text);
    expect(markedText(echo.text, echo.style)).toBe(echo.style!.second!.text);
    // one colour — no second part
    expect(song.slides[2].style!.second).toBeUndefined();
    expect(markedText(song.slides[2].text, song.slides[2].style)).toBeNull();
  });

  it('the whole slide marked where a separate box adds its words (1.3.0)', () => {
    const [o, c] = [SECOND_OPEN, SECOND_CLOSE];
    const box = {
      color: '#ffffff',
      align: 'center',
      anchor: 'top',
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      size: 4,
    };
    const style = {
      ...{ bg: '#000000', color: '#ffffff', font: 'x', bold: false, align: 'center' as const },
      ...{ x: 0, y: 10, w: 100, h: 80, size: 10 },
      sub: { ...box, text: 'Приспів:', align: 'center' as const, anchor: 'top' as const },
      second: { text: `Слава (${o}слава${c})`, color: '#ffff00' },
    };
    expect(markedText('Приспів:\nСлава (слава)', style)).toBe(`Приспів:\nСлава (${o}слава${c})`);
    // a text that doesn't match the marks (another reader wrote them): none
    expect(markedText('Приспів:\nІнше', style)).toBeNull();
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

  it('names: case and outer spaces make no second bundle', () => {
    expect(sameBundleName('ПС', ' пс ')).toBe(true);
    expect(sameBundleName('Молодіжні', 'МОЛОДІЖНІ')).toBe(true);
    expect(sameBundleName('ПС', 'ПС укр')).toBe(false);
    expect(sameBundleName('Мої', 'Мої'.normalize('NFD'))).toBe(true); // a Mac\'s «ї»
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

  it("keys in one Unicode form: a Mac's decomposed «й» is the same song as Windows' one", () => {
    const nfc = '1. Боже Вічний'; // «й» as one character (Windows, browsers)
    const nfd = nfc.normalize('NFD'); // «и» + a combining breve (a Mac\'s file names)
    expect(nfd).not.toBe(nfc);
    expect(songKey(`/songs/${nfd}.pptx`)).toBe(nfc);
    expect(stableSongId('b1', songKey(`${nfd}.pptx`))).toBe(stableSongId('b1', nfc));

    const db = new Database(':memory:');
    prepareBundle(db);
    const slides = [{ text: 'a', style: null }];
    upsertBundleSongs(db, [{ key: nfc, number: 1, title: 'Боже Вічний', slides }]);
    const again = [{ key: nfd, number: 1, title: 'Боже Вічний'.normalize('NFD'), slides }];
    expect(upsertBundleSongs(db, again)).toEqual({ added: 0, updated: 1 });
    expect(db.prepare('SELECT key, title FROM songs').all()).toEqual([
      { key: nfc, title: 'Боже Вічний' },
    ]);

    // a bundle 1.3.0 wrote on a Mac: the Windows row and the Mac's under another spelling
    const put = db.prepare('INSERT INTO songs (key, number, title, slides) VALUES (?, ?, ?, ?)');
    put.run(nfd, 1, 'Боже Вічний'.normalize('NFD'), JSON.stringify([{ text: 'b', style: null }]));
    put.run('2. Слава', 2, 'Слава', JSON.stringify(slides));
    expect(countBundleSongs(db)).toBe(2);
    const read = readBundleSongs(db);
    expect(read.map((s) => [s.key, s.title, s.slides[0].text])).toEqual([
      [nfc, 'Боже Вічний', 'b'], // one song, the row written last
      ['2. Слава', 'Слава', 'a'],
    ]);
    // the next write leaves one spelling
    expect(upsertBundleSongs(db, [{ key: nfc, number: 1, title: 'Боже Вічний', slides }])).toEqual({
      added: 0,
      updated: 1,
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM songs').get()).toEqual({ n: 2 });
  });

  it('one key twice in one write (two spellings) counts once', () => {
    const db = new Database(':memory:');
    prepareBundle(db);
    const slides = [{ text: 'a', style: null }];
    const nfc = '1. Боже Вічний';
    const both = [
      { key: nfc, number: 1, title: 'Боже Вічний', slides },
      { key: nfc.normalize('NFD'), number: 1, title: 'Боже Вічний', slides },
    ];
    expect(upsertBundleSongs(db, both)).toEqual({ added: 1, updated: 1 });
    expect(upsertBundleSongs(db, both)).toEqual({ added: 0, updated: 2 });
    expect(db.prepare('SELECT key FROM songs').all()).toEqual([{ key: nfc }]);
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

  it('a folder bundle an older .pptx reader wrote is read again, once (1.2.1)', () => {
    const legacy = path.join(tmp, 'ПС укр 1-477');
    fs.mkdirSync(legacy, { recursive: true });
    const file = path.join(legacy, '10. Вся шир землі.pptx');
    fs.writeFileSync(file, titledPptx());
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(file, past, past);
    const dir = path.join(tmp, 'data', 'songs');
    const made = syncFolderBundle(dir, legacy)!;
    expect(made.meta.reader).toBe(PPTX_READER);
    // as a bundle from before 1.2.1: no reader in its meta, the title slide read the old way
    const bundleFile = path.join(dir, made.file);
    const db = new Database(bundleFile);
    db.prepare("DELETE FROM meta WHERE key = 'reader'").run();
    db.prepare('UPDATE songs SET slides = ?').run(JSON.stringify([{ text: 'old', style: null }]));
    db.close();
    expect(listBundles(dir)[0].meta.reader).toBeUndefined();

    const again = syncFolderBundle(dir, legacy); // the file is older than the bundle
    expect(again).toMatchObject({ meta: { reader: PPTX_READER } });
    expect(readBundles(dir)[0].songs[0].slides[0].style!.sub).toBeDefined();
    expect(syncFolderBundle(dir, legacy)).toBeNull(); // read by this reader: nothing to do
  });

  it("a Windows bundle and a Mac's folder: one song per file, the doubles 1.3.0 made go", () => {
    const legacy = path.join(tmp, 'ПС укр 1-477');
    fs.mkdirSync(legacy, { recursive: true });
    const nfc = '1. Боже Вічний';
    // the Mac\'s folder: the file name decomposed
    const file = path.join(legacy, `${nfc.normalize('NFD')}.pptx`);
    fs.writeFileSync(file, pptx(['Боже Вічний']));
    fs.writeFileSync(path.join(legacy, '2. Слава.pptx'), pptx(['Слава']));
    const past = new Date(Date.now() - 60_000);
    for (const f of fs.readdirSync(legacy)) fs.utimesSync(path.join(legacy, f), past, past);
    // the bundle as it came from Windows: composed keys, read by 1.3.0\'s reader
    const dir = path.join(tmp, 'data', 'songs');
    const slides = [{ text: 'old', style: null }];
    const made = importSongs(dir, { name: 'ПС', source: 'ПС укр 1-477' }, [
      { key: nfc, number: 1, title: 'Боже Вічний', slides },
      { key: '2. Слава', number: 2, title: 'Слава', slides },
    ]);
    const bundleFile = path.join(dir, made.bundle.file);
    const db = new Database(bundleFile);
    writeBundleMeta(db, { ...made.bundle.meta, reader: 3 });
    // and the double 1.3.0 added on the Mac
    db.prepare('INSERT INTO songs (key, number, title, slides) VALUES (?, ?, ?, ?)').run(
      nfc.normalize('NFD'),
      1,
      'Боже Вічний'.normalize('NFD'),
      JSON.stringify(slides),
    );
    db.close();
    expect(listBundles(dir)[0].count).toBe(2); // counted once already

    const again = syncFolderBundle(dir, legacy)!; // reader 3 < 4: read again
    expect(again).toMatchObject({ count: 2, meta: { reader: PPTX_READER } });
    const bdb = new Database(bundleFile, { readonly: true });
    const rows = bdb.prepare('SELECT key FROM songs ORDER BY key').all() as { key: string }[];
    bdb.close(); // an open handle keeps Windows from deleting the temp folder
    expect(rows.map((r) => r.key)).toEqual([nfc, '2. Слава']);
    expect(readBundles(dir)[0].songs[0].slides[0].text).not.toBe('old');
    expect(syncFolderBundle(dir, legacy)).toBeNull();

    // the library: the ids Windows gives these songs
    const libFile = path.join(tmp, 'library.db');
    const lib = new Database(libFile);
    lib.exec(SCHEMA_SQL);
    lib.close();
    expect(refreshLibrarySongs(libFile, dir)).toBe(2);
    const ldb = new Database(libFile, { readonly: true });
    const ids = ldb.prepare('SELECT id FROM songs ORDER BY number').all() as { id: number }[];
    ldb.close();
    expect(ids.map((r) => r.id)).toEqual([
      stableSongId(made.bundle.meta.id, nfc),
      stableSongId(made.bundle.meta.id, '2. Слава'),
    ]);
  });

  const song = (key: string, text = key) => ({
    key,
    number: Number.parseInt(key, 10) || null,
    title: key,
    slides: [{ text, style: null }],
  });

  it('a bundle renamed keeps its id and songs, its file follows the name (1.4.0)', () => {
    const dir = path.join(tmp, 'songs');
    const { bundle } = importSongs(dir, { name: 'Молодіжні' }, [song('1. Світло')]);
    const renamed = renameBundle(dir, bundle.meta.id, ' Юнацькі ')!;
    expect(renamed.meta).toMatchObject({ id: bundle.meta.id, name: 'Юнацькі' });
    expect(renamed.file).toBe('Юнацькі.vosongs');
    expect(listBundles(dir).map((b) => [b.file, b.meta.name, b.count])).toEqual([
      ['Юнацькі.vosongs', 'Юнацькі', 1],
    ]);
    expect(renameBundle(dir, 'no-such-id', 'x')).toBeNull();
  });

  it('a deleted bundle waits in the trash for «Скасувати» (1.4.0)', () => {
    const dir = path.join(tmp, 'songs');
    const { bundle } = importSongs(dir, { name: 'ПС' }, [song('1. Світло'), song('2. Слава')]);
    const gone = trashBundle(dir, bundle.meta.id)!;
    expect(listBundles(dir)).toEqual([]);
    const back = restoreBundle(dir, gone.trashed)!;
    expect(back.meta.id).toBe(bundle.meta.id);
    expect(back.count).toBe(2);
    // once more deleted, and a bundle of that name made meanwhile: it can't come back
    const again = trashBundle(dir, bundle.meta.id)!;
    importSongs(dir, { name: ' пс' }, []);
    expect(restoreBundle(dir, again.trashed)).toBeNull();
    expect(restoreBundle(dir, 'nothing-there.vosongs')).toBeNull();
  });

  it('an import can be undone: the bundle as it was, or gone if it made it (1.4.0)', () => {
    const dir = path.join(tmp, 'songs');
    const { bundle } = importSongs(dir, { name: 'ПС' }, [song('1. Світло', 'стара')]);
    const undo = snapshotBundle(dir, bundle.file);
    importSongs(dir, { id: bundle.meta.id }, [song('1. Світло', 'нова'), song('2. Слава')]);
    expect(readBundles(dir)[0].songs.map((x) => x.slides[0].text)).toEqual(['нова', '2. Слава']);
    expect(undoImport(dir, undo)).toBe(true);
    expect(readBundles(dir)[0].songs.map((x) => x.slides[0].text)).toEqual(['стара']);
    expect(undoImport(dir, undo)).toBe(false); // once
    const made = importSongs(dir, { name: 'Нові' }, [song('9. Нова')]);
    expect(undoImport(dir, { file: made.bundle.file, created: true })).toBe(true);
    expect(listBundles(dir).map((b) => b.meta.name)).toEqual(['ПС']);
  });

  it('names for old folders', () => {
    expect(legacyBundleName('/x/ПС укр 1-477')).toBe('ПС');
    expect(legacyBundleName('/x/songs')).toBe('Пісні');
    expect(legacyBundleName('/x/Молодіжні')).toBe('Молодіжні');
    expect(legacyBundleName('/x/Мої пісні'.normalize('NFD'))).toBe('Мої пісні');
  });

  it('a folder whose name a Mac spells decomposed finds the bundle Windows made from it', () => {
    const nfc = 'Мої пісні';
    const legacy = path.join(tmp, nfc.normalize('NFD'));
    fs.mkdirSync(legacy, { recursive: true });
    const file = path.join(legacy, '2. Слава.pptx');
    fs.writeFileSync(file, pptx(['Слава']));
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(file, past, past);
    const dir = path.join(tmp, 'data', 'songs');
    const slides = [{ text: 'Слава', style: null }];
    const made = importSongs(dir, { name: nfc, source: nfc }, [
      { key: '2. Слава', number: 2, title: 'Слава', slides },
    ]);
    const db = new Database(path.join(dir, made.bundle.file));
    writeBundleMeta(db, { ...made.bundle.meta, reader: PPTX_READER });
    db.close();
    expect(syncFolderBundle(dir, legacy)).toBeNull(); // the same bundle, nothing newer
    expect(listBundles(dir)).toHaveLength(1);
  });
});
