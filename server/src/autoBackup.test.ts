import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_KEEP,
  autoDir,
  dailyDue,
  listAutoBackups,
  makeAutoBackup,
  parseAutoName,
  readAutoBackup,
} from './autoBackup';
import {
  collect,
  keepPending,
  lastRestore,
  readBackup,
  restorePending,
  START_KEY,
  undoRestore,
} from './backup';
import { unzip, zip, zipToFile } from './zip';

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

/** A data folder with the operator's things and this machine's settings. */
function dataDir(tag: string, browser = 'opera') {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-auto-'));
  dirs.push(d);
  write(path.join(d, 'ui-state.json'), {
    'vo:settings': { value: JSON.stringify({ state: { tag } }), at: 1000 },
  });
  write(path.join(d, 'songs', `ПС-${tag}.vosongs`), `bundle ${tag}`);
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
const tagOf = (d: string) =>
  JSON.parse(read(path.join(d, 'ui-state.json'))['vo:settings'].value).state.tag;

describe('automatic backups (1.12.0-beta.3)', () => {
  it('names say what they are — kind, time, versions, without the pictures — and nothing else is taken', () => {
    expect(
      parseAutoName('auto-update-2026-10-10-091502-1.12.0-beta.3-to-1.12.0-beta.4-no-pictures.zip'),
    ).toMatchObject({ kind: 'update', app: '1.12.0-beta.3', to: '1.12.0-beta.4', pictures: false });
    expect(parseAutoName('auto-daily-2026-10-10-091502-1.12.0.zip')).toMatchObject({
      kind: 'daily',
      app: '1.12.0',
      pictures: true,
    });
    for (const bad of ['../auto-daily-2026-10-10-091502-1.12.0.zip', 'x.zip', 'auto-daily-.zip'])
      expect(parseAutoName(bad)).toBeNull();
  });

  it('makes a backup any version can restore: the usual files, the start settings inside the UI state', async () => {
    const d = dataDir('a');
    const now = new Date(2026, 9, 10, 9, 15, 2);
    const b = await makeAutoBackup(d, '1.12.0', 'daily', { now });
    expect(b).toMatchObject({ kind: 'daily', app: '1.12.0', pictures: true });
    expect(b.name).toBe('auto-daily-2026-10-10-091502-1.12.0.zip');
    const buf = fs.readFileSync(path.join(autoDir(d), b.name));
    expect(b.size).toBe(buf.length);
    const { entries, summary } = await readBackup(buf);
    expect(entries.map((e) => e.name)).toEqual([
      'manifest.json',
      'ui-state.json',
      'songs/ПС-a.vosongs',
      'images/a.png',
      'images/index.json',
    ]);
    expect(summary).toMatchObject({ withPictures: true, start: { browser: 'Opera', port: 4747 } });
    const ui = JSON.parse(entries[1].data.toString('utf8'));
    expect(JSON.parse(ui[START_KEY].value)).not.toHaveProperty('library');
    expect(await listAutoBackups(d)).toEqual([b]);
  });

  it('the streamed zip holds exactly what the one made in memory holds', async () => {
    const d = dataDir('a');
    const now = new Date(2026, 9, 10, 9, 0, 0);
    const entries = await collect(d, '1.12.0', now);
    const file = path.join(d, 'streamed.zip');
    await zipToFile(file, entries, now);
    expect(await unzip(fs.readFileSync(file))).toEqual(await unzip(await zip(entries, now)));
    expect(fs.readdirSync(d).some((n) => n.endsWith('.tmp'))).toBe(false);
  });

  it('keeps the last 7 daily and the last 3 before a version change, each kind apart', async () => {
    const d = dataDir('a');
    for (let day = 1; day <= 9; day++)
      await makeAutoBackup(d, '1.12.0', 'daily', { now: new Date(2026, 9, day, 10) });
    for (let n = 0; n < 4; n++)
      await makeAutoBackup(d, '1.12.0', 'update', {
        now: new Date(2026, 9, 9, 11, n),
        to: '1.12.1',
      });
    const list = await listAutoBackups(d);
    expect(list.filter((b) => b.kind === 'daily')).toHaveLength(AUTO_KEEP.daily);
    expect(list.filter((b) => b.kind === 'update')).toHaveLength(AUTO_KEEP.update);
    // the newest stay, newest first
    expect(list[0]).toMatchObject({ kind: 'update', to: '1.12.1' });
    expect(list.filter((b) => b.kind === 'daily').at(-1)!.created).toBe(
      new Date(2026, 9, 3, 10).toISOString(),
    );
  });

  it('one daily copy a day', async () => {
    const d = dataDir('a');
    expect(dailyDue([], new Date(2026, 9, 10, 8))).toBe(true);
    await makeAutoBackup(d, '1.12.0', 'daily', { now: new Date(2026, 9, 10, 8) });
    const list = await listAutoBackups(d);
    expect(dailyDue(list, new Date(2026, 9, 10, 23, 59))).toBe(false);
    expect(dailyDue(list, new Date(2026, 9, 11, 0, 1))).toBe(true);
    // a copy before an update is no daily one
    await makeAutoBackup(d, '1.12.0', 'update', { now: new Date(2026, 9, 11, 9), to: '1.12.1' });
    expect(dailyDue(await listAutoBackups(d), new Date(2026, 9, 11, 10))).toBe(true);
  });

  it('pictures that would pass 1 GB are left out; restoring that copy keeps the pictures there are', async () => {
    const d = dataDir('a');
    const stat = fsp.stat.bind(fsp);
    vi.spyOn(fsp, 'stat').mockImplementation((async (p: fs.PathLike) => {
      const st = await stat(p);
      if (String(p).includes(`${path.sep}images${path.sep}`))
        return Object.assign(Object.create(Object.getPrototypeOf(st)), st, { size: 2 * 1024 ** 3 });
      return st;
    }) as typeof fsp.stat);
    const b = await makeAutoBackup(d, '1.12.0', 'daily', { now: new Date(2026, 9, 10, 9) });
    vi.restoreAllMocks();
    expect(b).toMatchObject({ pictures: false });
    expect(b.name.endsWith('-no-pictures.zip')).toBe(true);
    const buf = fs.readFileSync(path.join(autoDir(d), b.name));
    const { entries, summary } = await readBackup(buf);
    expect(entries.some((e) => e.name.startsWith('images/'))).toBe(false);
    expect(summary.withPictures).toBe(false);

    // the copy changes: other songs, other pictures
    fs.rmSync(path.join(d, 'songs', 'ПС-a.vosongs'));
    write(path.join(d, 'songs', 'Нові.vosongs'), 'new');
    write(path.join(d, 'images', 'later.png'), 'later');
    const at = new Date('2026-10-10T12:00:00Z');
    await keepPending(d, buf);
    await restorePending(d, '1.12.0', at);
    expect(fs.readdirSync(path.join(d, 'songs')).filter((n) => !n.startsWith('.'))).toEqual([
      'ПС-a.vosongs',
    ]);
    // the pictures are this copy's, untouched
    expect(fs.readdirSync(path.join(d, 'images')).sort()).toEqual([
      'a.png',
      'index.json',
      'later.png',
    ]);
    expect(lastRestore(d, at.getTime())).toMatchObject({ subs: ['songs'] });
    expect(await undoRestore(d, new Date(at.getTime() + 60_000))).toBeTruthy();
    expect(fs.readdirSync(path.join(d, 'songs')).filter((n) => !n.startsWith('.'))).toEqual([
      'Нові.vosongs',
    ]);
    expect(fs.readdirSync(path.join(d, 'images')).sort()).toEqual([
      'a.png',
      'index.json',
      'later.png',
    ]);
  });

  it('a restore brings the start settings back, keeping this copy’s modules; the undo puts its own back', async () => {
    const from = dataDir('a', 'opera');
    const b = await makeAutoBackup(from, '1.12.0', 'daily', { now: new Date(2026, 9, 10, 9) });
    const to = dataDir('b', 'firefox');
    const at = new Date('2026-10-10T12:00:00Z');
    await keepPending(to, fs.readFileSync(path.join(autoDir(from), b.name)));
    await restorePending(to, '1.12.0', at);
    expect(tagOf(to)).toBe('a');
    const settings = read(path.join(to, 'settings.json'));
    expect(settings.launch.browser).toBe('opera');
    expect(settings.library).toEqual({ files: ['b.SQLite3'] });
    // the start settings never land in the UI state
    expect(read(path.join(to, 'ui-state.json'))).not.toHaveProperty(START_KEY);
    await undoRestore(to, new Date(at.getTime() + 60_000));
    expect(read(path.join(to, 'settings.json')).launch.browser).toBe('firefox');
    expect(tagOf(to)).toBe('b');
  });

  it('a backup of a copy without a UI state of its own leaves the restored copy’s UI state alone', async () => {
    const from = dataDir('a');
    fs.rmSync(path.join(from, 'ui-state.json'));
    const b = await makeAutoBackup(from, '1.12.0', 'daily', { now: new Date(2026, 9, 10, 9) });
    const to = dataDir('b');
    await keepPending(to, fs.readFileSync(path.join(autoDir(from), b.name)));
    await restorePending(to, '1.12.0', new Date('2026-10-10T12:00:00Z'));
    expect(tagOf(to)).toBe('b');
  });

  it('reads an automatic backup only by one of its names', async () => {
    const d = dataDir('a');
    const b = await makeAutoBackup(d, '1.12.0', 'daily', { now: new Date(2026, 9, 10, 9) });
    expect(await readAutoBackup(d, b.name)).toBeInstanceOf(Buffer);
    expect(await readAutoBackup(d, '../settings.json')).toBeNull();
    expect(await readAutoBackup(d, { name: b.name })).toBeNull();
    expect(await readAutoBackup(d, 'auto-daily-2026-01-01-000000-1.0.0.zip')).toBeNull();
  });
});
