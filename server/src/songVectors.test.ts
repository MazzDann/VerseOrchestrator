import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLibrary,
  EMBED_MODELS,
  quantize,
  SCHEMA_SQL,
  songPassages,
  songPassagesHash,
  songScore,
  type Embedder,
} from '@vo/shared';
import { betterSqliteDriver } from './db';
import { createSongVectorJob, songVectorCounts } from './songVectors';
import { vectorsPath } from './vectorJob';

/** Songs by meaning (1.25.0-beta.1): what goes through the model, the job, and «~ …». */

let tmp = '';
afterEach(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));
const mkTmp = () => (tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-songvec-')));

describe('a song’s passages', () => {
  it('the title, each slide once, without a label line or empty slides', () => {
    const p = songPassages('Христос — моє спасіння', [
      '12. Христос — моє спасіння\nМузика: Н. Н.',
      'Христос мене спас,\nвін любить нас',
      'Приспів:\nАлілуя, слава!',
      '',
      'Приспів:\nАлілуя,  слава!',
      'Ще один куплет',
    ]);
    expect(p.ords).toEqual([0, 1, 2, 5]);
    expect(p.texts).toEqual([
      'Христос — моє спасіння',
      'Христос мене спас, він любить нас',
      'Алілуя, слава!',
      'Ще один куплет',
    ]);
  });
  it('the hash follows the words', () => {
    const a = songPassages('A', ['A', 'x']);
    expect(songPassagesHash(a)).toBe(songPassagesHash(songPassages('A', ['A', 'x'])));
    expect(songPassagesHash(a)).not.toBe(songPassagesHash(songPassages('A', ['A', 'y'])));
  });
  it('a song by its best passage, a little more for a close second', () => {
    expect(songScore([0.6])).toBeCloseTo(0.6);
    expect(songScore([0.5, 0.6])).toBeGreaterThan(0.6);
    expect(songScore([0.6, 0.1])).toBeCloseTo(0.6);
  });
});

/** Three songs in two bundles: about salvation, about praise, about the night. */
function library(file: string) {
  const db = new Database(file);
  db.exec(SCHEMA_SQL);
  const s = db.prepare(
    'INSERT INTO songs (id, number, title, title_norm, bundle) VALUES (?, ?, ?, ?, ?)',
  );
  const sl = db.prepare(
    'INSERT INTO song_slides (song_id, ord, text, render) VALUES (?, ?, ?, NULL)',
  );
  const songs: [number, number, string, string, string[]][] = [
    [
      101,
      1,
      'Ісус спасає',
      'A',
      ['1. Ісус спасає', 'Він спасає грішних', 'Приспів:\nспасіння дар'],
    ],
    [102, 2, 'Хваліть Господа', 'A', ['2. Хваліть Господа', 'хвала хвала', 'хвала навіки']],
    [103, 3, 'Вечірня пісня', 'B', ['3. Вечірня пісня', 'ніч настала тиха', 'спасіння теж']],
  ];
  for (const [id, n, title, bundle, slides] of songs) {
    s.run(id, n, title, title.toLowerCase(), bundle);
    slides.forEach((t, i) => sl.run(id, i, t));
  }
  db.close();
}

/** A model that knows two themes: «спас…» and «хвал…» — and a little of everything. */
const themeVec = (t: string) =>
  quantize([/спас/i.test(t) ? 10 : 0, /хвал/i.test(t) ? 10 : 0, /ніч/i.test(t) ? 10 : 0, 1], 4);

function fakeOpen(calls: string[][]) {
  return async (): Promise<Embedder & { release: () => Promise<void> }> => ({
    model: EMBED_MODELS.fast,
    embed: async (texts: string[]) => {
      calls.push(texts);
      return texts.map(themeVec);
    },
    release: async () => undefined,
  });
}

describe('the songs’ vectors and «~ …»', () => {
  it('a row per song; a second pass embeds only what changed', async () => {
    const dataDir = mkTmp();
    const lib = path.join(dataDir, 'library.db');
    library(lib);
    const calls: string[][] = [];
    const job = createSongVectorJob({ dataDir, libraryPath: lib, open: fakeOpen(calls) });
    job.start('fast');
    await vi.waitFor(() => expect(job.state().phase).toBe('done'));
    expect(job.state()).toMatchObject({ done: 3, total: 3 });
    expect(songVectorCounts(dataDir, lib, 'fast')).toEqual({ done: 3, total: 3 });
    // the label line never reaches the model
    expect(calls.flat()).toContain('спасіння дар');
    // one song's words change: only it goes through the model again
    const db = new Database(lib);
    db.prepare("UPDATE song_slides SET text = 'нова ніч' WHERE song_id = 103 AND ord = 2").run();
    db.close();
    expect(songVectorCounts(dataDir, lib, 'fast')).toEqual({ done: 2, total: 3 });
    calls.length = 0;
    job.start('fast');
    await vi.waitFor(() => expect(job.state().phase).toBe('done'));
    expect(calls.flat().sort()).toEqual(['Вечірня пісня', 'нова ніч', 'ніч настала тиха'].sort());
  });

  it('asked while a pass runs: one more pass after it', async () => {
    const dataDir = mkTmp();
    const lib = path.join(dataDir, 'library.db');
    library(lib);
    const calls: string[][] = [];
    const job = createSongVectorJob({ dataDir, libraryPath: lib, open: fakeOpen(calls) });
    job.start('fast');
    job.start('fast');
    await vi.waitFor(() => expect(job.state().phase).toBe('done'));
    await vi.waitFor(() => expect(job.state().done).toBe(3));
    expect(job.running()).toBe(false);
  });

  it('«~ спасіння» finds the songs about it, the closest first, by bundle too', async () => {
    const dataDir = mkTmp();
    const lib = path.join(dataDir, 'library.db');
    library(lib);
    const job = createSongVectorJob({ dataDir, libraryPath: lib, open: fakeOpen([]) });
    job.start('fast');
    await vi.waitFor(() => expect(job.state().phase).toBe('done'));
    // one connection each, closed at the end (Windows keeps an open file from being removed)
    const c = new Database(lib, { readonly: true });
    c.prepare('ATTACH DATABASE ? AS vectors').run(vectorsPath(dataDir));
    const c2 = new Database(lib, { readonly: true });
    const l = createLibrary(
      betterSqliteDriver(() => c),
      { embed: async (text) => ({ model: 'fast', vec: themeVec(text) }) },
    );
    const all = await l.searchSongsByMeaning('~ спасіння');
    expect(all.missing).toBeUndefined();
    expect(all.results[0]).toMatchObject({ id: 101, closeness: 3 });
    expect(all.results.map((r) => r.id)).toContain(103);
    // the song from the night is found by its third slide, and says so
    expect(all.results.find((r) => r.id === 103)).toMatchObject({
      stanza: 2,
      line: 'спасіння теж',
    });
    const b = await l.searchSongsByMeaning('~ спасіння', 'B');
    expect(b.results.map((r) => r.id)).toEqual([103]);
    // no vectors file: says what is missing
    const bare = createLibrary(
      betterSqliteDriver(() => c2),
      {
        embed: async (text) => ({ model: 'fast', vec: themeVec(text) }),
      },
    );
    expect((await bare.searchSongsByMeaning('~ спасіння')).missing).toBe('vectors');
    c.close();
    c2.close();
  });
});
