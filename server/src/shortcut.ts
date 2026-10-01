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
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tr } from './lang.ts';

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

/** The desktop entry's own Ukrainian line (Comment[uk]): the system picks the one in its language. */
const UK_COMMENT = 'Читання й показ тексту на кількох екранах'; // i18n-ignore: the .desktop file's own translation

/** Linux: a desktop entry (desktop + applications menu). */
export const linuxDesktopEntry = (root: string) => {
  const q = (s: string) => `"${s.replace(/(["\\`$])/g, '\\$1')}"`;
  return `[Desktop Entry]
Type=Application
Name=VerseOrchestrator
Comment=Reading and showing text on several screens
Comment[uk]=${UK_COMMENT}
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

/** The control window's titles (Control.tsx sets them, 1.1.0): what the system looks for. */
export const CONTROL_TITLES = (['uk', 'en'] as const).map(
  (lang) => `VerseOrchestrator — ${tr('керування', undefined, lang)}`,
);

/** What a command left behind — spawnSync's shape, the part we read. */
export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** it didn't start, or ran past its time (`code` ETIMEDOUT) */
  error?: NodeJS.ErrnoException;
}

/** Runs a command and waits, at most `timeout` ms. Tests pass their own: nothing spawns there. */
export type Runner = (cmd: string, args: string[], timeout: number) => RunResult;

const spawnRunner: Runner = (cmd, args, timeout) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout });
  return {
    status: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    error: r.error as NodeJS.ErrnoException | undefined,
  };
};

/** A browser on a Mac that AppleScript can ask for its windows and tabs. */
export interface MacBrowser {
  /** the bundle id AppleScript addresses (`application id`) */
  id: string;
  /** its main process (pgrep) — and its name in System Settings → Automation */
  name: string;
  /** whose scripting terms: Chrome's (Edge, Brave and Chromium share them), Arc's, Safari's */
  terms: 'chromium' | 'arc' | 'safari';
}

/** In the order they are asked: Chrome first, as for the app window (appBrowserCandidates). */
export const MAC_BROWSERS: readonly MacBrowser[] = [
  { id: 'com.google.Chrome', name: 'Google Chrome', terms: 'chromium' },
  { id: 'com.microsoft.edgemac', name: 'Microsoft Edge', terms: 'chromium' },
  { id: 'com.brave.Browser', name: 'Brave Browser', terms: 'chromium' },
  { id: 'org.chromium.Chromium', name: 'Chromium', terms: 'chromium' },
  { id: 'company.thebrowser.Browser', name: 'Arc', terms: 'arc' },
  { id: 'com.apple.Safari', name: 'Safari', terms: 'safari' },
];

/** `s` as an AppleScript string literal. */
export const appleString = (s: string): string => `"${s.replace(/[\\"]/g, '\\$&')}"`;

/**
 * The AppleScript that finds a tab whose title begins with one of `titles` in `b` and brings it
 * forward: that tab made the active one, its window out of the Dock, in front, the browser
 * activated. Prints «yes» when it did, «no» when no tab matched. An app window (Chrome's
 * `--app`, the desktop shortcut) is a window with one tab. A browser that isn't running is
 * left alone — a `tell` would start it.
 */
export function macRaiseScript(b: MacBrowser, titles: readonly string[] = CONTROL_TITLES): string {
  const app = `application id ${appleString(b.id)}`;
  const title = b.terms === 'safari' ? 'name' : 'title';
  const match = titles.map((t) => `n starts with ${appleString(t)}`).join(' or ');
  const show = {
    chromium: [
      'if minimized of w then set minimized of w to false',
      'set active tab index of w to hit',
    ],
    arc: ['tell tab hit of w to select'],
    safari: [
      'if miniaturized of w then set miniaturized of w to false',
      'set current tab of w to tab hit of w',
    ],
  }[b.terms];
  return [
    `if ${app} is running then`,
    `  tell ${app}`,
    '    set ws to windows',
    '    repeat with k from 1 to count of ws',
    '      set w to item k of ws',
    '      set hit to 0',
    '      try',
    '        repeat with i from 1 to count of tabs of w',
    `          set n to ${title} of tab i of w`,
    `          if ${match} then`,
    '            set hit to i',
    '            exit repeat',
    '          end if',
    '        end repeat',
    '      end try',
    '      if hit > 0 then',
    ...show.map((line) => `        ${line}`),
    '        set index of w to 1',
    '        activate',
    '        return "yes"',
    '      end if',
    '    end repeat',
    '  end tell',
    'end if',
    'return "no"',
  ].join('\n');
}

/** The browsers of MAC_BROWSERS running for this user (pgrep: no Apple Events, no prompt). */
export function runningMacBrowsers(
  run: Runner = spawnRunner,
  uid: number = process.getuid?.() ?? 0,
): MacBrowser[] {
  const names = MAC_BROWSERS.map((b) => b.name).join('|');
  const r = run('/usr/bin/pgrep', ['-x', '-l', '-U', String(uid), `^(${names})$`], 2000);
  // «12345 Google Chrome» per process; none (status 1) or no pgrep → nothing
  const found = new Set(r.stdout.split('\n').map((l) => l.trim().replace(/^\d+\s+/, '')));
  return MAC_BROWSERS.filter((b) => found.has(b.name));
}

/** Why an osascript run brought nothing forward; null when it ran (the window isn't there). */
export type RaiseFailure = 'denied' | 'timeout' | 'not-running' | 'error';

export function osascriptFailure(r: RunResult): RaiseFailure | null {
  if (r.error) return r.error.code === 'ETIMEDOUT' ? 'timeout' : 'error';
  if (r.status === 0) return null;
  // the user said no to «“Terminal” wants access to control …», or turned it off since. The
  // number is what every system language prints: a Mac in Ukrainian words the refusal in
  // Ukrainian, and the English words alone would miss it.
  if (/\(-1743\)|not authori[sz]ed to send apple events/i.test(r.stderr)) return 'denied';
  if (/\(-1712\)/.test(r.stderr)) return 'timeout'; // AppleEvent timed out
  if (/\(-600\)/.test(r.stderr)) return 'not-running'; // closed since pgrep saw it
  return 'error';
}

export interface RaiseResult {
  raised: boolean;
  /** the browser that showed it (macOS) */
  browser?: string;
  /** browsers macOS doesn't let the start window's app control (Privacy & Security → Automation) */
  denied: string[];
  /** a browser didn't answer in time — macOS may still be asking for permission */
  timedOut: boolean;
}

/**
 * How long one browser may take: the first time, macOS asks «“Terminal” wants access to
 * control “Google Chrome”» (or names the app the start window runs in) and osascript waits for
 * the answer — time to read it and click.
 */
export const MAC_RAISE_TIMEOUT_MS = 30_000;

/**
 * Bring the open control window forward instead of opening a second one — allowed for a start
 * the user just clicked. Windows (1.1.0): WScript.Shell's AppActivate finds a window whose
 * title begins with one of CONTROL_TITLES (a browser adds its own name after it). macOS: each
 * running browser in turn, by AppleScript (macRaiseScript), until one has it. Elsewhere
 * nothing.
 */
export function raiseControlWindow(
  platform: NodeJS.Platform = process.platform,
  run: Runner = spawnRunner,
): RaiseResult {
  const result: RaiseResult = { raised: false, denied: [], timedOut: false };
  if (platform === 'win32') {
    const tries = CONTROL_TITLES.map((t) => `$s.AppActivate('${t}')`).join(' -or ');
    const r = run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$s = New-Object -ComObject WScript.Shell; if (${tries}) { 'yes' }`,
      ],
      5000,
    );
    return { ...result, raised: r.stdout.trim() === 'yes' };
  }
  if (platform !== 'darwin') return result;
  for (const b of runningMacBrowsers(run)) {
    const r = run('/usr/bin/osascript', ['-e', macRaiseScript(b)], MAC_RAISE_TIMEOUT_MS);
    const why = osascriptFailure(r);
    if (!why && r.stdout.trim() === 'yes') return { ...result, raised: true, browser: b.name };
    if (why === 'denied') result.denied.push(b.name);
    if (why === 'timeout') {
      result.timedOut = true;
      break; // nobody answers: no second wait for the next browser
    }
  }
  return result;
}

/**
 * The start window runs in Terminal (start.command and the desktop shortcut open there): then
 * macOS asks about Terminal, and Automation lists it under that name. Elsewhere (iTerm2, an
 * editor's terminal, tmux) which app macOS asks about depends on how that app starts the
 * shell, so the line describes it instead of naming a wrong one.
 */
const inTerminal = (env: NodeJS.ProcessEnv) => env.TERM_PROGRAM === 'Apple_Terminal';

/** What raiseControlWindow's result means for the user (one line each). */
export function raiseReport(r: RaiseResult, env: NodeJS.ProcessEnv = process.env): string[] {
  if (r.raised) return [tr('Вікно керування вже відкрите — перемикаю на нього.')];
  return [
    tr('Вікно керування вже відкрите — знайдіть його серед вікон браузера.'),
    ...r.denied.map((browser) =>
      inTerminal(env)
        ? tr(
            'macOS не дозволяє Терміналу керувати {browser}. Щоб дозволити, відкрийте Системні параметри → Приватність і безпека → Автоматизація → Термінал і ввімкніть {browser}.',
            { browser },
          )
        : tr(
            'macOS не дозволяє програмі, у якій відкрито вікно запуску, керувати {browser}. Щоб дозволити, відкрийте Системні параметри → Приватність і безпека → Автоматизація, знайдіть цю програму й увімкніть під нею {browser}.',
            { browser },
          ),
    ),
    ...(r.timedOut
      ? [tr('Якщо macOS питає дозволу керувати браузером, дозвольте й запустіть ще раз.')]
      : []),
  ];
}

/**
 * What the launcher says when it finds a control window open already (one line each): the
 * window brought forward, or where to look and why it didn't come, then how to open another.
 * The launcher only prints these — the decision lives here, where a test can reach it.
 */
export function alreadyOpenLines(
  platform: NodeJS.Platform = process.platform,
  run: Runner = spawnRunner,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return [
    ...raiseReport(raiseControlWindow(platform, run), env),
    tr('Щоб відкрити ще одне, запустіть з --new-window.'),
  ];
}
