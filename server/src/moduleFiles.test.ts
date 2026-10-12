import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LibrarySelection } from '@vo/shared';
import { createModuleFiles, listModuleFiles } from './moduleFiles';

describe('modules on disk', () => {
  let tmp = '';
  afterEach(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));

  function setup(selection?: LibrarySelection) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-modules-'));
    fs.mkdirSync(path.join(tmp, 'modules'));
    let sel = selection;
    const m = createModuleFiles({
      modulesDir: () => path.join(tmp, 'modules'),
      selection: () => sel,
      setSelection: (s) => (sel = s),
    });
    return { m, sel: () => sel, dir: path.join(tmp, 'modules') };
  }

  it('lists the files by kind, leaving the kinds the library does not read', () => {
    const t = setup();
    for (const f of [
      'CUV.SQLite3',
      'CUV.commentaries.SQLite3',
      'X.devotions.SQLite3',
      'readme.txt',
    ])
      fs.writeFileSync(path.join(t.dir, f), '');
    expect(listModuleFiles(t.dir)).toEqual({
      bibles: ['CUV.SQLite3'],
      dictionaries: [],
      commentaries: ['CUV.commentaries.SQLite3'],
      crossreferences: [],
      subheadings: [],
    });
    expect(listModuleFiles(path.join(tmp, 'none')).bibles).toEqual([]);
  });

  it('chooses the files of a kind that are in modules/', () => {
    const t = setup({
      bibles: [],
      dictionaries: [],
      commentaries: [],
      crossreferences: [],
      subheadings: [],
    });
    fs.writeFileSync(path.join(t.dir, 'A.SQLite3'), '');
    fs.writeFileSync(path.join(t.dir, 'B.SQLite3'), '');
    expect(t.m.select('bibles', ['b.sqlite3', 'missing.SQLite3', 'B.SQLite3']).bibles).toEqual([
      'B.SQLite3',
    ]);
    expect(t.sel()?.bibles).toEqual(['B.SQLite3']);
    expect(t.m.modules().files.bibles).toEqual(['A.SQLite3', 'B.SQLite3']);
  });

  it('seeds «all» for a small folder when no selection is written yet', () => {
    const t = setup();
    fs.writeFileSync(path.join(t.dir, 'A.SQLite3'), '');
    expect(t.m.select('bibles', ['A.SQLite3'])).toEqual({
      bibles: ['A.SQLite3'],
      dictionaries: null,
      commentaries: null,
      crossreferences: null,
      subheadings: null,
    });
  });
});
