import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { unzip, zip } from './zip';
import {
  applyBackup,
  backupName,
  BackupError,
  collect,
  keepPending,
  lastRestore,
  makeBackup,
  readBackup,
  restorePending,
  undoRestore,
} from './backup';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A data folder with the operator's things — and things a backup must leave out. */
function dataDir(tag: string) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-backup-'));
  dirs.push(d);
  const playlist = JSON.stringify({
    state: { items: [1, 2, 3], saved: [{ name: tag }] },
    version: 0,
  });
  fs.writeFileSync(
    path.join(d, 'ui-state.json'),
    JSON.stringify({
      'vo:settings': { value: JSON.stringify({ state: { tag } }), at: 1000 },
      'vo:playlist': { value: playlist, at: 1000 },
    }),
  );
  fs.mkdirSync(path.join(d, 'songs', '.trash'), { recursive: true });
  fs.writeFileSync(path.join(d, 'songs', `ПС-${tag}.vosongs`), `bundle ${tag}`);
  fs.writeFileSync(path.join(d, 'songs', '.trash', 'old.vosongs'), 'trash');
  fs.mkdirSync(path.join(d, 'images', '.trash'), { recursive: true });
  fs.writeFileSync(path.join(d, 'images', 'index.json'), JSON.stringify({ images: [{ id: tag }] }));
  fs.writeFileSync(path.join(d, 'images', `${tag}.png`), `png ${tag}`);
  fs.writeFileSync(path.join(d, 'images', '.trash', 'x.png'), 'trash');
  fs.writeFileSync(path.join(d, 'library.db'), 'big');
  fs.writeFileSync(path.join(d, 'secrets.json'), '{"tokens":["secret"]}');
  fs.writeFileSync(path.join(d, 'settings.json'), '{"standby":{"port":4747}}');
  return d;
}

describe('zip (1.5.0)', () => {
  it('writes what it reads back: UTF-8 names, deflated and stored', () => {
    const big = Buffer.alloc(100_000, 'a');
    const raw = Buffer.from([1, 2, 3]);
    const out = unzip(
      zip([
        { name: 'songs/ПС.vosongs', data: big },
        { name: 'b.bin', data: raw },
      ]),
    );
    expect(out.map((e) => e.name)).toEqual(['songs/ПС.vosongs', 'b.bin']);
    expect(out[0].data.equals(big)).toBe(true);
    expect(out[1].data.equals(raw)).toBe(true);
    expect(zip([{ name: 'a', data: big }]).length).toBeLessThan(1000);
  });

  it('refuses a damaged file or one that unpacks too big', () => {
    const z = zip([{ name: 'a', data: Buffer.alloc(5000, 'x') }]);
    expect(() => unzip(Buffer.from('not a zip at all'))).toThrow();
    const broken = Buffer.from(z);
    broken[40] ^= 0xff; // inside the deflated data
    expect(() => unzip(broken)).toThrow();
    expect(() => unzip(z, 1000)).toThrow();
  });
});

describe('«Резервна копія» (1.5.0)', () => {
  it('holds the UI state, the song bundles and the pictures — not the library, secrets or settings', () => {
    const d = dataDir('a');
    const names = collect(d, '1.5.0').map((e) => e.name);
    expect(names).toEqual([
      'manifest.json',
      'ui-state.json',
      'songs/ПС-a.vosongs',
      'images/a.png',
      'images/index.json',
    ]);
    const { summary } = readBackup(makeBackup(d, '1.5.0', new Date('2026-10-01T10:00:00Z')));
    expect(summary).toEqual({
      app: '1.5.0',
      created: '2026-10-01T10:00:00.000Z',
      settings: true,
      programs: 1,
      items: 3,
      bundles: ['ПС-a'],
      pictures: 1,
    });
  });

  it('refuses a zip that is no backup, or that carries a file it has no business writing', () => {
    expect(() => readBackup(Buffer.from('x'))).toThrow(BackupError);
    expect(() => readBackup(zip([{ name: 'a.txt', data: Buffer.from('x') }]))).toThrow(BackupError);
    const manifest = {
      name: 'manifest.json',
      data: Buffer.from(JSON.stringify({ format: 'verse-orchestrator-backup', version: 1 })),
    };
    for (const evil of [
      'secrets.json',
      'settings.json',
      '../x.vosongs',
      'songs/../../x.vosongs',
      'images/.trash',
      'library.db',
      'images/sub/x.png',
    ])
      expect(() => readBackup(zip([manifest, { name: evil, data: Buffer.from('x') }]))).toThrow(
        BackupError,
      );
    expect(readBackup(zip([manifest])).summary.bundles).toEqual([]);
  });

  it('restores: the backup state in place of the current one, the UI state as the newest', () => {
    const from = dataDir('a');
    const to = dataDir('b');
    applyBackup(to, readBackup(makeBackup(from, '1.5.0')).entries, new Date(5000));
    const ui = JSON.parse(fs.readFileSync(path.join(to, 'ui-state.json'), 'utf8'));
    expect(JSON.parse(ui['vo:settings'].value).state.tag).toBe('a');
    expect(ui['vo:settings'].at).toBe(5000);
    expect(fs.readdirSync(path.join(to, 'songs')).sort()).toEqual(['.trash', 'ПС-a.vosongs']);
    expect(fs.readdirSync(path.join(to, 'images')).sort()).toEqual([
      '.trash',
      'a.png',
      'index.json',
    ]);
    // this machine's own files are untouched
    expect(fs.readFileSync(path.join(to, 'secrets.json'), 'utf8')).toContain('secret');
    expect(fs.readFileSync(path.join(to, 'library.db'), 'utf8')).toBe('big');
  });

  it('keeps the state it replaced, and «Повернути як було» brings it back', () => {
    const from = dataDir('a');
    const to = dataDir('b');
    expect(restorePending(to, '1.5.0')).toBeNull();
    keepPending(to, makeBackup(from, '1.5.0', new Date('2026-09-01T00:00:00Z')));
    const summary = restorePending(to, '1.5.0', new Date('2026-10-01T12:00:00Z'))!;
    expect(summary.created).toBe('2026-09-01T00:00:00.000Z');
    expect(fs.existsSync(path.join(to, 'songs', 'ПС-a.vosongs'))).toBe(true);
    expect(lastRestore(to)).toMatchObject({ created: '2026-09-01T00:00:00.000Z' });
    expect(undoRestore(to, new Date('2026-10-01T12:05:00Z'))).toBe(true);
    expect(fs.readdirSync(path.join(to, 'songs')).filter((f) => f.endsWith('.vosongs'))).toEqual([
      'ПС-b.vosongs',
    ]);
    const ui = JSON.parse(fs.readFileSync(path.join(to, 'ui-state.json'), 'utf8'));
    expect(JSON.parse(ui['vo:settings'].value).state.tag).toBe('b');
    expect(lastRestore(to)).toBeNull();
    expect(undoRestore(to)).toBe(false);
  });

  it('names the file by its date and time', () => {
    expect(backupName(new Date(2026, 9, 1, 14, 5))).toBe(
      'VerseOrchestrator-backup-2026-10-01-1405.zip',
    );
  });
});
