import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Start the standby waiter (standby.ts) with the computer (1.4.2) — one file per platform,
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

export function currentEntry(root: string): AutostartEntry | null {
  return autostartEntry({
    platform: process.platform,
    home: os.homedir(),
    appData: process.env.APPDATA,
    node: process.execPath,
    script: path.join(root, 'server', 'src', 'standby.ts'),
    root,
  });
}

export function isAutostartOn(entry: AutostartEntry | null): boolean {
  return !!entry && fs.existsSync(entry.file);
}

export function setAutostart(entry: AutostartEntry | null, on: boolean): void {
  if (!entry) throw new Error('Автозапуск не підтримується на цій системі');
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
