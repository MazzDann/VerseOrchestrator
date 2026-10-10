import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { lastRestore, undoRestore } from './backup';
import { holdsData } from './copyFinder';
import {
  describeCopy,
  findCopies,
  importCopy,
  mergedPairings,
  mergedSettings,
  resolveCopy,
} from './otherCopy';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-copies-'));
  dirs.push(d);
  return d;
};
const write = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
};
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = (c: string) => c.repeat(64);

/** A release copy: <top>/<name>/app (package.json + the layout marker) and data/. */
function releaseCopy(top: string, name: string, version: string, tag: string) {
  const folder = path.join(top, name);
  write(path.join(folder, 'app', 'package.json'), { name: 'verse-orchestrator', version });
  write(path.join(folder, 'app', '.vo-portable'), {
    data: '../data',
    modules: '../modules',
  });
  const data = path.join(folder, 'data');
  write(path.join(data, 'ui-state.json'), {
    'vo:settings': { value: JSON.stringify({ state: { tag } }), at: 1000 },
    'vo:playlist': {
      value: JSON.stringify({ state: { items: [], saved: [{ name: tag }, { name: 'x' }] } }),
      at: 1000,
    },
  });
  write(path.join(data, 'songs', `ПС-${tag}.vosongs`), `bundle ${tag}`);
  write(path.join(data, 'images', 'index.json'), { images: [{ id: tag }] });
  write(path.join(data, 'images', `${tag}.png`), `png ${tag}`);
  write(path.join(data, 'settings.json'), {
    version: 1,
    remotes: { persist: true },
    standby: { port: 4747, idleMinutes: 30 },
    updates: { check: true, channel: 'beta' },
    launch: { browser: 'opera', appWindow: false },
    library: { files: [`${tag}.SQLite3`] },
  });
  write(path.join(data, 'secrets.json'), {
    version: 1,
    remotes: [{ id: `p-${tag}`, name: tag, tokenHash: hash(tag === 'old' ? 'a' : 'b') }],
  });
  write(path.join(data, 'albums.json'), { albums: [{ id: tag, path: `D:\\${tag}` }] });
  return { folder, root: path.join(folder, 'app'), data };
}

const tagOf = (d: string) =>
  JSON.parse(read(path.join(d, 'ui-state.json'))['vo:settings'].value).state.tag;

describe('«Перенести з іншої копії…» (1.12.0-beta.2)', () => {
  it('finds a copy by its folder, its app/, its data/ — not a folder without its data', () => {
    const top = tmp();
    const old = releaseCopy(top, 'VerseOrchestrator-1.8.4-windows-x64', '1.11.0', 'old');
    for (const named of [old.folder, old.root, old.data])
      expect(resolveCopy(named)).toEqual({ root: old.root, dataDir: old.data });
    const empty = path.join(top, 'empty');
    write(path.join(empty, 'app', 'package.json'), {
      name: 'verse-orchestrator',
      version: '1.0.0',
    });
    expect(resolveCopy(empty)).toBeNull();
    expect(resolveCopy(path.join(top, 'nothing'))).toBeNull();
    expect(holdsData(top)).toBe(false);
    // another app's package.json is not a copy
    write(path.join(top, 'other', 'package.json'), { name: 'something-else' });
    expect(resolveCopy(path.join(top, 'other'))).toBeNull();
  });

  it('says what a copy holds, and whether it is newer than this one', () => {
    const top = tmp();
    const old = releaseCopy(top, 'VO-old', '1.11.0', 'old');
    const info = describeCopy(resolveCopy(old.folder)!, '1.12.0');
    expect(info).toMatchObject({
      folder: old.folder,
      version: '1.11.0',
      newer: false,
      browser: 'opera',
      settings: true,
      look: true,
      pairings: 1,
      bundles: 1,
      pictures: 1,
      programs: 2,
      albums: 1,
      videos: 0,
    });
    expect(info.changed).toBeGreaterThan(0);
    expect(describeCopy(resolveCopy(old.folder)!, '1.10.0').newer).toBe(true);
  });

  it('finds the copies beside this one (a nested «Extract All» too), never this one', async () => {
    const top = tmp();
    const here = releaseCopy(top, 'VerseOrchestrator', '1.12.0', 'new');
    const old = releaseCopy(top, 'VerseOrchestrator-1.8.4-windows-x64', '1.11.0', 'old');
    const nested = releaseCopy(path.join(top, 'VO-zip'), 'VerseOrchestrator', '1.10.0', 'zip');
    fs.mkdirSync(path.join(top, 'Photos'));
    const copies = await findCopies({
      root: here.root,
      dataDir: here.data,
      port: 1,
      app: '1.12.0',
    });
    expect(copies.map((c) => c.folder).sort()).toEqual([nested.folder, old.folder].sort());
    expect(copies.every((c) => !c.running)).toBe(true);
  });

  it('the copy whose waiter holds the port comes first, marked as the one that runs', async () => {
    const top = tmp();
    const here = releaseCopy(top, 'VerseOrchestrator', '1.12.0', 'new');
    const elsewhere = releaseCopy(tmp(), 'Old', '1.11.1', 'old');
    const waiter = http.createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ state: 'waiting', root: elsewhere.root }));
    });
    await new Promise<void>((r) => waiter.listen(0, '127.0.0.1', r));
    try {
      const port = (waiter.address() as { port: number }).port;
      const copies = await findCopies({ root: here.root, dataDir: here.data, port, app: '1.12.0' });
      expect(copies[0]).toMatchObject({ folder: elsewhere.folder, running: true });
    } finally {
      waiter.close();
    }
  });

  it('takes the browser, port, updates from the other copy; keeps its own modules and keys', () => {
    const merged = mergedSettings(
      { version: 1, library: { files: ['here.SQLite3'] }, builderKey: 1 },
      { launch: { browser: 'opera', appWindow: false }, standby: { port: 4803, idleMinutes: 5 } },
    );
    expect(merged).toMatchObject({
      library: { files: ['here.SQLite3'] },
      builderKey: 1,
      launch: { browser: 'opera', appWindow: false },
      standby: { port: 4803, idleMinutes: 5 },
    });
  });

  it('adds the other copy’s pairings to this one’s; one already here (id or token) stays as it is', () => {
    const ours = { remotes: [{ id: 'a', name: 'here', tokenHash: hash('a') }] };
    const theirs = {
      remotes: [
        { id: 'a', name: 'there', tokenHash: hash('c') },
        { id: 'b', name: 'same token', tokenHash: hash('a') },
        { id: 'c', name: 'new', tokenHash: hash('d') },
        { id: 'd', name: 'broken', tokenHash: 'xyz' },
      ],
    };
    expect(mergedPairings(ours, theirs).remotes.map((p) => (p as { name: string }).name)).toEqual([
      'here',
      'new',
    ]);
    expect(mergedPairings(null, null)).toEqual({ version: 1, remotes: [] });
  });

  it('carries everything over; «Повернути як було» brings this copy back as it was', async () => {
    const top = tmp();
    const here = releaseCopy(top, 'VerseOrchestrator', '1.12.0', 'new');
    fs.rmSync(path.join(here.data, 'albums.json')); // this copy had no albums
    const old = releaseCopy(top, 'Old', '1.11.0', 'old');
    let told = 0;
    const at = new Date('2026-10-10T12:00:00Z');
    const summary = await importCopy(
      here.data,
      resolveCopy(old.folder)!,
      { things: true, launch: true, pairings: true },
      '1.12.0',
      at,
      () => told++,
    );
    expect(told).toBe(1);
    expect(summary).toMatchObject({ app: '1.11.0', programs: 2, bundles: ['ПС-old'], pictures: 1 });
    expect(tagOf(here.data)).toBe('old');
    expect(read(path.join(here.data, 'ui-state.json'))['vo:settings'].at).toBeGreaterThan(1000);
    expect(fs.readdirSync(path.join(here.data, 'songs'))).toEqual(['ПС-old.vosongs']);
    const settings = read(path.join(here.data, 'settings.json'));
    expect(settings.launch.browser).toBe('opera');
    expect(settings.library).toEqual({ files: ['new.SQLite3'] });
    expect(
      read(path.join(here.data, 'secrets.json')).remotes.map((p: { id: string }) => p.id),
    ).toEqual(['p-new', 'p-old']);
    expect(read(path.join(here.data, 'albums.json')).albums[0].id).toBe('old');
    // the other copy is left as it was
    expect(tagOf(old.data)).toBe('old');
    expect(fs.existsSync(path.join(old.data, 'songs', 'ПС-old.vosongs'))).toBe(true);

    const last = lastRestore(here.data, at.getTime())!;
    expect(last).toMatchObject({ from: old.folder });
    expect(last.extras?.sort()).toEqual(['albums.json', 'secrets.json', 'settings.json']);
    expect(await undoRestore(here.data, new Date(at.getTime() + 60_000))).toBe(true);
    expect(tagOf(here.data)).toBe('new');
    expect(fs.readdirSync(path.join(here.data, 'songs'))).toEqual(['ПС-new.vosongs']);
    expect(read(path.join(here.data, 'settings.json')).launch.browser).toBe('opera');
    expect(read(path.join(here.data, 'secrets.json')).remotes).toHaveLength(1);
    // this copy had none: the albums' list the import wrote goes
    expect(fs.existsSync(path.join(here.data, 'albums.json'))).toBe(false);
  });

  it('carries the pairings alone: songs, pictures and the look stay; the undo leaves them too', async () => {
    const top = tmp();
    const here = releaseCopy(top, 'VerseOrchestrator', '1.12.0', 'new');
    write(path.join(here.data, 'settings.json'), { version: 1, remotes: { persist: false } });
    const old = releaseCopy(top, 'Old', '1.11.0', 'old');
    const at = new Date('2026-10-10T12:00:00Z');
    expect(
      await importCopy(
        here.data,
        resolveCopy(old.folder)!,
        { things: false, launch: false, pairings: true },
        '1.12.0',
        at,
      ),
    ).toBeNull();
    expect(tagOf(here.data)).toBe('new');
    expect(fs.readdirSync(path.join(here.data, 'songs'))).toEqual(['ПС-new.vosongs']);
    expect(read(path.join(here.data, 'secrets.json')).remotes).toHaveLength(2);
    // carried pairings are kept across restarts
    expect(read(path.join(here.data, 'settings.json')).remotes).toEqual({ persist: true });
    // a change made after it stays through the undo
    write(path.join(here.data, 'songs', 'Нові.vosongs'), 'after');
    expect(await undoRestore(here.data, new Date(at.getTime() + 60_000))).toBe(true);
    expect(fs.readdirSync(path.join(here.data, 'songs')).sort()).toEqual([
      'Нові.vosongs',
      'ПС-new.vosongs',
    ]);
    expect(read(path.join(here.data, 'secrets.json')).remotes).toHaveLength(1);
    expect(read(path.join(here.data, 'settings.json')).remotes).toEqual({ persist: false });
  });
});
