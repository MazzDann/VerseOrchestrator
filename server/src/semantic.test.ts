import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMBED_MODELS,
  quantize,
  SCHEMA_SQL,
  type EmbedModel,
  type EmbedModelId,
  type Embedder,
} from '@vo/shared';
import { createModelStore, modelInstalled } from './models';
import { createVectorJob, readVectorSets, vectorsPath } from './vectorJob';

/** «Пошук за змістом» (1.15.0-beta.2) on the server: the models' downloads and the vector job. */

let tmp = '';
afterEach(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));
const mkTmp = () => (tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-sem-')));

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('model downloads', () => {
  const FILES = {
    'model.onnx': Buffer.from('a model, honestly'),
    'tokenizer.json': Buffer.from('{}'),
    'tokenizer_config.json': Buffer.from('{"x":1}'),
  };
  const small = (bad = false): Record<EmbedModelId, EmbedModel> => ({
    ...EMBED_MODELS,
    fast: {
      ...EMBED_MODELS.fast,
      files: Object.entries(FILES).map(([name, b]) => ({
        name: name as 'model.onnx',
        path: `x/${name}`,
        size: b.length,
        sha256: bad && name === 'model.onnx' ? '0'.repeat(64) : sha(b),
      })),
    },
  });
  const fakeFetch = vi.fn(async (url: string | URL | Request) => {
    const name = String(url).split('/').pop() as keyof typeof FILES;
    return new Response(FILES[name]);
  });

  it('downloads every file, checked by its hash, and says the model is there', async () => {
    const dataDir = mkTmp();
    const seen: string[] = [];
    const store = createModelStore({
      dataDir,
      version: '9.9.9',
      fetch: fakeFetch as typeof fetch,
      models: small(),
      onChange: (s) => seen.push(s.phase),
    });
    store.download('fast');
    await vi.waitFor(() => expect(store.state('fast').phase).toBe('done'));
    expect(modelInstalled(dataDir, 'fast', small())).toBe(true);
    expect(seen[0]).toBe('downloading');
    expect(fs.readdirSync(path.join(dataDir, 'models', 'fast')).sort()).toEqual(
      Object.keys(FILES).sort(),
    );
    await store.remove('fast');
    expect(modelInstalled(dataDir, 'fast', small())).toBe(false);
  });

  it('keeps no file whose hash is wrong', async () => {
    const dataDir = mkTmp();
    const store = createModelStore({
      dataDir,
      version: '9.9.9',
      fetch: fakeFetch as typeof fetch,
      models: small(true),
    });
    store.download('fast');
    await vi.waitFor(() => expect(store.state('fast').phase).toBe('failed'));
    expect(store.state('fast').note?.key).toMatch(/пошкоджено/);
    const left = fs.readdirSync(path.join(dataDir, 'models', 'fast'));
    expect(left.some((f) => f.startsWith('model.onnx'))).toBe(false);
  });
});

describe('the vector job', () => {
  /** A library of two translations: UKR (3 books), KJV (1 book, one empty verse). */
  function library(file: string) {
    const db = new Database(file);
    db.exec(SCHEMA_SQL);
    db.exec(`INSERT INTO translations (id, abbr, title, language, rtl, has_strong, source_hash)
      VALUES (1, 'UKR', 'U', 'uk', 0, 0, 'h1'), (2, 'KJV', 'K', 'en', 0, 0, 'h2')`);
    const v = db.prepare(
      'INSERT INTO verses (translation_id, book_number, chapter, verse, text) VALUES (?, ?, ?, ?, ?)',
    );
    for (const book of [10, 20, 30])
      for (let n = 1; n <= 5; n++) v.run(1, book, 1, n, `u ${book} ${n}`);
    for (let n = 1; n <= 3; n++) v.run(2, 10, 2, n, n === 2 ? '' : `k ${n}`);
    db.close();
  }

  function fakeOpen(calls: string[][], gate?: () => Promise<void>) {
    return async (): Promise<Embedder & { release: () => Promise<void> }> => ({
      model: EMBED_MODELS.fast,
      embed: async (texts: string[]) => {
        calls.push(texts);
        await gate?.();
        return texts.map((t) => quantize([t.length, 1, 2], 3));
      },
      release: async () => undefined,
    });
  }

  it('makes every translation, a chapter row each, and marks them whole', async () => {
    const dataDir = mkTmp();
    const lib = path.join(dataDir, 'library.db');
    library(lib);
    const calls: string[][] = [];
    const onSet = vi.fn();
    const job = createVectorJob({ dataDir, libraryPath: lib, open: fakeOpen(calls), onSet });
    job.start('fast', null);
    await vi.waitFor(() => expect(job.state().phase).toBe('done'));
    const sets = readVectorSets(dataDir, 'fast');
    expect(sets.get('h1')).toEqual({ done: true, books: 3 });
    expect(sets.get('h2')).toEqual({ done: true, books: 1 });
    expect(onSet).toHaveBeenNthCalledWith(1, true); // the file is new: the library reopens
    expect(onSet).toHaveBeenNthCalledWith(2, false);
    // the empty verse is left out of the model and of the chapter
    expect(calls.flat()).not.toContain('');
    const v = new Database(vectorsPath(dataDir), { readonly: true });
    const kjv = v.prepare("SELECT verses FROM chapter_vectors WHERE source_hash = 'h2'").get() as {
      verses: Buffer;
    };
    expect(kjv.verses.length).toBe(4); // two verses × int16
    v.close();
  });

  it('a stop keeps the books in; the next run goes on from there', async () => {
    const dataDir = mkTmp();
    const lib = path.join(dataDir, 'library.db');
    library(lib);
    let release: () => void = () => undefined;
    let waits = 0;
    const calls: string[][] = [];
    const job = createVectorJob({
      dataDir,
      libraryPath: lib,
      // the second book's batch waits until the test lets it go
      open: fakeOpen(calls, () =>
        ++waits === 2 ? new Promise<void>((r) => (release = r)) : Promise.resolve(),
      ),
    });
    job.start('fast', [1]);
    await vi.waitFor(() => expect(waits).toBe(2));
    job.stop();
    release();
    await vi.waitFor(() => expect(job.state().phase).toBe('stopped'));
    expect(readVectorSets(dataDir, 'fast').get('h1')).toEqual({ done: false, books: 2 });
    calls.length = 0;
    job.start('fast', [1]);
    await vi.waitFor(() => expect(job.state().phase).toBe('done'));
    expect(calls.flat().every((t) => t.startsWith('u 30'))).toBe(true); // only the book not in
    expect(readVectorSets(dataDir, 'fast').get('h1')?.done).toBe(true);
  });
});
