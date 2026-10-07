import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readJson, writeJson } from './jsonFile';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-json-'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});
const bad = () => fs.readdirSync(dir).filter((f) => f.includes('.bad-'));

describe('a JSON file read, changed and written back (1.9.3)', () => {
  it('a missing file gives the default and may be written', () => {
    const file = path.join(dir, 'albums.json');
    expect(readJson(file, { albums: [] })).toEqual({ albums: [] });
    writeJson(file, { albums: [1] });
    expect(readJson(file, { albums: [] })).toEqual({ albums: [1] });
  });

  it('a byte-order mark is read past', () => {
    const file = path.join(dir, 'albums.json');
    fs.writeFileSync(file, '﻿{"albums":[1,2]}');
    expect(readJson(file, { albums: [] })).toEqual({ albums: [1, 2] });
  });

  it('a file that is not JSON is copied aside once, then may be replaced', () => {
    const file = path.join(dir, 'albums.json');
    const broken = '{"albums":[{"id":"a"},{"id":"b"';
    fs.writeFileSync(file, broken);
    expect(readJson(file, { albums: [] })).toEqual({ albums: [] });
    expect(readJson(file, { albums: [] })).toEqual({ albums: [] });
    expect(bad()).toHaveLength(1); // the same broken file, one copy
    writeJson(file, { albums: ['new'] });
    expect(fs.readFileSync(path.join(dir, bad()[0]), 'utf8')).toBe(broken);
    expect(readJson(file, { albums: [] })).toEqual({ albums: ['new'] });
  });

  it('a file that cannot be read now is not written over until a read succeeds', () => {
    const file = path.join(dir, 'videos.json');
    fs.mkdirSync(file); // reading a folder fails with EISDIR, as a locked file would with EBUSY
    expect(readJson(file, { videos: [] })).toEqual({ videos: [] });
    expect(() => writeJson(file, { videos: ['only this'] })).toThrow(/not written over/);
    fs.rmdirSync(file);
    fs.writeFileSync(file, '{"videos":["kept"]}');
    expect(readJson(file, { videos: [] })).toEqual({ videos: ['kept'] });
    writeJson(file, { videos: ['kept', 'added'] });
    expect(readJson(file, { videos: [] })).toEqual({ videos: ['kept', 'added'] });
  });

  it('a write that cannot replace the file leaves no temp file behind', () => {
    const file = path.join(dir, 'images.json');
    fs.mkdirSync(path.join(file, 'inside'), { recursive: true }); // a folder in the way: rename fails
    expect(() => writeJson(file, { images: [] }, { replace: true })).toThrow();
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('an error that will not pass (a folder in the way) is not waited on', () => {
    const file = path.join(dir, 'albums.json');
    fs.mkdirSync(file);
    const t = Date.now();
    readJson(file, {});
    readJson(file, {});
    expect(Date.now() - t).toBeLessThan(50);
  });

  it('the copy of a broken file starts with a dot (backups leave it out)', () => {
    const file = path.join(dir, 'albums.json');
    fs.writeFileSync(file, '{');
    readJson(file, {});
    expect(bad()[0]).toMatch(/^\.albums\.json\.bad-/);
  });

  it('a restore replaces a file whatever its last read was', () => {
    const file = path.join(dir, 'ui-state.json');
    fs.mkdirSync(file);
    readJson(file, {});
    fs.rmdirSync(file);
    writeJson(file, { restored: true }, { replace: true });
    expect(readJson(file, {})).toEqual({ restored: true });
  });
});
