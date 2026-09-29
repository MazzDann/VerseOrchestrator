import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMA_SQL } from '@vo/shared';
import { createBundle, importSongs } from '@vo/shared/songs-node';
import { parseSongImport, syncSongsAtStart } from './songs';

const style = {
  bg: '#000000',
  color: '#ffffff',
  font: 'Arial',
  bold: false,
  align: 'center',
  x: 5,
  y: 10,
  w: 90,
  h: 80,
  size: 6.5,
};
const song = (over: Record<string, unknown> = {}) => ({
  key: '12. Світло',
  number: 12,
  title: 'Світло',
  slides: [
    { text: 'Світло', style: null },
    { text: 'Перший куплет', style },
  ],
  ...over,
});
/** The status and message a bad body is refused with. */
const refusal = (body: unknown) => {
  try {
    parseSongImport(body);
  } catch (e) {
    return { status: (e as { status?: number }).status, message: (e as Error).message };
  }
  return null;
};

describe('a song import body (0.10.1)', () => {
  it('takes a bundle id or a trimmed name for a new bundle', () => {
    const byId = parseSongImport({ target: { id: 'b1' }, songs: [song()] });
    expect(byId.target).toEqual({ id: 'b1' });
    expect(byId.songs).toEqual([song()]);
    const byName = parseSongImport({ target: { name: '  Молодіжні ' }, songs: [song()] });
    expect(byName.target).toEqual({ name: 'Молодіжні' });
  });

  it('keeps a song without a number and drops fields it does not know', () => {
    const r = parseSongImport({
      target: { id: 'b1' },
      songs: [song({ key: 'Без номера', number: null, title: 'Без номера', extra: 1 })],
    });
    expect(r.songs[0]).toEqual({
      key: 'Без номера',
      number: null,
      title: 'Без номера',
      slides: song().slides,
    });
  });

  it('refuses what the browser reader never sends, with a 400 in words', () => {
    const cases: [unknown, string][] = [
      [{ songs: [song()] }, 'вкажіть бандл'],
      [{ target: { name: '   ' }, songs: [song()] }, 'вкажіть бандл'],
      [{ target: { id: 'b1' }, songs: [] }, 'немає пісень'],
      [{ target: { id: 'b1' }, songs: Array(5001).fill(song()) }, 'забагато'],
      [{ target: { id: 'b1' }, songs: [song({ key: ' ' })] }, 'без назви файлу'],
      [{ target: { id: 'b1' }, songs: [song({ number: -1 })] }, 'номер'],
      [{ target: { id: 'b1' }, songs: [song({ number: 1.5 })] }, 'номер'],
      [{ target: { id: 'b1' }, songs: [song({ slides: [] })] }, 'слайди'],
      [{ target: { id: 'b1' }, songs: [song({ slides: [{ text: 5 }] })] }, 'текст слайда'],
      [
        {
          target: { id: 'b1' },
          songs: [song({ slides: [{ text: 'a', style: { ...style, align: 'justify' } }] })],
        },
        'вигляд слайда',
      ],
      [null, 'вкажіть бандл'],
    ];
    for (const [body, why] of cases) {
      const r = refusal(body);
      expect(r?.status).toBe(400);
      expect(r?.message).toMatch(/^Імпорт пісень: /);
      expect(r?.message).toContain(why);
    }
  });
});

describe('library songs at the server start (0.10.2)', () => {
  const dirs: string[] = [];
  const songsDir = process.env.SONGS_DIR;
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
    if (songsDir === undefined) delete process.env.SONGS_DIR;
    else process.env.SONGS_DIR = songsDir;
  });

  it('follows bundle files added, removed or copied in with an old date', () => {
    delete process.env.SONGS_DIR; // no .pptx folder feeds a bundle here
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-songs-'));
    dirs.push(root);
    const dataDir = path.join(root, 'data');
    const dir = path.join(dataDir, 'songs');
    const libraryPath = path.join(dataDir, 'library.db');
    fs.mkdirSync(dataDir);
    const lib = new Database(libraryPath);
    lib.exec(SCHEMA_SQL);
    lib.close();
    const one = (key: string) => ({
      key,
      number: null,
      title: key,
      slides: [{ text: key, style: null }],
    });
    const logs: string[] = [];
    const sync = () =>
      syncSongsAtStart({ dataDir, repoRoot: root, libraryPath, log: (m) => logs.push(m) });
    const songs = () => {
      const db = new Database(libraryPath, { readonly: true });
      try {
        return db.prepare('SELECT bundle, title FROM songs ORDER BY bundle, title').all();
      } finally {
        db.close();
      }
    };

    importSongs(dir, { name: 'А' }, [one('а1'), one('а2')]);
    const b = importSongs(dir, { name: 'Б' }, [one('б1')]).bundle;
    createBundle(dir, 'Порожній');
    sync();
    expect(songs()).toEqual([
      { bundle: 'А', title: 'а1' },
      { bundle: 'А', title: 'а2' },
      { bundle: 'Б', title: 'б1' },
    ]);
    expect(logs).toHaveLength(1);
    sync(); // nothing changed — an empty bundle doesn't count as missing
    expect(logs).toHaveLength(1);

    fs.rmSync(path.join(dir, b.file)); // removed by hand
    sync();
    expect(songs()).toEqual([
      { bundle: 'А', title: 'а1' },
      { bundle: 'А', title: 'а2' },
    ]);

    // copied from another computer: the copy keeps its old modification time
    const other = path.join(root, 'other');
    const v = importSongs(other, { name: 'В' }, [one('в1')]).bundle;
    fs.copyFileSync(path.join(other, v.file), path.join(dir, v.file));
    fs.utimesSync(path.join(dir, v.file), new Date(2020, 0, 1), new Date(2020, 0, 1));
    sync();
    expect(songs()).toContainEqual({ bundle: 'В', title: 'в1' });
    expect(logs).toHaveLength(3);
  });
});
