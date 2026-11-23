import { strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { chordLine } from './formats/songBuilder.js';
import { sectionLabel } from './formats/labels.js';
import { isChordLine, songParts, withoutChordLines } from './sections.js';
import { isOpenLyrics, parseSongFile, songFilesOf, songFormat } from './textSongs.js';

const read = (name: string, s: string) => parseSongFile(strToU8(s), name);
const texts = (name: string, s: string) => read(name, s)[0]?.slides.map((x) => x.text);
/** what the hall sees */
const screen = (slides: string[]) => slides.map((t) => withoutChordLines(t).text);

const OPENLYRICS = `<?xml version="1.0" encoding="UTF-8"?>
<song version="0.8"><properties>
  <titles><title>Morning song</title><title lang="uk">Ранкова</title></titles>
  <authors><author type="words">A. Writer</author><author type="music">A. Writer</author></authors>
  <songbooks><songbook name="Sample" entry="12"/></songbooks>
  <verseOrder>v1 c v2 c</verseOrder></properties>
 <lyrics>
  <verse name="v1"><lines><chord name="D"/>The first <chord name="Bm7b5"/>line &amp; more<br/>
    the second <tag name="it">line</tag><comment>softly</comment></lines></verse>
  <verse name="c"><lines><chord name="G"/>Sing it all</lines></verse>
  <verse name="v2"><lines>The third line</lines></verse>
  <verse name="v3"><lines>Never sung</lines></verse>
  <verse name="v1" lang="uk"><lines>Перший рядок</lines></verse>
 </lyrics></song>`;

const CHORDPRO = `# a note
{title: Morning song}
{artist: A. Writer}
{key: D}

{start_of_verse}
[D]The first [Bm7]line
the [*soft]second line
{end_of_verse}

{soc}
[G]Sing it [XYZ]all
{eoc}

The third line

{chorus}
{sot}
e|--0--1--|
{eot}
[D] [G] [A]
`;

describe('songs in text formats (1.25.0-beta.7)', () => {
  it('OpenLyrics: the order it gives, the chorus labelled, chords over the words', () => {
    const [song] = read('x/Morning.xml', OPENLYRICS);
    expect(song).toMatchObject({ key: 'Morning', number: 12, title: 'Morning song' });
    const t = song.slides.map((x) => x.text);
    expect(t).toEqual([
      'Morning song\nA. Writer',
      'D         Bm7b5\nThe first line & more\nthe second line',
      'Chorus:\n(G)\nSing it all',
      'The third line',
      'Chorus:\n(G)\nSing it all',
    ]);
    expect(song.slides.every((x) => x.style === null)).toBe(true);
    expect(screen(t)[1]).toBe('The first line & more\nthe second line');
    expect(screen(t)[2]).toBe('Chorus:\nSing it all');
    expect(songParts(t).map((p) => p.kind)).toEqual([
      'title',
      'verse',
      'chorus',
      'verse',
      'chorus',
    ]);
    expect(isOpenLyrics(strToU8(OPENLYRICS))).toBe(true);
    expect(read('x.xml', '<osis><song/></osis>')).toEqual([]);
    expect(read('x.xml', '<svg/>')).toEqual([]);
  });

  it('OpenLyrics: without an order, the first language’s verses as they stand', () => {
    const t = texts('1. A.xml', OPENLYRICS.replace(/<verseOrder>.*<\/verseOrder>/, ''));
    expect(t).toHaveLength(5);
    expect(t.join()).not.toContain('Перший');
    expect(t[4]).toBe('Never sung');
  });

  it('ChordPro: chords above, the chorus again, no tablature', () => {
    const [song] = read('5. Morning.cho', CHORDPRO);
    expect(song).toMatchObject({ key: '5. Morning', number: 5, title: 'Morning song' });
    const t = song.slides.map((x) => x.text);
    expect(t).toEqual([
      'Morning song\nA. Writer',
      'D         Bm7\nThe first line\nthe second line',
      'Chorus:\n(G)\nSing it all',
      'The third line',
      'Chorus:\n(G)\nSing it all',
    ]);
    expect(screen(t).join('\n')).not.toMatch(/Bm7|\(G\)|\[|\{/);
  });

  it('ChordPro: a comment or a line names the chorus; its label alone is the chorus again', () => {
    expect(
      texts(
        'a.cho',
        '{c: Приспів}\nслава, її\n\nодин\n\nПриспів:\n\nдва\n{c: softly}\n\nChorus 2:\nінша',
      )?.slice(1),
    ).toEqual(['Приспів:\nслава, її', 'один', 'Приспів:\nслава, її', 'два', 'Chorus 2:\nінша']);
  });

  it('ChordPro: several songs in one file', () => {
    const songs = read(
      'All.chopro',
      '{t: One}\nla la\n{ns}\n{t: Two}\nlo lo\n{new_song}\n{t: One}\nlu lu',
    );
    expect(songs.map((s) => [s.key, s.title])).toEqual([
      ['All – One', 'One'],
      ['All – Two', 'Two'],
      ['All – One (3)', 'One'],
    ]);
  });

  it('plain text: a blank line is a new slide, the labels are read', () => {
    const t = texts(
      '7) Назва файлу.txt',
      '№ 12. Ранкова пісня\r\n\r\nКуплет 1:\r\nПерший рядок\r\nДругий рядок, і її\r\n \r\nПриспів:\r\nСпіваймо всі\r\n\r\n[Куплет 2]\r\nТретій рядок\r\n\r\nПриспів:\r\n\r\n',
    );
    expect(t).toEqual([
      'Ранкова пісня',
      'Перший рядок\nДругий рядок, і її',
      'Приспів:\nСпіваймо всі',
      'Третій рядок',
      'Приспів:\nСпіваймо всі',
    ]);
    expect(read('7) Назва файлу.txt', '№ 12. Ранкова\n\nсвіт')[0]).toMatchObject({
      number: 12,
      title: 'Ранкова',
      key: '7) Назва файлу',
    });
    // no title of its own: the file's name; a label apart from its words; the words written again
    expect(
      texts(
        '3. Вечірня.txt',
        'один рядок, її\nдва\n\nПриспів:\n\nслава\n\nтри\n\nПриспів:\n\nслава',
      ),
    ).toEqual(['Вечірня', 'один рядок, її\nдва', 'Приспів:\nслава', 'три', 'Приспів:\nслава']);
    // chords over the words stay in the list, not on the screen
    const chords = texts('A.txt', 'Title\n\nC  G7\nwords here\n\nmore');
    expect(chords[1]).toBe('C  G7\nwords here');
    expect(screen(chords)[1]).toBe('words here');
    expect(read('empty.txt', ' \n\n')).toEqual([]);
  });

  it('files by their names; a folder’s notes beside presentations are no songs', () => {
    expect(
      ['a.pptx', 'a.CHO', 'a.crd', 'a.xml', 'a.txt', '.a.txt', '~$a.pptx', 'a.docx'].map(
        songFormat,
      ),
    ).toEqual(['pptx', 'chordpro', 'chordpro', 'openlyrics', 'text', null, null, null]);
    const of = (names: string[], folder: boolean) => songFilesOf(names, (n) => n, folder);
    expect(of(['a.pptx', 'readme.txt'], true)).toEqual(['a.pptx']);
    expect(of(['a.pptx', 'song.txt'], false)).toEqual(['a.pptx', 'song.txt']);
    expect(of(['a.txt', 'b.cho', 'c.docx'], true)).toEqual(['a.txt', 'b.cho']);
  });

  it('every chord line written is one the screen leaves out', () => {
    const at = (...c: string[]) => chordLine(c.map((chord, i) => ({ at: i * 4, chord })));
    for (const l of [at('C'), at('Am'), at('B♭', 'F♯m7'), at('C', 'N.C.', 'G/B'), at('H')]) {
      expect(l).not.toBe('');
      expect(isChordLine(l)).toBe(true);
    }
    expect(at('C', 'N.C.', 'G/B')).toBe('C       G/B');
    expect(at('what')).toBe('');
    expect(
      chordLine([
        { at: 0, chord: 'Am7' },
        { at: 1, chord: 'D' },
      ]),
    ).toBe('Am7 D');
  });

  it('labels: the word, a number, a note in brackets — not a line that begins with it', () => {
    expect(sectionLabel('Приспів (2 рази):')).toEqual({
      kind: 'chorus',
      label: 'Приспів (2 рази):',
    });
    expect(sectionLabel('[Chorus]')).toEqual({ kind: 'chorus' });
    expect(sectionLabel('2 куплет')).toEqual({ kind: 'verse' });
    expect(sectionLabel('Verse 3:')).toEqual({ kind: 'verse' });
    expect(sectionLabel('Приспів співаймо разом')).toBeNull();
    expect(sectionLabel('Versatile')).toBeNull();
    expect(sectionLabel('1. Вступ до пісні')).toBeNull();
  });
});
