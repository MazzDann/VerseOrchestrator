import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lastRestore, undoRestore } from './backup';
import { holdsContent, holdsData, resolveCopy, siblingCopies } from './copyFinder';
import { describeCopy, findCopies, importCopy, mergedSettings } from './otherCopy';
import {
  adoptPairings,
  dropPairings,
  initRemoteStore,
  listPairings,
  setRemotePersistence,
} from './remote';

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
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
  write(path.join(folder, 'app', '.vo-portable'), { data: '../data', modules: '../modules' });
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
    remotes: [
      {
        id: `p-${tag}`,
        name: 'Пульт 1',
        tokenHash: hash(tag === 'old' ? 'a' : 'b'),
        allowed: ['next', 'prev'],
      },
    ],
  });
  write(path.join(data, 'albums.json'), { albums: [{ id: tag, path: `D:\\${tag}` }] });
  return { folder, root: path.join(folder, 'app'), data };
}

const tagOf = (d: string) =>
  JSON.parse(read(path.join(d, 'ui-state.json'))['vo:settings'].value).state.tag;

/** This copy's remote store, as the server starts it. */
const startRemotes = (data: string) =>
  initRemoteStore({
    file: path.join(data, 'secrets.json'),
    persist: read(path.join(data, 'settings.json')).remotes?.persist ?? true,
  });
/** What the import route does once the state is in place (index.ts). */
const adopt = (data: string) => (pairings: unknown[]) => {
  setRemotePersistence(read(path.join(data, 'settings.json')).remotes?.persist ?? true);
  adoptPairings(pairings);
};
const names = () => listPairings(() => false).map((p) => p.name);

describe('«Перенести з іншої копії…» (1.12.0-beta.2)', () => {
  it('finds a copy by its folder, its app/, its data/ — not a folder without its data', async () => {
    const top = tmp();
    const old = releaseCopy(top, 'VerseOrchestrator-1.8.4-windows-x64', '1.11.0', 'old');
    for (const named of [old.folder, old.root, old.data])
      expect(await resolveCopy(named)).toEqual({ root: old.root, dataDir: old.data });
    const empty = path.join(top, 'empty');
    write(path.join(empty, 'app', 'package.json'), {
      name: 'verse-orchestrator',
      version: '1.0.0',
    });
    expect(await resolveCopy(empty)).toBeNull();
    expect(await resolveCopy(path.join(top, 'nothing'))).toBeNull();
    expect(await holdsData(top)).toBe(false);
    // another app's package.json is not a copy
    write(path.join(top, 'other', 'package.json'), { name: 'something-else' });
    expect(await resolveCopy(path.join(top, 'other'))).toBeNull();
    // a bare data folder picked by hand is one, with no app folder
    const bare = path.join(top, 'flash', 'data');
    write(path.join(bare, 'ui-state.json'), {});
    expect(await resolveCopy(bare)).toEqual({ root: null, dataDir: bare });
  });

  it('says what a copy holds — the pairings by name —, and whether it is newer than this one', async () => {
    const top = tmp();
    const old = releaseCopy(top, 'VO-old', '1.11.0', 'old');
    const info = await describeCopy((await resolveCopy(old.folder))!, '1.12.0');
    expect(info).toMatchObject({
      folder: old.folder,
      version: '1.11.0',
      app: true,
      newer: false,
      browser: 'Opera',
      settings: true,
      look: true,
      pairings: 1,
      pairingNames: ['Пульт 1'],
      bundles: 1,
      pictures: 1,
      programs: 2,
      albums: 1,
      videos: 0,
    });
    expect(info.changed).toBeGreaterThan(0);
    expect((await describeCopy((await resolveCopy(old.folder))!, '1.10.0')).newer).toBe(true);
    // a browser name the app doesn't know is no browser
    write(path.join(old.data, 'settings.json'), { launch: { browser: '<b>x</b>' } });
    expect((await describeCopy((await resolveCopy(old.folder))!, '1.12.0')).browser).toBeNull();
  });

  it('finds the real copies beside this one (a nested «Extract All» too) — not any folder with a settings.json', async () => {
    const top = tmp();
    const here = releaseCopy(top, 'VerseOrchestrator', '1.12.0', 'new');
    const old = releaseCopy(top, 'VerseOrchestrator-1.8.4-windows-x64', '1.11.0', 'old');
    const nested = releaseCopy(path.join(top, 'VO-zip'), 'VerseOrchestrator', '1.10.0', 'zip');
    write(path.join(top, 'Photos', 'settings.json'), { some: 'other app' });
    write(path.join(top, 'repo', 'config', 'secrets.json'), { remotes: [] });
    const copies = await findCopies({
      root: here.root,
      dataDir: here.data,
      port: 1,
      app: '1.12.0',
    });
    expect(copies.map((c) => c.folder).sort()).toEqual([nested.folder, old.folder].sort());
    expect(copies.every((c) => !c.running && c.app)).toBe(true);
  });

  it('a copy unpacked into a folder of its own sees the neighbours of that folder', async () => {
    const top = tmp();
    // Downloads\VerseOrchestrator-windows-x64\VO-1.12.0 (the zip's own top folder)
    const outer = path.join(top, 'VerseOrchestrator-windows-x64');
    const here = releaseCopy(outer, 'VO-1.12.0', '1.12.0', 'new');
    const old = releaseCopy(top, 'VerseOrchestrator-1.8.4', '1.11.0', 'old');
    const found = await siblingCopies(here.root, here.data);
    expect(found.map((c) => c.root)).toEqual([old.root]);
  });

  it('a folder named like the app is looked at even past the first 200 entries', async () => {
    const top = tmp();
    const here = releaseCopy(top, 'A-here', '1.12.0', 'new');
    for (let i = 0; i < 210; i++)
      fs.mkdirSync(path.join(top, `folder-${String(i).padStart(3, '0')}`));
    const old = releaseCopy(top, 'VerseOrchestrator-old', '1.11.0', 'old');
    expect((await siblingCopies(here.root, here.data)).map((c) => c.root)).toEqual([old.root]);
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

  it('takes the browser, port, updates from the other copy; keeps its own modules, keys and remote persistence', () => {
    const merged = mergedSettings(
      {
        version: 1,
        library: { files: ['here.SQLite3'] },
        builderKey: 1,
        remotes: { persist: true },
      },
      {
        launch: { browser: 'opera', appWindow: false },
        standby: { port: 4803, idleMinutes: 5 },
        remotes: { persist: false },
      },
    );
    expect(merged).toMatchObject({
      library: { files: ['here.SQLite3'] },
      builderKey: 1,
      remotes: { persist: true },
      launch: { browser: 'opera', appWindow: false },
      standby: { port: 4803, idleMinutes: 5 },
    });
  });

  it('the remote store adds only new pairings (by id or token), a taken name made unique, and drops them again', () => {
    const data = tmp();
    write(path.join(data, 'secrets.json'), {
      version: 1,
      remotes: [{ id: 'a', name: 'Пульт 1', tokenHash: hash('a'), allowed: ['next'] }],
    });
    initRemoteStore({ file: path.join(data, 'secrets.json'), persist: true });
    const added = adoptPairings([
      { id: 'a', name: 'there', tokenHash: hash('c') },
      { id: 'b', name: 'same token', tokenHash: hash('a') },
      { id: 'c', name: 'Пульт 1', tokenHash: hash('d'), allowed: ['next', 'timer'] },
      { id: 'd', name: 'broken', tokenHash: 'xyz' },
    ]);
    expect(added).toEqual(['c']);
    expect(names()).toEqual(['Пульт 1', 'Пульт 1 (2)']);
    expect(read(path.join(data, 'secrets.json')).remotes).toHaveLength(2);
    expect(dropPairings(['c', 'gone'])).toEqual(['c']);
    expect(read(path.join(data, 'secrets.json')).remotes).toHaveLength(1);
  });

  it('carries everything over; «Повернути як було» brings this copy back, a phone paired since stays', async () => {
    const top = tmp();
    const here = releaseCopy(top, 'VerseOrchestrator', '1.12.0', 'new');
    fs.rmSync(path.join(here.data, 'albums.json')); // this copy had no albums
    const old = releaseCopy(top, 'Old', '1.11.0', 'old');
    startRemotes(here.data);
    const at = new Date('2026-10-10T12:00:00Z');
    const done = await importCopy(
      here.data,
      (await resolveCopy(old.folder))!,
      { things: true, launch: true, pairings: true },
      '1.12.0',
      at,
      adopt(here.data),
    );
    expect(done.summary).toMatchObject({
      app: '1.11.0',
      programs: 2,
      bundles: ['ПС-old'],
      pictures: 1,
    });
    expect(tagOf(here.data)).toBe('old');
    expect(read(path.join(here.data, 'ui-state.json'))['vo:settings'].at).toBeGreaterThan(1000);
    expect(fs.readdirSync(path.join(here.data, 'songs'))).toEqual(['ПС-old.vosongs']);
    expect(fs.readFileSync(path.join(here.data, 'images', 'old.png'), 'utf8')).toBe('png old');
    const settings = read(path.join(here.data, 'settings.json'));
    expect(settings.launch.browser).toBe('opera');
    expect(settings.library).toEqual({ files: ['new.SQLite3'] });
    // both «Пульт 1»: the carried one is told apart
    expect(names()).toEqual(['Пульт 1', 'Пульт 1 (2)']);
    expect(read(path.join(here.data, 'secrets.json')).remotes).toHaveLength(2);
    expect(read(path.join(here.data, 'albums.json')).albums[0].id).toBe('old');
    // the other copy is left as it was
    expect(tagOf(old.data)).toBe('old');
    expect(fs.existsSync(path.join(old.data, 'songs', 'ПС-old.vosongs'))).toBe(true);

    const last = lastRestore(here.data, at.getTime())!;
    expect(last).toMatchObject({ from: old.folder, pairings: ['p-old'] });
    expect(last.extras?.sort()).toEqual(['albums.json', 'settings.json']);
    // a phone paired after the import…
    adoptPairings([{ id: 'later', name: 'Новий', tokenHash: hash('e') }]);
    const undone = await undoRestore(here.data, new Date(at.getTime() + 60_000), ({ pairings }) => {
      dropPairings(pairings);
    });
    expect(undone).toEqual({ pairings: ['p-old'], uiCleared: false });
    expect(tagOf(here.data)).toBe('new');
    expect(fs.readdirSync(path.join(here.data, 'songs'))).toEqual(['ПС-new.vosongs']);
    expect(read(path.join(here.data, 'settings.json')).launch.browser).toBe('opera');
    // …stays paired; the carried one went
    expect(names()).toEqual(['Пульт 1', 'Новий']);
    // this copy had none: the albums' list the import wrote goes
    expect(fs.existsSync(path.join(here.data, 'albums.json'))).toBe(false);
  });

  it('carries the pairings alone: songs, pictures and the look stay; the undo leaves them too', async () => {
    const top = tmp();
    const here = releaseCopy(top, 'VerseOrchestrator', '1.12.0', 'new');
    write(path.join(here.data, 'settings.json'), { version: 1, remotes: { persist: false } });
    write(path.join(here.data, 'secrets.json'), { version: 1, remotes: [] });
    const old = releaseCopy(top, 'Old', '1.11.0', 'old');
    startRemotes(here.data);
    const at = new Date('2026-10-10T12:00:00Z');
    const done = await importCopy(
      here.data,
      (await resolveCopy(old.folder))!,
      { things: false, launch: false, pairings: true },
      '1.12.0',
      at,
      adopt(here.data),
    );
    expect(done.summary).toBeNull();
    expect(tagOf(here.data)).toBe('new');
    expect(fs.readdirSync(path.join(here.data, 'songs'))).toEqual(['ПС-new.vosongs']);
    // carried pairings are kept across restarts
    expect(read(path.join(here.data, 'settings.json')).remotes).toEqual({ persist: true });
    expect(read(path.join(here.data, 'secrets.json')).remotes).toHaveLength(1);
    // a change made after it stays through the undo
    write(path.join(here.data, 'songs', 'Нові.vosongs'), 'after');
    await undoRestore(here.data, new Date(at.getTime() + 60_000), ({ pairings }) => {
      dropPairings(pairings);
      setRemotePersistence(read(path.join(here.data, 'settings.json')).remotes.persist);
    });
    expect(fs.readdirSync(path.join(here.data, 'songs')).sort()).toEqual([
      'Нові.vosongs',
      'ПС-new.vosongs',
    ]);
    expect(read(path.join(here.data, 'settings.json')).remotes).toEqual({ persist: false });
    expect(names()).toEqual([]);
  });

  it('a bare data folder gives no pairings; a copy without start settings gives none either', async () => {
    const top = tmp();
    const here = releaseCopy(top, 'VerseOrchestrator', '1.12.0', 'new');
    const settingsBefore = fs.readFileSync(path.join(here.data, 'settings.json'), 'utf8');
    const flash = path.join(top, 'flash', 'data');
    write(path.join(flash, 'ui-state.json'), {});
    write(path.join(flash, 'secrets.json'), {
      remotes: [{ id: 'evil', name: 'x', tokenHash: hash('f'), allowed: ['next'] }],
    });
    startRemotes(here.data);
    const done = await importCopy(
      here.data,
      (await resolveCopy(flash))!,
      { things: false, launch: true, pairings: true },
      '1.12.0',
      new Date(),
      adopt(here.data),
    );
    expect(done.pairings).toEqual([]);
    expect(names()).toEqual(['Пульт 1']);
    expect(fs.readFileSync(path.join(here.data, 'settings.json'), 'utf8')).toBe(settingsBefore);
  });

  it('a failure while the settings go in puts the songs and pictures back first, and offers no way back', async () => {
    const top = tmp();
    const here = releaseCopy(top, 'VerseOrchestrator', '1.12.0', 'new');
    const old = releaseCopy(top, 'Old', '1.11.0', 'old');
    startRemotes(here.data);
    const rename = fsp.rename.bind(fsp);
    vi.spyOn(fsp, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith('settings.json'))
        throw Object.assign(new Error('ENOSPC: no space left'), { code: 'ENOSPC' });
      return rename(from, to);
    });
    await expect(
      importCopy(
        here.data,
        (await resolveCopy(old.folder))!,
        { things: true, launch: true, pairings: false },
        '1.12.0',
        new Date(),
      ),
    ).rejects.toThrow(/ENOSPC/);
    expect(tagOf(here.data)).toBe('new');
    expect(fs.readdirSync(path.join(here.data, 'songs'))).toEqual(['ПС-new.vosongs']);
    expect(read(path.join(here.data, 'settings.json')).library).toEqual({
      files: ['new.SQLite3'],
    });
    expect(fs.readdirSync(here.data).some((n) => n.endsWith('.tmp'))).toBe(false);
    expect(lastRestore(here.data)).toBeNull();
  });

  it('undo into a copy that had no UI state takes the carried one away too', async () => {
    const top = tmp();
    const here = releaseCopy(top, 'VerseOrchestrator', '1.12.0', 'new');
    fs.rmSync(path.join(here.data, 'ui-state.json'));
    const old = releaseCopy(top, 'Old', '1.11.0', 'old');
    startRemotes(here.data);
    const at = new Date('2026-10-10T12:00:00Z');
    await importCopy(
      here.data,
      (await resolveCopy(old.folder))!,
      { things: true, launch: false, pairings: false },
      '1.12.0',
      at,
    );
    expect(tagOf(here.data)).toBe('old');
    const undone = await undoRestore(here.data, new Date(at.getTime() + 60_000));
    expect(undone).toEqual({ pairings: [], uiCleared: true });
    expect(fs.existsSync(path.join(here.data, 'ui-state.json'))).toBe(false);
  });

  it('a songs folder that links out of the other copy is left out', async () => {
    const top = tmp();
    const here = releaseCopy(top, 'VerseOrchestrator', '1.12.0', 'new');
    const old = releaseCopy(top, 'Old', '1.11.0', 'old');
    const outside = path.join(top, 'outside-songs');
    write(path.join(outside, 'Чужі.vosongs'), 'not theirs');
    fs.rmSync(path.join(old.data, 'songs'), { recursive: true });
    try {
      fs.symlinkSync(outside, path.join(old.data, 'songs'), 'junction');
    } catch {
      return; // no links on this system (no right to make one): nothing to check
    }
    startRemotes(here.data);
    const done = await importCopy(
      here.data,
      (await resolveCopy(old.folder))!,
      { things: true, launch: false, pairings: false },
      '1.12.0',
    );
    expect(done.summary?.bundles).toEqual([]);
    expect(fs.readdirSync(path.join(here.data, 'songs'))).toEqual([]);
  });

  it('the start file names a copy with the operator’s content, not one with a settings file only', async () => {
    const top = tmp();
    const blank = releaseCopy(top, 'Blank', '1.12.0', 'blank');
    for (const n of ['ui-state.json', 'secrets.json', 'albums.json'])
      fs.rmSync(path.join(blank.data, n));
    fs.rmSync(path.join(blank.data, 'songs'), { recursive: true });
    fs.rmSync(path.join(blank.data, 'images'), { recursive: true });
    expect(await holdsContent(blank.data)).toBe(false);
    const old = releaseCopy(top, 'Old', '1.11.0', 'old');
    expect(await holdsContent(old.data)).toBe(true);
  });
});
