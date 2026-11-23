import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { BOOKS, bookOfCode, bookOfOsis, bookOfZefania } from './formats/books.js';
import { guessLanguage, normalizeLanguage } from './formats/language.js';
import { strongsOf } from './formats/strongs.js';
import { ModuleError, moduleLabel } from './moduleFormat.js';
import { detectTextFormat, packUsfm, parseTextModule, type ParsedModule } from './textFormats.js';
import { profilesOf, PSALMS, versificationMap } from './versification.js';

const parse = (_name: string, s: string) => parseTextModule(strToU8(s));
const verseOf = (m: ParsedModule, book: number, chapter: number, verse: number) =>
  m.verses.find((v) => v.book === book && v.chapter === chapter && v.verse === verse)?.text;

const USFM = `\\id JHN Sample Text
\\usfm 3.0
\\ide UTF-8
\\h John
\\toc1 The Gospel of John
\\toc2 John
\\toc3 Jn
\\mt1 John
\\ip An introduction, no verse of it.
\\c 1
\\s1 The word
\\p
\\v 1 In the beginning \\add was\\add* the Word,\\f + \\fr 1:1 \\ft A note \\fqa here\\ft  more.\\f* and so on.\\x - \\xo 1:1 \\xt Gen 1:1\\x*
\\q1
\\v 2-3 He \\wj said it\\wj* ~ there.
\\c 2
\\p
\\v 1 \\w Grace|lemma="χάρις" strong="G5485"\\w* and \\w truth|strong="G0225"\\w*.
\\v 2 \\zaln-s |x-strong="G1"\\*\\w joined|x-occurrence="1"\\w*\\zaln-e\\* < word
\\q1 \\wj over the
\\q2 line\\wj* end
`;

const OSIS = `<?xml version="1.0" encoding="UTF-8"?>
<osis xmlns="http://example"><osisText osisIDWork="Smp" xml:lang="en">
<header><work osisWork="Smp"><title>Sample Text</title><language type="IETF">en</language></work></header>
<div type="book" osisID="John"><title type="main" short="Jn">John</title>
<chapter osisID="John.1"><title>The word</title><p>
<verse osisID="John.1.1">In the beginning was the Word,<note n="a">A note here more.</note><note type="crossReference">Gen 1:1</note> and so on.</verse>
<verse osisID="John.1.2 John.1.3">He <q who="Jesus" marker="">said it</q> there.</verse>
</p></chapter>
<chapter sID="John.2" osisID="John.2"/><verse sID="John.2.1" osisID="John.2.1"/><w lemma="strong:G5485" morph="robinson:N-NSF">Grace</w> and <w lemma="strong:G0225">truth</w>.<verse eID="John.2.1"/>
<verse sID="John.2.2" osisID="John.2.2"/>joined &lt; word <q who="Jesus" sID="q1"/>over the<l>line</l><q eID="q1"/> end<verse eID="John.2.2"/><chapter eID="John.2"/>
</div><div type="book" osisID="Nobook"><chapter osisID="Nobook.1"><verse osisID="Nobook.1.1">Lost.</verse></chapter></div>
</osisText></osis>`;

const ZEFANIA = `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE x [<!ENTITY a "b">]>
<XMLBIBLE biblename="Sample"><INFORMATION><title>Sample Text</title><language>ENG</language><rights>none</rights></INFORMATION>
<BIBLEBOOK bnumber="43" bname="John" bsname="Jn"><CHAPTER cnumber="1"><CAPTION vref="1">The word</CAPTION>
<VERS vnumber="1">In the beginning was the Word,<NOTE>A note here more.</NOTE> and so on.</VERS>
<VERS vnumber="2">He <STYLE css="color:red">said it</STYLE> there.</VERS></CHAPTER>
<CHAPTER cnumber="2"><VERS vnumber="1"><gr str="5485" rmac="N-NSF">Grace</gr> and <gr str="225">truth</gr>.</VERS>
<VERS vnumber="2">joined &lt; word</VERS></CHAPTER></BIBLEBOOK>
<BIBLEBOOK bnumber="99" bname="Other"><CHAPTER cnumber="1"><VERS vnumber="1">Lost.</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`;

const VPL = `JOH 1:1 In the beginning was the Word, and so on.
JOH 1:2 He said it there.
JOH 2:1 Grace and truth.
JOH 2:2 joined < word
ZZZ 1:1 Lost.
`;

describe('a text module read (1.25.0-beta.6)', () => {
  it('every format gives the same verses, titles and notes', () => {
    const all = {
      usfm: parse('s.usfm', USFM),
      osis: parse('s.osis.xml', OSIS),
      zefania: parse('s.xml', ZEFANIA),
    };
    for (const [format, m] of Object.entries(all)) {
      expect(m.format).toBe(format);
      expect(m.books).toEqual([{ number: 500, short: 'Jn', long: 'John', color: '#ff6600' }]);
      expect(verseOf(m, 500, 1, 1)).toBe('In the beginning was the Word, and so on.');
      expect(verseOf(m, 500, 1, 2)).toMatch(/^He <J>said it<\/J> +there\.$/);
      expect(verseOf(m, 500, 2, 1)).toMatch(
        /^Grace<S>5485<\/S>(<m>N-NSF<\/m>)? and truth<S>225<\/S>\.$/,
      );
      expect(verseOf(m, 500, 2, 2)).toMatch(/^joined(<S>1<\/S>)? ‹ word/);
      expect(m.subheadings).toEqual([
        { book: 500, chapter: 1, verse: 1, ord: 0, title: 'The word' },
      ]);
      expect(m.notes.map((n) => n.text)).toEqual(['A note here more.']);
      expect(m.info.hasStrong).toBe(true);
    }
    expect(all.osis.info).toMatchObject({ description: 'Sample Text', language: 'en', rtl: false });
    expect(all.zefania.info).toMatchObject({ description: 'Sample Text', language: 'en' });
    expect(all.osis.skipped).toEqual(['Nobook']);
    expect(all.zefania.skipped).toEqual(['Other']);
    // the words of Jesus go on over a line
    expect(verseOf(all.usfm, 500, 2, 2)).toBe('joined<S>1</S> ‹ word <J>over the line</J> end');
    expect(verseOf(all.osis, 500, 2, 2)).toBe('joined ‹ word <J>over the line</J> end');

    const vpl = parse('s.txt', VPL);
    expect(vpl.format).toBe('vpl');
    expect(vpl.verses).toHaveLength(4);
    expect(verseOf(vpl, 500, 1, 1)).toBe('In the beginning was the Word, and so on.');
    expect(vpl.skipped).toEqual(['ZZZ']);
    // a file with no names of its own: the language's
    expect(vpl.books[0]).toMatchObject({ short: 'John', long: 'John' });
  });

  it('USFM: attributes and milestones are no text, an introduction is no verse', () => {
    const m = parse('s.usfm', USFM);
    expect(m.verses.map((v) => v.text).join(' ')).not.toMatch(
      /lemma|strong=|zaln|introduction|\\|\|/,
    );
    expect(verseOf(m, 500, 2, 2)).toContain('joined<S>1</S> ‹ word');
  });

  it('USFM: a marker never closed takes no other verse with it', () => {
    const m = parse(
      'x.sfm',
      '\\id GEN\n\\c 1\n\\p\n\\v 1 One \\f + \\ft open note\n\\v 2 Two \\wj red\n\\p\n\\v 3 Three\n\\c 2\n\\p\n\\v 1a A\n\\v 1b B\n\\v 0 Title\n\\v 4 Four',
    );
    expect(verseOf(m, 10, 1, 1)).toBe('One');
    expect(verseOf(m, 10, 1, 2)).toBe('Two <J>red</J>');
    expect(verseOf(m, 10, 1, 3)).toBe('Three');
    expect(verseOf(m, 10, 2, 1)).toBe('A B');
    expect(m.subheadings).toEqual([{ book: 10, chapter: 2, verse: 4, ord: 0, title: 'Title' }]);
  });

  it('USFM: many books in a .zip; a book twice is read once; matter and junk left out', () => {
    const book = (code: string, text: string) =>
      strToU8(`\\id ${code} - The Sample\n\\h ${code}\n\\c 1\n\\p\n\\v 1 ${text}\n`);
    const zip = zipSync({
      'x/01-GEN.usfm': book('GEN', 'The first of the books'),
      'x/02-EXO.usfm': book('EXO', 'The second'),
      'x/02-EXO copy.usfm': book('EXO', 'A copy'),
      'x/00-FRT.usfm': book('FRT', 'Front'),
      'x/99-QQQ.usfm': book('QQQ', 'None'),
      '__MACOSX/x/._01-GEN.usfm': strToU8('\\id GEN junk'),
      'x/readme.txt': strToU8('Read me'),
    });
    const m = parseTextModule(zip);
    expect(m.books.map((b) => b.number)).toEqual([10, 20]);
    expect(verseOf(m, 20, 1, 1)).toBe('A copy'); // the first by name
    expect(m.info.description).toBe('The Sample');
    expect(m.skipped).toEqual(['QQQ']);
    // an archive with one file of another format
    expect(parseTextModule(zipSync({ 'a.xml': strToU8(OSIS) })).format).toBe('osis');
    expect(detectTextFormat('a.zip', zipSync({ 'a.txt': strToU8('Nothing') }))).toBeNull();
  });

  it('found in the review (1.25.0-beta.6)', () => {
    // an OSIS without its outer element; a title inside its verse; a text that looks like an entity
    const osis = parse(
      'x.xml',
      '<osisText><div type="book" osisID="Ps"><chapter osisID="Ps.3"><verse osisID="Ps.3.1"><title canonical="true">A Psalm</title>Lord &amp;lt; x</verse><verse osisID="Ps.3.2">Many</verse></chapter></div></osisText>',
    );
    expect(osis.subheadings).toMatchObject([{ chapter: 3, verse: 1, title: 'A Psalm' }]);
    expect(verseOf(osis, 230, 3, 1)).toBe('Lord &lt; x');
    // a translation in two files of one archive
    const part = (osisID: string) =>
      strToU8(
        `<osis><osisText><div type="book" osisID="${osisID}"><chapter osisID="${osisID}.1"><verse osisID="${osisID}.1.1">${osisID}</verse></chapter></div></osisText></osis>`,
      );
    const two = parseTextModule(zipSync({ 'nt.xml': part('Matt'), 'ot.xml': part('Gen') }));
    expect(two.verses.map((v) => v.text)).toEqual(['Gen', 'Matt']);
    expect(two.books.map((b) => b.number)).toEqual([10, 470]);
    // a note's last attribute; a code page named, and one told by the letters
    const usfm = parse('x.usfm', '\\id GEN\n\\c 1\n\\v 1 One\\f + \\ft text|attr="x"\\f*\n');
    expect(usfm.notes[0].text).toBe('text');
    const latin = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
    const french = 'Au commencement, Dieu cr\u00e9a';
    const said = parseTextModule(latin(`\\id GEN\n\\ide CP1252\n\\c 1\n\\v 1 ${french}\n`));
    expect(said.verses[0].text).toBe(french);
    expect(parseTextModule(latin(`GEN 1:1 ${french}\n`)).verses[0].text).toBe(french);
    expect(
      parseTextModule(latin('GEN 1:1 \u00cd\u00e0 \u00ef\u00ee\u00f7\u00e0\u00f2\u00ea\u00f3\n'))
        .verses[0].text,
    ).toBe('На початку');
  });

  it('USFM: a long file of unclosed or closed notes is read in a straight line', () => {
    const many = (note: string) => '\\id GEN\n\\c 1\n' + `\\v 1 a ${note}\n`.repeat(40_000);
    for (const note of ['\\f + \\ft open', '\\f + \\ft closed\\f*']) {
      const t = performance.now();
      parse('x.usfm', many(note));
      expect(performance.now() - t).toBeLessThan(3000);
    }
  });

  it('is told by content, not only by name', () => {
    const is = (name: string, s: string) => detectTextFormat(name, strToU8(s));
    expect(is('a.usfm', USFM)).toBe('usfm');
    expect(is('a.xml', OSIS)).toBe('osis');
    expect(is('a.xml', ZEFANIA)).toBe('zefania');
    expect(is('a.txt', VPL)).toBe('vpl');
    expect(is('a.txt', 'A sermon\nJohn 3:16 God so loved')).toBeNull();
    expect(is('a.xml', '<?xml version="1.0"?><svg/>')).toBeNull();
    expect(is('a.docx', USFM)).toBeNull();
    expect(is('._a.usfm', USFM)).toBeNull();
    expect(() => parse('a.usfm', '\\id GEN\n\\c 1\n')).toThrow(ModuleError);
    expect(() => parseTextModule(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2]))).toThrow(ModuleError);
  });

  it('other encodings: UTF-16, Windows-1251, the one an XML declares', () => {
    const line = 'GEN 1:1 На початку Бог створив небо та землю, і її';
    const u16 = new Uint8Array(2 + line.length * 2);
    u16.set([0xff, 0xfe]);
    for (let i = 0; i < line.length; i++) {
      u16[2 + i * 2] = line.charCodeAt(i) & 255;
      u16[3 + i * 2] = line.charCodeAt(i) >> 8;
    }
    const m = parseTextModule(u16);
    expect(m.verses[0].text).toBe('На початку Бог створив небо та землю, і її');
    expect(m.info.language).toBe('uk');
    expect(m.books[0]).toMatchObject({ short: 'Бут', long: 'Буття' });
    const cp = (s: string) =>
      Uint8Array.from(s, (c) =>
        c >= 'А' && c <= 'я' ? c.charCodeAt(0) - 0x410 + 0xc0 : c.charCodeAt(0),
      );
    const xml = `<?xml version="1.0" encoding="windows-1251"?><XMLBIBLE><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1"><VERS vnumber="1">Слово</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`;
    expect(parseTextModule(cp(xml)).verses[0].text).toBe('Слово');
  });

  it('the Psalms keep the file’s numbering, and are aligned to the other', () => {
    // the Greek numbering: 9 and 10 are one psalm, the next ones a number less
    const greek = [6, 12, 9, 9, 13, 11, 18, 10, 39, 7, 9, 6];
    const hebrew = [6, 12, 9, 9, 13, 11, 18, 10, 21, 18, 7, 9, 6];
    const vpl = (counts: number[]) =>
      counts
        .flatMap((n, c) => Array.from({ length: n }, (_, v) => `PSA ${c + 1}:${v + 1} text`))
        .join('\n');
    const profile = (counts: number[]) => {
      const m = parse('p.txt', vpl(counts));
      const max = new Map<number, number>();
      for (const v of m.verses) max.set(v.chapter, Math.max(max.get(v.chapter) ?? 0, v.verse));
      return profilesOf(
        [...max].map(([chapter, verses]) => ({
          translationId: 1,
          bookNumber: PSALMS,
          chapter,
          verses,
        })),
      ).get(`1-${PSALMS}`)!;
    };
    const map = versificationMap(profile(hebrew), profile(greek), PSALMS);
    expect(map(9, 22)).toEqual([10, 1]);
    expect(map(10, 1)).toEqual([11, 1]);
  });
});

describe('what the readers share', () => {
  it('the book tables are whole and agree', () => {
    expect(BOOKS.slice(0, 66).map((b) => b.number)).toEqual(
      BOOKS.slice(0, 66)
        .map((b) => b.number)
        .sort((a, b) => a - b),
    );
    expect(new Set(BOOKS.map((b) => b.number)).size).toBe(BOOKS.length);
    for (const b of BOOKS) {
      expect(bookOfCode(b.code)).toBe(b.number);
      expect(bookOfOsis(b.osis)).toBe(b.number);
      for (const n of [b.uk, b.ru, b.en]) {
        expect(n.short).toBeTruthy();
        expect(n.long).toBeTruthy();
      }
    }
    BOOKS.slice(0, 66).forEach((b, i) => expect(bookOfZefania(i + 1)).toBe(b.number));
    expect([bookOfCode('mar'), bookOfCode('1JO'), bookOfCode('XXX')]).toEqual([480, 690, null]);
    expect(bookOfZefania(0)).toBeNull();
  });

  it('Strong numbers, however they are written', () => {
    expect(strongsOf('G1080')).toEqual([1080]);
    expect(strongsOf('strong:H07225 strong:H0430')).toEqual([7225, 430]);
    expect(strongsOf('b:H1254a')).toEqual([1254]);
    expect(strongsOf('G25320', true)).toEqual([2532]);
    expect(strongsOf('G08460', true)).toEqual([846]);
    expect(strongsOf('1,2')).toEqual([1, 2]);
    expect(strongsOf('lemma')).toEqual([]);
  });

  it('a language said or guessed', () => {
    expect(['UKR', 'uk-UA', 'English', 'und', 'iw'].map(normalizeLanguage)).toEqual([
      'uk',
      'uk',
      'en',
      '',
      'he',
    ]);
    expect(guessLanguage('In the beginning God made the heaven and the earth')).toBe('en');
    expect(guessLanguage('Въ началѣ бѣ слово, и бысть вся тѣмъ')).toBe('ru');
    expect(guessLanguage('בראשית ברא אלהים')).toBe('he');
    expect(guessLanguage('Ἐν ἀρχῇ ἦν ὁ λόγος')).toBe('grc');
  });

  it('a file’s name and the books packed together', () => {
    expect(
      [
        'abc_usfm.zip',
        'x.osis.xml',
        'y.vpl.txt',
        'z.sfm',
        "U'62.SQLite3",
        'S.dictionary.SQLite3',
      ].map(moduleLabel),
    ).toEqual(['abc', 'x', 'y', 'z', "U'62", 'S']);
    const b = (name: string) => ({ name, bytes: strToU8('\\id GEN\n') });
    const two = [b('01-GENabc.usfm'), b('02-EXOabc.usfm')];
    const [one] = packUsfm(two);
    expect(one.name).toBe('abc.zip');
    expect(packUsfm([b('GEN.usfm'), b('EXO.usfm')]).map((z) => z.name)).toEqual(['USFM.zip']);
    expect(packUsfm(two)[0].bytes).toEqual(one.bytes);
    // names that say nothing are one module; two translations' books are two
    expect(packUsfm([b('Genesis.usfm'), b('Exodus.usfm')]).map((z) => z.name)).toEqual([
      'USFM.zip',
    ]);
    const other = [b('01-GENxyz.usfm'), b('02-EXOxyz.usfm')];
    expect(packUsfm([...two, ...other]).map((z) => z.name)).toEqual(['abc.zip', 'xyz.zip']);
    expect(packUsfm([...two, ...other], 'x', true)).toHaveLength(1);
  });
});
