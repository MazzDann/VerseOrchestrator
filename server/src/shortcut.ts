/**
 * A desktop shortcut and the control window as an app window (0.7.5). The shortcut starts the
 * app with `--app`: the launcher then opens the control window in Chrome or Edge as a window of
 * its own — no tabs, no address bar — or in the default browser when neither is there.
 *   Windows: VerseOrchestrator.lnk on the desktop (made by PowerShell's WScript.Shell),
 *   macOS: VerseOrchestrator.command on the desktop (a Finder alias needs the Finder),
 *   Linux: verseorchestrator.desktop on the desktop and in the applications menu.
 *
 * Only node: imports — the launcher runs before `npm ci` (like standby.ts).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Chrome first (the user's choice for tests and work), then Edge. */
export function appBrowserCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir(),
): string[] {
  if (platform === 'win32') {
    const pf = env.ProgramFiles ?? 'C:\\Program Files';
    const pf86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const local = env.LOCALAPPDATA ?? path.win32.join(home, 'AppData', 'Local');
    return [
      path.win32.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.win32.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.win32.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.win32.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.win32.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
  }
  if (platform === 'darwin') {
    const apps = ['/Applications', path.posix.join(home, 'Applications')];
    return apps.flatMap((a) => [
      `${a}/Google Chrome.app/Contents/MacOS/Google Chrome`,
      `${a}/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`,
    ]);
  }
  const names = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'microsoft-edge',
  ];
  const dirs = (env.PATH ?? '').split(':').filter(Boolean);
  return names.flatMap((n) => dirs.map((d) => path.posix.join(d, n)));
}

/** How to open `url` as an app window here, or null (then: the default browser). */
export function appWindowCommand(
  platform: NodeJS.Platform,
  url: string,
  exists: (p: string) => boolean = fs.existsSync,
  env: NodeJS.ProcessEnv = process.env,
): [string, string[]] | null {
  if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) return null;
  const browser = appBrowserCandidates(platform, env).find((p) => exists(p));
  return browser ? [browser, [`--app=${url}`]] : null;
}

/** The desktop folder (Windows asks the shell: it may be moved, e.g. into OneDrive). */
export function desktopDir(platform: NodeJS.Platform = process.platform): string {
  if (process.env.VO_DESKTOP_DIR) return process.env.VO_DESKTOP_DIR; // tests
  if (platform === 'win32') {
    try {
      return execFileSync(
        'powershell',
        ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"],
        { encoding: 'utf8', windowsHide: true },
      ).trim();
    } catch {
      return path.join(os.homedir(), 'Desktop');
    }
  }
  if (platform === 'linux') {
    try {
      const d = execFileSync('xdg-user-dir', ['DESKTOP'], { encoding: 'utf8' }).trim();
      if (d) return d;
    } catch {
      /* no xdg-user-dirs */
    }
  }
  return path.join(os.homedir(), 'Desktop');
}

/** macOS: a double-clickable script on the desktop that starts the app as an app window. */
export const macCommand = (root: string) =>
  `#!/bin/sh\n# VerseOrchestrator — made by «start --shortcut» (0.7.5); delete it to remove the shortcut.\nexec sh "${root.replace(/(["\\`$])/g, '\\$1')}/start.sh" --app\n`;

/** Linux: a desktop entry (desktop + applications menu). */
export const linuxDesktopEntry = (root: string) => {
  const q = (s: string) => `"${s.replace(/(["\\`$])/g, '\\$1')}"`;
  return `[Desktop Entry]
Type=Application
Name=VerseOrchestrator
Comment=Читання й показ тексту на кількох екранах
Exec=${q(path.posix.join(root, 'start.sh'))} --app
Path=${root}
Icon=${path.posix.join(root, 'web', 'public', 'icon.svg')}
Terminal=true
Categories=Office;
`;
};

/** Make the shortcut; returns the file(s) made. */
export function createShortcut(
  root: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const desktop = desktopDir(platform);
  fs.mkdirSync(desktop, { recursive: true });
  if (platform === 'win32') {
    const file = path.join(desktop, 'VerseOrchestrator.lnk');
    // the paths go in through the environment: no quoting of Cyrillic or spaces in a command
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:VO_LNK); ' +
          '$s.TargetPath = $env:VO_TARGET; $s.Arguments = "--app"; ' +
          '$s.WorkingDirectory = $env:VO_ROOT; $s.IconLocation = $env:VO_ICON; ' +
          '$s.Description = "VerseOrchestrator"; $s.Save()',
      ],
      {
        windowsHide: true,
        env: {
          ...process.env,
          VO_LNK: file,
          VO_TARGET: path.join(root, 'start.cmd'),
          VO_ROOT: root,
          VO_ICON: path.join(root, 'web', 'public', 'icon.ico'),
        },
      },
    );
    return [file];
  }
  if (platform === 'darwin') {
    const file = path.join(desktop, 'VerseOrchestrator.command');
    fs.writeFileSync(file, macCommand(root), { mode: 0o755 });
    return [file];
  }
  const entry = linuxDesktopEntry(root);
  const files = [
    path.join(desktop, 'verseorchestrator.desktop'),
    path.join(os.homedir(), '.local', 'share', 'applications', 'verseorchestrator.desktop'),
  ];
  for (const f of files) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, entry, { mode: 0o755 });
  }
  return files;
}
