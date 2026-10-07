import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { autostartEntry, isAutostartOn, setAutostart, stableNode } from './autostart';
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

describe('the Node autostart starts (Mac check of 1.9.0)', () => {
  const CELLAR = '/opt/homebrew/Cellar/node/25.6.1/bin/node';
  /** A file system of links: each known path → the file it leads to; anything else is missing. */
  const links =
    (map: Record<string, string>) =>
    (p: string): string => {
      if (p in map) return map[p];
      throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
    };

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
