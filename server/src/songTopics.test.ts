import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createLibrary,
  EMBED_MODELS,
  packChapter,
  quantize,
  SCHEMA_SQL,
  songPassages,
  songPassagesHash,
  type BundleSong,
} from '@vo/shared';
import {
  bundleTopics,
  importSongs,
  refreshLibrarySongs,
  saveSongTopics,
} from '@vo/shared/songs-node';
import { betterSqliteDriver } from './db';
import { sortBundleTopics } from './songTopics';
import { openVectors } from './vectorJob';

/** «Розкласти за темами» (1.25.0-beta.2) end to end: a bundle, its vectors, the model's topics. */

let tmp = '';
afterEach(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));

const D = EMBED_MODELS.fast.dims;
/** A theme as a direction: 0 salvation, 1 praise, 2 evening; a passage leans on its theme. */
const theme = (k: number, lean = 0.05) => {
  const v = new Float32Array(D);
  v[k] = 1;
  v[10 + k] = lean;
  return quantize(v, D);
};
const THEME: Record<string, number> = { спас: 0, хвал: 1, вечір: 2 };
const themeOf = (text: string) => {
  const t = text.toLowerCase();
  const k = Object.keys(THEME).find((w) => t.includes(w));
  return k === undefined ? 5 : THEME[k];
};

/** Twelve songs: four on each theme. */
const SONGS: BundleSong[] = Array.from({ length: 12 }, (_, i) => {
  const w = ['спасіння', 'хвала', 'вечір'][i % 3];
  return {
    key: `${i + 1}. Пісня ${i + 1}`,
    number: i + 1,
    title: `Пісня ${i + 1}`,
    slides: [
      { text: `${i + 1}. Пісня ${i + 1}`, style: null },
      { text: `Слово про ${w} і ще ${w}`, style: null },
    ],
  };
});

function setup() {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-topics-'));
  const dataDir = path.join(tmp, 'data');
  const dir = path.join(dataDir, 'songs');
  const libraryPath = path.join(tmp, 'library.db');
  const lib = new Database(libraryPath);
  lib.exec(SCHEMA_SQL);
  lib.close();
  const made = importSongs(dir, { name: 'Збірка' }, SONGS);
  refreshLibrarySongs(libraryPath, dir);
  // every song's vectors, as the songs' job writes them
  const read = new Database(libraryPath, { readonly: true });
  const rows = read
    .prepare(
      `SELECT s.id, s.title, GROUP_CONCAT(sl.text, '\u0001') AS t FROM songs s
       JOIN song_slides sl ON sl.song_id = s.id GROUP BY s.id`,
    )
    .all() as { id: number; title: string; t: string }[];
  read.close();
  const vdb = openVectors(dataDir);
  const put = vdb.prepare(
    'INSERT INTO song_vectors (model, song_id, hash, ords, vecs) VALUES (?, ?, ?, ?, ?)',
  );
  for (const r of rows) {
    const p = songPassages(r.title, r.t.split('\u0001'));
    const packed = packChapter(
      p.ords,
      p.texts.map((t) => theme(themeOf(t))),
    );
    put.run('fast', r.id, songPassagesHash(p), packed.verses, packed.vecs);
  }
  vdb.close();
  return { dataDir, dir, libraryPath, bundleId: made.bundle.meta.id };
}

const embed = async (text: string) => theme(themeOf(text), 0);

describe('sorting a bundle by topics', () => {
  it('by its list: each song under its theme; the library filters and lists them', async () => {
    const s = setup();
    const out = await sortBundleTopics({ ...s, own: false, model: 'fast', embed });
    expect(out).toMatchObject({ ok: true, songs: 12, topics: 22 }); // the ready list
    // the ready list has no «вечір» word: the fake model leaves those songs out
    const bt = bundleTopics(s.dir, s.bundleId)!;
    expect(bt.topics.list).toHaveLength(22);

    // a list of the bundle's own: three topics, the model's words for them
    const { saveTopicList } = await import('@vo/shared/songs-node');
    saveTopicList(s.dir, s.bundleId, [
      { name: 'Спасіння', about: 'спасіння' },
      { name: 'Хвала', about: 'хвала' },
      { name: 'Вечір', about: 'вечір' },
    ]);
    const again = await sortBundleTopics({ ...s, own: false, model: 'fast', embed });
    expect(again).toMatchObject({ ok: true, songs: 12, sorted: 12, topics: 3 });
    refreshLibrarySongs(s.libraryPath, s.dir);
    const c = new Database(s.libraryPath, { readonly: true });
    const lib = createLibrary(betterSqliteDriver(() => c));
    expect(await lib.listSongTopics()).toEqual([
      { name: 'Спасіння', count: 4 },
      { name: 'Хвала', count: 4 },
      { name: 'Вечір', count: 4 },
    ]);
    const night = await lib.searchSongs('', 60, 'Збірка', 'Вечір');
    expect(night.map((x) => x.number)).toEqual([3, 6, 9, 12]);
    expect((await lib.getSong(night[0].id))?.topics).toEqual(['Вечір']);
    c.close();

    // the operator moves song 3 from «Вечір» to «Хвала»; a new sort leaves that
    expect(saveSongTopics(s.dir, night[0].id, ['Хвала'])).toEqual({ bundle: 'Збірка' });
    await sortBundleTopics({ ...s, own: false, model: 'fast', embed });
    refreshLibrarySongs(s.libraryPath, s.dir);
    const c2 = new Database(s.libraryPath, { readonly: true });
    const lib2 = createLibrary(betterSqliteDriver(() => c2));
    expect((await lib2.getSong(night[0].id))?.topics).toEqual(['Хвала']);
    c2.close();
  });

  it('by its own topics: groups of one theme each, named by its words; the list replaced', async () => {
    const s = setup();
    const out = await sortBundleTopics({ ...s, own: true, model: 'fast', embed });
    // four groups for twelve songs (groupsFor): one theme splits, its halves too small to be a topic
    expect(out).toMatchObject({ ok: true, songs: 12 });
    expect(out.ok && out.sorted).toBeGreaterThanOrEqual(8);
    const bt = bundleTopics(s.dir, s.bundleId)!;
    const names = bt.topics.list.map((t) => t.name).join(' | ');
    expect(names).toMatch(/Спасіння/);
    expect(names).toMatch(/Хвала/);
  });

  it('without the songs’ vectors: says how many are missing', async () => {
    const s = setup();
    fs.rmSync(path.join(s.dataDir, 'vectors.db'));
    const out = await sortBundleTopics({ ...s, own: false, model: 'fast', embed });
    expect(out).toEqual({ ok: false, missing: 'vectors', done: 0, total: 12 });
  });
});
