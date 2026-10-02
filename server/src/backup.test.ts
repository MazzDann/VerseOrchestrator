import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { unzip, zip } from './zip';
import {
  applyBackup,
  backupBusy,
  backupName,
  BackupError,
  collect,
  keepPending,
  lastRestore,
  makeBackup,
  oneAtATime,
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
  fs.writeFileSync(path.join(d, 'songs', `._ПС-${tag}.vosongs`), 'AppleDouble');
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

const tags = (d: string) =>
  JSON.parse(
    JSON.parse(fs.readFileSync(path.join(d, 'ui-state.json'), 'utf8'))['vo:settings'].value,
  ).state.tag;

describe('zip (1.5.0)', () => {
  it('writes what it reads back: UTF-8 names, deflated and stored', async () => {
    const big = Buffer.alloc(100_000, 'a');
    const raw = Buffer.from([1, 2, 3]);
    const out = await unzip(
      await zip([
        { name: 'songs/ПС.vosongs', data: big },
        { name: 'b.bin', data: raw },
      ]),
    );
    expect(out.map((e) => e.name)).toEqual(['songs/ПС.vosongs', 'b.bin']);
    expect(out[0].data.equals(big)).toBe(true);
    expect(out[1].data.equals(raw)).toBe(true);
    expect((await zip([{ name: 'a', data: big }])).length).toBeLessThan(1000);
    // what is compressed already is stored as it is
    const stored = await zip([{ name: 'images/a.jpg', data: big }], new Date(), () => true);
    expect(stored.length).toBeGreaterThan(100_000);
    expect((await unzip(stored))[0].data.equals(big)).toBe(true);
  });

  it('refuses a damaged file or one that unpacks too big', async () => {
    const z = await zip([{ name: 'a', data: Buffer.alloc(5000, 'x') }]);
    await expect(unzip(Buffer.from('not a zip at all'))).rejects.toThrow();
    const broken = Buffer.from(z);
    broken[40] ^= 0xff; // inside the deflated data
    await expect(unzip(broken)).rejects.toThrow();
    await expect(unzip(z, 1000)).rejects.toThrow();
  });
});

describe('«Резервна копія» (1.5.0)', () => {
  it('holds the UI state, the song bundles and the pictures — not the library, secrets, settings or dot files', async () => {
    const d = dataDir('a');
    const names = (await collect(d, '1.5.0')).map((e) => e.name);
    expect(names).toEqual([
      'manifest.json',
      'ui-state.json',
      'songs/ПС-a.vosongs',
      'images/a.png',
      'images/index.json',
    ]);
    const { summary } = await readBackup(
      await makeBackup(d, '1.5.0', new Date('2026-10-01T10:00:00Z')),
    );
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

  it('refuses a zip that is no backup, or that carries a file it has no business writing', async () => {
    await expect(readBackup(Buffer.from('x'))).rejects.toThrow(BackupError);
    await expect(
      readBackup(await zip([{ name: 'a.txt', data: Buffer.from('x') }])),
    ).rejects.toThrow(BackupError);
    const manifest = {
      name: 'manifest.json',
      data: Buffer.from(JSON.stringify({ format: 'verse-orchestrator-backup', version: 1 })),
    };
    for (const evil of [
      'secrets.json',
      'settings.json',
      '../x.vosongs',
      'songs/../../x.vosongs',
      'songs/._x.vosongs',
      'images/.trash',
      'library.db',
      'images/sub/x.png',
    ])
      await expect(
        readBackup(await zip([manifest, { name: evil, data: Buffer.from('x') }])),
      ).rejects.toThrow(BackupError);
    expect((await readBackup(await zip([manifest]))).summary.bundles).toEqual([]);
  });

  it('restores: the backup state in place of the current one, the UI state as the newest', async () => {
    const from = dataDir('a');
    const to = dataDir('b');
    const before = Date.now();
    const stamped = await applyBackup(
      to,
      (await readBackup(await makeBackup(from, '1.5.0'))).entries,
    );
    const ui = JSON.parse(fs.readFileSync(path.join(to, 'ui-state.json'), 'utf8'));
    expect(tags(to)).toBe('a');
    // stamped when written, after the files: newer than anything sent meanwhile
    expect(ui['vo:settings'].at).toBe(stamped);
    expect(stamped).toBeGreaterThanOrEqual(before);
    expect(fs.readdirSync(path.join(to, 'songs')).sort()).toEqual([
      '._ПС-b.vosongs',
      '.trash',
      'ПС-a.vosongs',
    ]);
    expect(fs.readdirSync(path.join(to, 'images')).sort()).toEqual([
      '.trash',
      'a.png',
      'index.json',
    ]);
    // this machine's own files are untouched
    expect(fs.readFileSync(path.join(to, 'secrets.json'), 'utf8')).toContain('secret');
    expect(fs.readFileSync(path.join(to, 'library.db'), 'utf8')).toBe('big');
  });

  it('keeps the state it replaced; «Повернути як було» brings it back and keeps what it replaces too', async () => {
    const from = dataDir('a');
    const to = dataDir('b');
    expect(await restorePending(to, '1.5.0')).toBeNull();
    await keepPending(to, await makeBackup(from, '1.5.0', new Date('2026-09-01T00:00:00Z')));
    const at = new Date('2026-10-01T12:00:00Z');
    const summary = (await restorePending(to, '1.5.0', at))!;
    expect(summary.created).toBe('2026-09-01T00:00:00.000Z');
    expect(fs.existsSync(path.join(to, 'songs', 'ПС-a.vosongs'))).toBe(true);
    const last = lastRestore(to, at.getTime())!;
    expect(last).toMatchObject({ created: '2026-09-01T00:00:00.000Z' });
    // the replaced files moved into a folder of their own — no zip, no size limit; the
    // UI state copied (review of #47)
    const was = path.join(to, 'backups', last.undo);
    expect(fs.readdirSync(path.join(was, 'songs'))).toEqual(['ПС-b.vosongs']);
    expect(fs.readdirSync(path.join(was, 'images')).sort()).toEqual(['b.png', 'index.json']);
    expect(fs.existsSync(path.join(was, 'ui-state.json'))).toBe(true);
    expect(fs.readdirSync(path.join(to, 'images')).sort()).toEqual([
      '.trash',
      'a.png',
      'index.json',
    ]);
    // offered for a day only
    expect(lastRestore(to, at.getTime() + 25 * 3600_000)).toBeNull();
    // a change after the restore…
    fs.writeFileSync(path.join(to, 'songs', 'Нові.vosongs'), 'made after the restore');
    expect(await undoRestore(to, new Date(at.getTime() + 60_000))).toBe(true);
    expect(
      fs.readdirSync(path.join(to, 'songs')).filter((f) => /^[^.].*\.vosongs$/.test(f)),
    ).toEqual(['ПС-b.vosongs']);
    expect(tags(to)).toBe('b');
    // stamped as the newest when it went back in
    const ui = JSON.parse(fs.readFileSync(path.join(to, 'ui-state.json'), 'utf8'));
    expect(ui['vo:settings'].at).toBeGreaterThan(1000);
    expect(fs.readdirSync(path.join(to, 'images')).sort()).toEqual([
      '.trash',
      'b.png',
      'index.json',
    ]);
    expect(fs.existsSync(was)).toBe(false);
    expect(lastRestore(to, at.getTime())).toBeNull();
    expect(await undoRestore(to)).toBe(false);
    // …is kept in the state going back replaced
    const kept = fs
      .readdirSync(path.join(to, 'backups'))
      .find((f) => f.startsWith('before-undo-'))!;
    expect(fs.readdirSync(path.join(to, 'backups', kept, 'songs'))).toEqual([
      'Нові.vosongs',
      'ПС-a.vosongs',
    ]);
  });

  it('runs backup work one at a time, in order; busy until the last is done', async () => {
    const order: string[] = [];
    const slow = oneAtATime(async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push('restore');
    });
    const failing = oneAtATime(async () => {
      order.push('undo');
      throw new Error('x');
    });
    const save = oneAtATime(async () => {
      order.push('save');
      return 7;
    });
    expect(backupBusy()).toBe(true);
    await slow;
    await expect(failing).rejects.toThrow('x');
    expect(await save).toBe(7);
    // one that failed doesn't stop the next
    expect(order).toEqual(['restore', 'undo', 'save']);
    expect(backupBusy()).toBe(false);
  });

  it('a restore that fails midway still offers the way back', async () => {
    const from = dataDir('a');
    const to = dataDir('b');
    await keepPending(to, await makeBackup(from, '1.5.0'));
    // a folder where the backup's picture must go: writing it fails after the songs went in
    fs.mkdirSync(path.join(to, 'images', 'a.png'));
    const at = new Date();
    await expect(restorePending(to, '1.5.0', at)).rejects.toThrow();
    expect(lastRestore(to, at.getTime())).not.toBeNull();
    fs.rmSync(path.join(to, 'images', 'a.png'), { recursive: true });
    expect(await undoRestore(to, at)).toBe(true);
    expect(tags(to)).toBe('b');
    expect(fs.existsSync(path.join(to, 'songs', 'ПС-b.vosongs'))).toBe(true);
  });

  it('names the file by its date and time', () => {
    expect(backupName(new Date(2026, 9, 1, 14, 5))).toBe(
      'VerseOrchestrator-backup-2026-10-01-1405.zip',
    );
  });
});
