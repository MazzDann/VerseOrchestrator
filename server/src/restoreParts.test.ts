import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_PARTS,
  keepPending,
  lastRestore,
  makeBackup,
  restorePending,
  undoRestore,
  type RestoreParts,
} from './backup';

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const write = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
};
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

/** A data folder: a look, a running order, songs, pictures and start settings, all tagged. */
function dataDir(tag: string, browser: string, withSongs = true) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-parts-'));
  dirs.push(d);
  write(path.join(d, 'ui-state.json'), {
    'vo:settings': { value: JSON.stringify({ state: { tag } }), at: 1000 },
    'vo:playlist': { value: JSON.stringify({ state: { items: [tag], saved: [] } }), at: 1000 },
  });
  if (withSongs) write(path.join(d, 'songs', `ПС-${tag}.vosongs`), `bundle ${tag}`);
  else fs.mkdirSync(path.join(d, 'songs'), { recursive: true });
  write(path.join(d, 'images', 'index.json'), { images: [{ id: tag }] });
  write(path.join(d, 'images', `${tag}.png`), `png ${tag}`);
  write(path.join(d, 'settings.json'), {
    version: 1,
    remotes: { persist: true },
    standby: { port: 4747, idleMinutes: 15 },
    updates: { check: true },
    launch: { browser, appWindow: false },
    library: { files: [`${tag}.SQLite3`] },
  });
  return d;
}
const ui = (d: string) => read(path.join(d, 'ui-state.json'));
const look = (d: string) => JSON.parse(ui(d)['vo:settings'].value).state.tag;
const order = (d: string) => JSON.parse(ui(d)['vo:playlist'].value).state.items[0];
const songs = (d: string) =>
  fs.readdirSync(path.join(d, 'songs')).filter((n) => !n.startsWith('.'));
const images = (d: string) => fs.readdirSync(path.join(d, 'images')).sort();
const only = (part: keyof RestoreParts): RestoreParts => ({
  look: false,
  programs: false,
  songs: false,
  pictures: false,
  start: false,
  [part]: true,
});

/** A backup of `from` pending in `to`, restored with `parts`. */
async function restore(from: string, to: string, parts: RestoreParts, at: Date) {
  await keepPending(to, await makeBackup(from, '1.12.0', new Date('2026-10-01T10:00:00Z')));
  return restorePending(to, '1.12.0', at, { parts });
}

describe('restoring by parts (1.12.0-beta.4)', () => {
  const at = new Date('2026-10-10T12:00:00Z');
  const later = new Date(at.getTime() + 60_000);

  it('the songs alone: the look, the order, the pictures and the start settings stay; so through the undo', async () => {
    const from = dataDir('a', 'opera');
    const to = dataDir('b', 'firefox');
    const before = ui(to);
    await restore(from, to, only('songs'), at);
    expect(songs(to)).toEqual(['ПС-a.vosongs']);
    expect(ui(to)).toEqual(before); // not even re-stamped
    expect(images(to)).toEqual(['b.png', 'index.json']);
    expect(read(path.join(to, 'settings.json')).launch.browser).toBe('firefox');
    expect(lastRestore(to, at.getTime())).toMatchObject({ subs: ['songs'], ui: false });
    // a change to the look after the restore survives its undo (the restore never touched it)
    write(path.join(to, 'ui-state.json'), {
      ...before,
      'vo:settings': { value: JSON.stringify({ state: { tag: 'changed' } }), at: 5000 },
    });
    expect(await undoRestore(to, later)).toBeTruthy();
    expect(songs(to)).toEqual(['ПС-b.vosongs']);
    expect(look(to)).toBe('changed');
  });

  it('the look alone: the running order of this copy stays, the songs and pictures too', async () => {
    const from = dataDir('a', 'opera');
    const to = dataDir('b', 'firefox');
    await restore(from, to, only('look'), at);
    expect(look(to)).toBe('a');
    expect(ui(to)['vo:settings'].at).toBeGreaterThan(1000);
    expect(order(to)).toBe('b');
    expect(ui(to)['vo:playlist'].at).toBe(1000);
    expect(songs(to)).toEqual(['ПС-b.vosongs']);
    expect(images(to)).toEqual(['b.png', 'index.json']);
    await undoRestore(to, later);
    expect(look(to)).toBe('b');
    expect(order(to)).toBe('b');
  });

  it('the start settings alone: nothing of the songs, pictures or UI state moves; the undo puts this copy’s back', async () => {
    const from = dataDir('a', 'opera');
    const to = dataDir('b', 'firefox');
    const before = ui(to);
    await restore(from, to, only('start'), at);
    const settings = read(path.join(to, 'settings.json'));
    expect(settings.launch.browser).toBe('opera');
    expect(settings.library).toEqual({ files: ['b.SQLite3'] });
    expect(ui(to)).toEqual(before);
    expect(songs(to)).toEqual(['ПС-b.vosongs']);
    expect(lastRestore(to, at.getTime())).toMatchObject({ state: false });
    await undoRestore(to, later);
    expect(read(path.join(to, 'settings.json')).launch.browser).toBe('firefox');
    expect(songs(to)).toEqual(['ПС-b.vosongs']);
  });

  it('everything ticked is the whole restore: one note without parts', async () => {
    const from = dataDir('a', 'opera');
    const to = dataDir('b', 'firefox');
    await restore(from, to, ALL_PARTS, at);
    expect([look(to), order(to)]).toEqual(['a', 'a']);
    expect(songs(to)).toEqual(['ПС-a.vosongs']);
    expect(images(to)).toEqual(['a.png', 'index.json']);
    const note = lastRestore(to, at.getTime())!;
    expect(note.subs).toBeUndefined();
    expect(note.ui).toBeUndefined();
  });

  it('a backup without songs leaves this copy’s songs, even restored whole', async () => {
    const from = dataDir('a', 'opera', false);
    const to = dataDir('b', 'firefox');
    await restore(from, to, ALL_PARTS, at);
    expect(songs(to)).toEqual(['ПС-b.vosongs']);
    expect(look(to)).toBe('a');
    expect(images(to)).toEqual(['a.png', 'index.json']);
    await undoRestore(to, later);
    expect(songs(to)).toEqual(['ПС-b.vosongs']);
    expect(images(to)).toEqual(['b.png', 'index.json']);
  });

  it('the undo of a partial restore puts back only what it restored: an entry edited since stays', async () => {
    const from = dataDir('a', 'opera');
    const to = dataDir('b', 'firefox');
    await restore(from, to, only('look'), at);
    expect(lastRestore(to, at.getTime())).toMatchObject({ uiKeys: ['vo:settings'] });
    // the running order changes after the restore
    const now = ui(to);
    write(path.join(to, 'ui-state.json'), {
      ...now,
      'vo:playlist': {
        value: JSON.stringify({ state: { items: ['edited'], saved: [] } }),
        at: 9000,
      },
    });
    await undoRestore(to, later);
    expect(look(to)).toBe('b');
    expect(order(to)).toBe('edited');
  });

  it('a UI state this copy can’t read now is never merged over: the restore stops and changes nothing', async () => {
    const from = dataDir('a', 'opera');
    const to = dataDir('b', 'firefox');
    const file = path.join(to, 'ui-state.json');
    const before = fs.readFileSync(file, 'utf8');
    await keepPending(to, await makeBackup(from, '1.12.0', new Date('2026-10-01T10:00:00Z')));
    const readFileSync = fs.readFileSync.bind(fs);
    vi.spyOn(fs, 'readFileSync').mockImplementation(((p: fs.PathOrFileDescriptor, o?: unknown) => {
      if (String(p) === file)
        throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      return readFileSync(p, o as BufferEncoding);
    }) as typeof fs.readFileSync);
    await expect(
      restorePending(to, '1.12.0', at, { parts: { ...only('look'), songs: true } }),
    ).rejects.toThrow();
    vi.restoreAllMocks();
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    expect(songs(to)).toEqual(['ПС-b.vosongs']);
    expect(lastRestore(to, at.getTime())).toBeNull();
  });

  it('restores of the look alone never push out the kept folder that holds songs', async () => {
    const from = dataDir('a', 'opera');
    const to = dataDir('b', 'firefox');
    await restore(from, to, ALL_PARTS, at);
    const full = lastRestore(to, at.getTime())!.undo;
    for (let n = 1; n <= 6; n++)
      await restore(from, to, only('look'), new Date(at.getTime() + n * 60_000));
    const kept = fs
      .readdirSync(path.join(to, 'backups'))
      .filter((n) => n.startsWith('before-restore-'));
    expect(kept).toContain(full);
    expect(fs.readdirSync(path.join(to, 'backups', full, 'songs'))).toEqual(['ПС-b.vosongs']);
    expect(kept.length).toBeLessThanOrEqual(6);
  });

  it('nothing chosen that the backup holds: nothing changes, the file stays checked, the way back stays', async () => {
    const from = dataDir('a', 'opera', false);
    const to = dataDir('b', 'firefox');
    await restore(from, to, only('look'), at);
    const note = lastRestore(to, at.getTime());
    await keepPending(to, await makeBackup(from, '1.12.0', new Date('2026-10-01T10:00:00Z')));
    await expect(restorePending(to, '1.12.0', later, { parts: only('songs') })).rejects.toThrow(
      'nothing',
    );
    expect(lastRestore(to, at.getTime())).toEqual(note);
    expect(fs.existsSync(path.join(to, 'backups', 'pending.zip'))).toBe(true);
    expect(songs(to)).toEqual(['ПС-b.vosongs']);
  });

  it('a backup without pictures (an empty images folder) leaves this copy’s pictures, even restored whole', async () => {
    const from = dataDir('a', 'opera');
    fs.rmSync(path.join(from, 'images'), { recursive: true });
    fs.mkdirSync(path.join(from, 'images'));
    const to = dataDir('b', 'firefox');
    await restore(from, to, ALL_PARTS, at);
    expect(images(to)).toEqual(['b.png', 'index.json']);
    expect(songs(to)).toEqual(['ПС-a.vosongs']);
  });
});
