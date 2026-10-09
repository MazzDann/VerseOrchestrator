import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  autostartEntry,
  isAutostartOn,
  liveNode,
  refreshAutostart,
  setAutostart,
  stableNode,
  writeWhole,
  type AutostartFiles,
  type WriteFs,
} from './autostart';
import { sanitizeServerSettings, validStandbyPort } from './serverSettings';

describe('autostart entry', () => {
  it('Windows: a hidden .vbs in Startup, quoting paths with spaces', () => {
    const e = autostartEntry({
      platform: 'win32',
      home: 'C:\\Users\\Олена',
      appData: 'C:\\Users\\Олена\\AppData\\Roaming',
      node: 'C:\\Program Files\\nodejs\\node.exe',
      script: 'C:\\Users\\Олена\\My Projects\\vo\\server\\src\\standby.ts',
      root: 'C:\\Users\\Олена\\My Projects\\vo',
    })!;
    expect(e.file).toMatch(/Startup[\\/]VerseOrchestrator-standby\.vbs$/);
    expect(e.content).toContain(
      'CreateObject("WScript.Shell").Run """C:\\Program Files\\nodejs\\node.exe"" --disable-warning=ExperimentalWarning ""C:\\Users\\Олена\\My Projects\\vo\\server\\src\\standby.ts""", 0, False',
    );
    expect(e.content).toMatch(/\r\n/);
    expect(e.utf16).toBe(true); // WSH doesn't read UTF-8: the Cyrillic path needs UTF-16
  });

  it('macOS: a LaunchAgent that runs at login, XML-escaped', () => {
    const e = autostartEntry({
      platform: 'darwin',
      home: '/Users/a',
      node: '/opt/homebrew/bin/node',
      script: '/Users/a/R&D/vo/server/src/standby.ts',
      root: '/Users/a/R&D/vo',
    })!;
    expect(e.file).toBe(
      path.join('/Users/a', 'Library', 'LaunchAgents', 'ua.verseorchestrator.standby.plist'),
    );
    expect(e.content).toContain('<string>/Users/a/R&amp;D/vo/server/src/standby.ts</string>');
    expect(e.content).toContain('<key>RunAtLoad</key><true/>');
    expect(e.content).not.toContain('R&D');
  });

  it('Linux: an XDG autostart entry with quoted Exec', () => {
    const e = autostartEntry({
      platform: 'linux',
      home: '/home/a',
      node: '/usr/bin/node',
      script: '/home/a/my vo/server/src/standby.ts',
      root: '/home/a/my vo',
    })!;
    expect(e.file).toBe(
      path.join('/home/a', '.config', 'autostart', 'verseorchestrator-standby.desktop'),
    );
    expect(e.content).toContain(
      'Exec="/usr/bin/node" "--disable-warning=ExperimentalWarning" "/home/a/my vo/server/src/standby.ts"',
    );
  });

  it('other systems: not supported', () => {
    expect(
      autostartEntry({ platform: 'aix', home: '/', node: 'node', script: 's', root: '/' }),
    ).toBeNull();
    expect(() => setAutostart(null, true)).toThrow(/не підтримується/);
    expect(isAutostartOn(null)).toBe(false);
  });

  it('switching on writes the file (creating the folder), off removes it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-autostart-'));
    try {
      const entry = { file: path.join(dir, 'Startup', 'x.vbs'), content: 'hello' };
      expect(isAutostartOn(entry)).toBe(false);
      setAutostart(entry, true);
      expect(fs.readFileSync(entry.file, 'utf8')).toBe('hello');
      expect(fs.readdirSync(path.dirname(entry.file))).toEqual(['x.vbs']); // no x.vbs.tmp left
      expect(isAutostartOn(entry)).toBe(true);
      setAutostart(entry, false);
      setAutostart(entry, false); // already gone: fine
      expect(isAutostartOn(entry)).toBe(false);
      // the .vbs: UTF-16 LE with a BOM
      setAutostart({ ...entry, content: 'Олена', utf16: true }, true);
      const bytes = fs.readFileSync(entry.file);
      expect([...bytes.subarray(0, 2)]).toEqual([0xff, 0xfe]);
      expect(bytes.subarray(2).toString('utf16le')).toBe('Олена');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

const CELLAR = '/opt/homebrew/Cellar/node/25.6.1/bin/node';
const OPT = '/opt/homebrew/opt/node/bin/node';
const enoent = (p: string) => Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
/** A file system of links: each known path → the file it leads to; anything else is missing. */
const links =
  (map: Record<string, string>) =>
  (p: string): string => {
    if (p in map) return map[p];
    throw enoent(p);
  };

describe('the Node autostart starts (Mac check of 1.9.0)', () => {
  it('Homebrew: the formula’s link that follows `brew upgrade`, not the versioned folder', () => {
    const realpath = links({
      [CELLAR]: CELLAR,
      '/opt/homebrew/opt/node/bin/node': CELLAR,
      '/opt/homebrew/bin/node': CELLAR,
    });
    const node = stableNode(CELLAR, { platform: 'darwin', realpath });
    expect(node).toBe('/opt/homebrew/opt/node/bin/node');
    const e = autostartEntry({
      platform: 'darwin',
      home: '/Users/a',
      node,
      script: '/Users/a/vo/server/src/standby.ts',
      root: '/Users/a/vo',
    })!;
    expect(e.content).toContain('<string>/opt/homebrew/opt/node/bin/node</string>');
    expect(e.content).not.toContain('Cellar');
  });

  it('Intel Homebrew and a keg-only node@24 (no <prefix>/bin/node of its own)', () => {
    const cellar = '/usr/local/Cellar/node@24/24.9.0/bin/node';
    const realpath = links({
      [cellar]: cellar,
      '/usr/local/opt/node@24/bin/node': cellar,
      '/usr/local/bin/node': '/usr/local/Cellar/node/25.6.1/bin/node', // another formula
    });
    expect(stableNode(cellar, { platform: 'darwin', realpath })).toBe(
      '/usr/local/opt/node@24/bin/node',
    );
  });

  it('<prefix>/bin/node when only it leads to this very file', () => {
    const realpath = links({ [CELLAR]: CELLAR, '/opt/homebrew/bin/node': CELLAR });
    expect(stableNode(CELLAR, { platform: 'darwin', realpath })).toBe('/opt/homebrew/bin/node');
  });

  it('a link that leads elsewhere: the real path stays', () => {
    const newer = '/opt/homebrew/Cellar/node/26.0.0/bin/node';
    const realpath = links({
      [CELLAR]: CELLAR,
      '/opt/homebrew/opt/node/bin/node': newer,
      '/opt/homebrew/bin/node': newer,
    });
    expect(stableNode(CELLAR, { platform: 'darwin', realpath })).toBe(CELLAR);
  });

  it('not Homebrew, or not a Mac: unchanged, without looking at the disk', () => {
    const realpath = (p: string): string => {
      throw new Error(`looked at ${p}`);
    };
    for (const node of [
      '/Users/a/VerseOrchestrator/app/node/bin/node', // a release copy
      '/Users/a/.nvm/versions/node/v24.9.0/bin/node',
      '/usr/local/bin/node', // nodejs.org's installer
    ]) {
      expect(stableNode(node, { platform: 'darwin', realpath })).toBe(node);
    }
    expect(stableNode(CELLAR, { platform: 'linux', realpath })).toBe(CELLAR);
    const win = 'C:\\Program Files\\nodejs\\node.exe';
    expect(stableNode(win, { platform: 'win32', realpath })).toBe(win);
  });
});

describe('an entry naming a Node gone or in the Cellar is rewritten (Mac check of 1.10.1)', () => {
  const NVM = '/Users/a/.nvm/versions/node/v24.9.0/bin/node';
  /** Files in memory: what each holds, every write, and the Nodes that are there. */
  const disk = (init: Record<string, Buffer>, live: string[] = []) => {
    const held = new Map(Object.entries(init));
    const writes: string[] = [];
    const asked: string[] = [];
    const files: AutostartFiles = {
      read: (f) => {
        const b = held.get(f);
        if (!b) throw enoent(f);
        return b;
      },
      write: (f, data) => {
        writes.push(f);
        held.set(f, data);
      },
      exists: (f) => {
        asked.push(f);
        return live.includes(f);
      },
    };
    return { held, writes, asked, files };
  };
  const mac = (node: string, root = '/Users/a/vo') =>
    autostartEntry({
      platform: 'darwin',
      home: '/Users/a',
      node,
      script: `${root}/server/src/standby.ts`,
      root,
    })!;
  const quiet = { log: () => {}, platform: 'darwin' as const };

  it('off (no file): nothing is written — off stays off', () => {
    const { writes, files } = disk({});
    expect(refreshAutostart(mac(OPT), { ...quiet, files })).toBe('off');
    expect(refreshAutostart(null, { ...quiet, files })).toBe('off');
    expect(writes).toEqual([]);
  });

  it('on with the same content: nothing is written', () => {
    const entry = mac(OPT);
    const { writes, files } = disk({ [entry.file]: Buffer.from(entry.content) });
    expect(refreshAutostart(entry, { ...quiet, files })).toBe('same');
    expect(writes).toEqual([]);
  });

  it('on with a Cellar path from before 1.9.2: rewritten with the stable link', () => {
    const entry = mac(OPT);
    const { held, writes, files } = disk({ [entry.file]: Buffer.from(mac(CELLAR).content) });
    const log: string[] = [];
    const opts = { platform: 'darwin' as const, files, log: (m: string) => log.push(m) };
    expect(refreshAutostart(entry, opts)).toBe('rewritten');
    expect(writes).toEqual([entry.file]);
    expect(held.get(entry.file)!.toString()).toBe(entry.content);
    expect(held.get(entry.file)!.toString()).not.toContain('Cellar');
    expect(log).toEqual([`autostart: ${entry.file} started ${CELLAR}, now ${OPT}`]);
    // …once: the next start finds it as it would write it
    expect(refreshAutostart(entry, opts)).toBe('same');
    expect(log).toHaveLength(1);
    // a Cellar Node still there (no `brew upgrade` yet): rewritten all the same, the next one deletes it
    const live = disk({ [entry.file]: Buffer.from(mac(CELLAR).content) }, [CELLAR]);
    expect(refreshAutostart(entry, { ...quiet, files: live.files })).toBe('rewritten');
  });

  it('another live Node runs this copy (npm run dev under nvm): kept, no back and forth', () => {
    // the launcher under Homebrew wrote it; a dev start under nvm leaves it
    const brew = disk({ [mac(OPT).file]: Buffer.from(mac(OPT).content) }, [OPT, NVM]);
    expect(refreshAutostart(mac(NVM), { ...quiet, files: brew.files })).toBe('kept');
    expect(brew.asked).toEqual([OPT]);
    // and the other way round
    const dev = disk({ [mac(NVM).file]: Buffer.from(mac(NVM).content) }, [OPT, NVM]);
    expect(refreshAutostart(mac(OPT), { ...quiet, files: dev.files })).toBe('kept');
    expect([...brew.writes, ...dev.writes]).toEqual([]);
    // the Node it names is gone (nvm uninstall): rewritten with this app's
    const gone = disk({ [mac(NVM).file]: Buffer.from(mac(NVM).content) }, [OPT]);
    expect(refreshAutostart(mac(OPT), { ...quiet, files: gone.files })).toBe('rewritten');
    expect(gone.held.get(mac(OPT).file)!.toString()).toBe(mac(OPT).content);
    // asked as a path, the plist's XML undone
    const amp = '/Users/a/R&D/node/bin/node';
    const odd = disk({ [mac(OPT).file]: Buffer.from(mac(amp).content) }, [amp]);
    expect(mac(amp).content).toContain('R&amp;D');
    expect(refreshAutostart(mac(OPT), { ...quiet, files: odd.files })).toBe('kept');
    expect(odd.asked).toEqual([amp]);
  });

  it('another copy’s entry or a hand-edited one: left alone', () => {
    const entry = mac(OPT);
    for (const other of [
      mac(CELLAR, '/Users/a/VerseOrchestrator/app').content, // a release folder beside the clone
      mac(CELLAR).content.replace('<true/>', '<false/>'),
      mac(CELLAR).content.replace(CELLAR, `${CELLAR}</string>\n    <string>--inspect`),
      '',
    ]) {
      const { writes, files } = disk({ [entry.file]: Buffer.from(other) });
      expect(refreshAutostart(entry, { ...quiet, files })).toBe('other');
      expect(writes).toEqual([]);
    }
  });

  it('the same rule for the .vbs (UTF-16) and the .desktop', () => {
    const win = (node: string) =>
      autostartEntry({
        platform: 'win32',
        home: 'C:\\Users\\Олена',
        node,
        script: 'C:\\vo\\server\\src\\standby.ts',
        root: 'C:\\vo',
      })!;
    const vbs = (e: { content: string }) => Buffer.from('\ufeff' + e.content, 'utf16le');
    const nvm4w = 'C:\\nvm4w\\nodejs\\node.exe';
    const entry = win('C:\\Program Files\\nodejs\\node.exe');
    const onWin = { log: () => {}, platform: 'win32' as const };
    const same = disk({ [entry.file]: vbs(entry) });
    expect(refreshAutostart(entry, { ...onWin, files: same.files })).toBe('same');
    const there = disk({ [entry.file]: vbs(win(nvm4w)) }, [nvm4w]);
    expect(refreshAutostart(entry, { ...onWin, files: there.files })).toBe('kept');
    const moved = disk({ [entry.file]: vbs(win(nvm4w)) });
    expect(refreshAutostart(entry, { ...onWin, files: moved.files })).toBe('rewritten');
    expect(moved.held.get(entry.file)).toEqual(vbs(entry));

    const linux = (node: string) =>
      autostartEntry({
        platform: 'linux',
        home: '/home/a',
        node,
        script: '/home/a/vo/server/src/standby.ts',
        root: '/home/a/vo',
      })!;
    const onLinux = { log: () => {}, platform: 'linux' as const };
    const desktop = linux('/usr/bin/node');
    const old = disk({ [desktop.file]: Buffer.from(linux('/opt/n/bin/node').content) });
    expect(refreshAutostart(desktop, { ...onLinux, files: old.files })).toBe('rewritten');
    expect(old.held.get(desktop.file)!.toString()).toBe(desktop.content);
    // the .desktop's quoting undone: a Node in a folder with a $ is asked for as it is
    const dollar = '/home/a/$n/bin/node';
    const quoted = disk({ [desktop.file]: Buffer.from(linux(dollar).content) }, [dollar]);
    expect(refreshAutostart(desktop, { ...onLinux, files: quoted.files })).toBe('kept');
    expect(quoted.asked).toEqual([dollar]);
  });

  it('a read or write error: reported, not thrown', () => {
    const entry = mac(OPT);
    const denied = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    const log: string[] = [];
    const files: AutostartFiles = {
      read: () => Buffer.from(mac(CELLAR).content),
      write: () => {
        throw denied;
      },
      exists: () => false,
    };
    const opts = { platform: 'darwin' as const, log: (m: string) => log.push(m) };
    expect(refreshAutostart(entry, { ...opts, files })).toBe('failed');
    const unreadable: AutostartFiles = {
      read: () => {
        throw denied;
      },
      write: () => {
        throw new Error('must not write');
      },
      exists: () => false,
    };
    expect(refreshAutostart(entry, { ...opts, files: unreadable })).toBe('failed');
    expect(log).toEqual([
      `autostart: ${entry.file} not rewritten: EACCES: permission denied`,
      `autostart: ${entry.file} not checked: EACCES: permission denied`,
    ]);
  });
});

describe('the entry is written whole (Mac check of 1.10.1)', () => {
  const FILE = '/Users/a/Library/LaunchAgents/ua.verseorchestrator.standby.plist';
  /** node:fs in memory: a write may stop part way, as a kill or a power cut would. */
  const memFs = (
    init: Record<string, string>,
    fail: { write?: boolean; rename?: boolean } = {},
  ) => {
    const held = new Map<string, Buffer>(Object.entries(init).map(([f, t]) => [f, Buffer.from(t)]));
    const calls: string[] = [];
    const wfs: WriteFs = {
      writeFileSync: (f, data) => {
        calls.push(`write ${f}`);
        if (fail.write) {
          held.set(f, data.subarray(0, 10)); // half a file
          throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
        }
        held.set(f, data);
      },
      renameSync: (from, to) => {
        calls.push(`rename ${from} ${to}`);
        if (fail.rename) throw Object.assign(new Error('EPERM: rename'), { code: 'EPERM' });
        held.set(to, held.get(from)!);
        held.delete(from);
      },
      rmSync: (f) => {
        calls.push(`rm ${f}`);
        held.delete(f);
      },
    };
    return { held, calls, wfs };
  };

  it('beside the file, then renamed over it: never truncated in place', () => {
    const { held, calls, wfs } = memFs({ [FILE]: 'old plist' });
    writeWhole(FILE, Buffer.from('new plist'), wfs);
    expect(calls).toEqual([`write ${FILE}.tmp`, `rename ${FILE}.tmp ${FILE}`]);
    expect([...held.keys()]).toEqual([FILE]);
    expect(held.get(FILE)!.toString()).toBe('new plist');
  });

  it('a write cut short or a rename refused: the old file stays, the temp goes', () => {
    for (const fail of [{ write: true }, { rename: true }]) {
      const { held, calls, wfs } = memFs({ [FILE]: 'old plist' }, fail);
      expect(() => writeWhole(FILE, Buffer.from('new plist, longer'), wfs)).toThrow(/ENOSPC|EPERM/);
      expect(held.get(FILE)!.toString()).toBe('old plist');
      expect(held.has(`${FILE}.tmp`)).toBe(false);
      expect(calls.at(-1)).toBe(`rm ${FILE}.tmp`);
    }
  });
});

describe('the Node a child starts with (Mac check of 1.10.1)', () => {
  it('a Node that is still there: itself, a release copy’s too', () => {
    const release = '/Users/a/VerseOrchestrator/app/node/bin/node';
    const realpath = links({ [CELLAR]: CELLAR, [release]: release, [OPT]: CELLAR });
    expect(liveNode(CELLAR, { platform: 'darwin', realpath })).toBe(CELLAR);
    expect(liveNode(release, { platform: 'darwin', realpath })).toBe(release);
  });

  it('a Cellar Node `brew upgrade` deleted: the formula’s link to the new one', () => {
    const newer = '/opt/homebrew/Cellar/node/26.0.0/bin/node';
    expect(
      liveNode(CELLAR, {
        platform: 'darwin',
        realpath: links({ [OPT]: newer, '/opt/homebrew/bin/node': newer }),
      }),
    ).toBe(OPT);
    // …and what the switch writes with it, the app having outlived the upgrade
    const after = links({ [OPT]: newer, '/opt/homebrew/bin/node': newer });
    expect(
      stableNode(liveNode(CELLAR, { platform: 'darwin', realpath: after }), {
        platform: 'darwin',
        realpath: after,
      }),
    ).toBe(OPT);
    // <prefix>/bin/node only when it is the same formula's
    expect(
      liveNode(CELLAR, {
        platform: 'darwin',
        realpath: links({ '/opt/homebrew/bin/node': newer }),
      }),
    ).toBe('/opt/homebrew/bin/node');
    const keg = '/usr/local/Cellar/node@24/24.9.0/bin/node';
    expect(
      liveNode(keg, {
        platform: 'darwin',
        realpath: links({ '/usr/local/bin/node': '/usr/local/Cellar/node/25.6.1/bin/node' }),
      }),
    ).toBe(keg);
  });

  it('nothing to take instead: process.execPath, the start fails as it did', () => {
    const realpath = links({});
    expect(liveNode(CELLAR, { platform: 'darwin', realpath })).toBe(CELLAR);
    const gone = '/Users/a/.nvm/versions/node/v24.9.0/bin/node';
    expect(liveNode(gone, { platform: 'darwin', realpath })).toBe(gone);
    expect(liveNode(CELLAR, { platform: 'linux', realpath })).toBe(CELLAR);
  });
});

describe('standby settings', () => {
  it('ports: unprivileged, not the app’s own', () => {
    expect(validStandbyPort(4747)).toBe(true);
    for (const bad of [80, 1023, 65536, 5173, 8787, 4747.5, '4747', null]) {
      expect(validStandbyPort(bad)).toBe(false);
    }
  });

  it('fills defaults and keeps valid values', () => {
    expect(sanitizeServerSettings({}).standby).toEqual({ port: 4747, idleMinutes: 15 });
    expect(sanitizeServerSettings({ standby: { port: 5000, idleMinutes: 30 } }).standby).toEqual({
      port: 5000,
      idleMinutes: 30,
    });
    expect(sanitizeServerSettings({ standby: { port: 8787, idleMinutes: 0 } }).standby).toEqual({
      port: 4747,
      idleMinutes: 15,
    });
  });
});
