import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Marks a message for the dictionary (the page shows it translated). Local, not from @vo/shared:
 * this module runs under plain Node too (the launcher, the waiter), which can't load the package.
 */
const N_ = (uk: string): string => uk;

/**
 * Start the standby waiter (standby.ts) with the computer (0.5.2) — one file per platform,
 * written when «Запускати застосунок за адресою» is switched on, removed when it's off:
 *   - Windows: a tiny .vbs in the user's Startup folder — it starts Node HIDDEN (a
 *     console program run from Startup/Task Scheduler would show a console window);
 *   - macOS: a LaunchAgent (~/Library/LaunchAgents), loaded at the next login;
 *   - Linux: an XDG autostart entry (~/.config/autostart).
 * The waiter finds the project and its data from its own path, so nothing else is stored.
 */

export interface AutostartEntry {
  file: string;
  content: string;
  /** Windows Script Host reads UTF-16 LE with a BOM or the ANSI code page, not UTF-8 —
   *  a Cyrillic user folder in the path would break the .vbs otherwise. */
  utf16?: boolean;
}

export function autostartEntry(opts: {
  platform: NodeJS.Platform;
  home: string;
  appData?: string;
  node: string;
  script: string;
  root: string;
}): AutostartEntry | null {
  const args = ['--disable-warning=ExperimentalWarning', opts.script];
  if (opts.platform === 'win32') {
    const startup = path.join(
      opts.appData ?? path.join(opts.home, 'AppData', 'Roaming'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup',
    );
    // VBScript string: "" is a literal quote. Window style 0 = hidden; False = don't wait.
    const q = (s: string) => `""${s}""`;
    const cmd = [q(opts.node), args[0], q(opts.script)].join(' ');
    return {
      file: path.join(startup, 'VerseOrchestrator-standby.vbs'),
      content: [
        "' VerseOrchestrator standby waiter - created by the app (Settings > App).",
        "' Delete this file to stop it from starting with Windows.",
        `CreateObject("WScript.Shell").Run "${cmd}", 0, False`,
        '',
      ].join('\r\n'),
      utf16: true,
    };
  }
  if (opts.platform === 'darwin') {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return {
      file: path.join(opts.home, 'Library', 'LaunchAgents', 'ua.verseorchestrator.standby.plist'),
      content: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>ua.verseorchestrator.standby</string>
  <key>ProgramArguments</key>
  <array>
${[opts.node, ...args].map((a) => `    <string>${esc(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key><string>${esc(opts.root)}</string>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
`,
    };
  }
  if (opts.platform === 'linux') {
    const q = (s: string) => `"${s.replace(/(["\\`$])/g, '\\$1')}"`;
    return {
      file: path.join(opts.home, '.config', 'autostart', 'verseorchestrator-standby.desktop'),
      content: `[Desktop Entry]
Type=Application
Name=VerseOrchestrator (standby)
Exec=${[opts.node, ...args].map(q).join(' ')}
Path=${opts.root}
X-GNOME-Autostart-enabled=true
`,
    };
  }
  return null;
}

/**
 * The Node the entry starts. Node reports its real path, and Homebrew's is the versioned folder
 * (/opt/homebrew/Cellar/node/25.6.1/bin/node) that the next `brew upgrade` deletes: the
 * LaunchAgent then started nothing at login while the switch still said on (Mac check of
 * 1.9.0). Homebrew's links follow upgrades — the formula's own (<prefix>/opt/node/bin/node,
 * there for a keg-only node@24 too), then <prefix>/bin/node — one is taken only when it leads to
 * this very file. Anything else (a release copy's app/node/bin/node, nvm, the installer) stays.
 */
export function stableNode(
  execPath: string,
  opts: { platform: NodeJS.Platform; realpath?: (p: string) => string },
): string {
  const m =
    opts.platform === 'darwin' && /^(.+)\/Cellar\/([^/]+)\/[^/]+\/bin\/node$/.exec(execPath);
  if (!m) return execPath;
  const [, prefix, formula] = m;
  const realpath: (p: string) => string = opts.realpath ?? fs.realpathSync;
  const same = (link: string) => {
    try {
      return realpath(link) === realpath(execPath);
    } catch {
      return false; // no such link (or no such file any more)
    }
  };
  return [`${prefix}/opt/${formula}/bin/node`, `${prefix}/bin/node`].find(same) ?? execPath;
}

export function currentEntry(root: string): AutostartEntry | null {
  return autostartEntry({
    platform: process.platform,
    home: os.homedir(),
    appData: process.env.APPDATA,
    node: stableNode(process.execPath, { platform: process.platform }),
    script: path.join(root, 'server', 'src', 'standby.ts'),
    root,
  });
}

export function isAutostartOn(entry: AutostartEntry | null): boolean {
  return !!entry && fs.existsSync(entry.file);
}

export function setAutostart(entry: AutostartEntry | null, on: boolean): void {
  if (!entry) throw new Error(N_('Автозапуск не підтримується на цій системі'));
  if (on) {
    fs.mkdirSync(path.dirname(entry.file), { recursive: true });
    if (entry.utf16) {
      fs.writeFileSync(entry.file, String.fromCharCode(0xfeff) + entry.content, 'utf16le');
    } else {
      fs.writeFileSync(entry.file, entry.content);
    }
  } else {
    fs.rmSync(entry.file, { force: true });
  }
}
