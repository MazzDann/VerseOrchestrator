import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { autostartEntry, isAutostartOn, setAutostart } from './autostart';
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
