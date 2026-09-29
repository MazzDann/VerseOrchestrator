import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { appWindowCommand, createShortcut, linuxDesktopEntry, macCommand } from './shortcut';

const url = 'http://localhost:4747/';
const winEnv = {
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\Operator\\AppData\\Local',
};

describe('app window and desktop shortcut (0.7.5)', () => {
  it('opens the control window in Chrome, else Edge, as an app window', () => {
    const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    expect(appWindowCommand('win32', url, (p) => p === chrome || p === edge, winEnv)).toEqual([
      chrome,
      [`--app=${url}`],
    ]);
    expect(appWindowCommand('win32', url, (p) => p === edge, winEnv)).toEqual([
      edge,
      [`--app=${url}`],
    ]);
    expect(appWindowCommand('win32', url, () => false, winEnv)).toBeNull(); // → the default browser
    const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    expect(appWindowCommand('darwin', url, (p) => p === mac)).toEqual([mac, [`--app=${url}`]]);
    const env = { PATH: '/usr/local/bin:/usr/bin', DISPLAY: ':0' };
    expect(appWindowCommand('linux', url, (p) => p === '/usr/bin/chromium', env)).toEqual([
      '/usr/bin/chromium',
      [`--app=${url}`],
    ]);
    expect(appWindowCommand('linux', url, () => true, { PATH: '/usr/bin' })).toBeNull(); // no screen
  });

  it('writes the macOS and Linux shortcuts to start the app that way', () => {
    expect(macCommand('/Users/op/VO')).toContain('exec sh "/Users/op/VO/start.sh" --app');
    const entry = linuxDesktopEntry('/home/op/Verse Orchestrator');
    expect(entry).toContain('Exec="/home/op/Verse Orchestrator/start.sh" --app');
    expect(entry).toContain('Icon=/home/op/Verse Orchestrator/web/public/icon.svg');
    expect(entry).toContain('Terminal=true'); // the launcher's window: closing it stops the app
  });

  const dirs: string[] = [];
  afterEach(() => {
    delete process.env.VO_DESKTOP_DIR;
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it.runIf(process.platform === 'win32')(
    'makes a Windows shortcut: start.cmd --app, in the app folder, with its icon',
    () => {
      const desktop = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-desktop-'));
      dirs.push(desktop);
      process.env.VO_DESKTOP_DIR = desktop;
      const root = 'C:\\VerseOrchestrator тест';
      const [lnk] = createShortcut(root, 'win32');
      expect(lnk).toBe(path.join(desktop, 'VerseOrchestrator.lnk'));
      const read = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          '[Console]::OutputEncoding = [Text.Encoding]::UTF8; $s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:VO_LNK); "$($s.TargetPath)|$($s.Arguments)|$($s.WorkingDirectory)|$($s.IconLocation)"',
        ],
        { encoding: 'utf8', env: { ...process.env, VO_LNK: lnk }, windowsHide: true },
      ).trim();
      expect(read.split('|')).toEqual([
        `${root}\\start.cmd`,
        '--app',
        root,
        `${root}\\web\\public\\icon.ico,0`,
      ]);
    },
  );
});
