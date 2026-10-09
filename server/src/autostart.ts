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
 * This copy's entry naming a Node that is gone or in Homebrew's Cellar is rewritten at the app's
 * start (refreshAutostart); the switch writes it with the Node of the moment (currentEntry).
 */

export interface AutostartEntry {
  file: string;
  content: string;
  /** Windows Script Host reads UTF-16 LE with a BOM or the ANSI code page, not UTF-8 —
   *  a Cyrillic user folder in the path would break the .vbs otherwise. */
  utf16?: boolean;
  /** The Node a file names when it is this entry with only the Node different (this copy's,
   *  written by an older version or under another Node); null for another copy's or a hand-edited
   *  one. */
  nodeIn?: (text: string) => string | null;
}

interface EntryOptions {
  platform: NodeJS.Platform;
  home: string;
  appData?: string;
  node: string;
  script: string;
  root: string;
}

export function autostartEntry(opts: EntryOptions): AutostartEntry | null {
  const entry = render(opts);
  if (!entry) return null;
  // the Node is named once and no escaping touches \0: what is left are its two sides
  const [head, tail] = render({ ...opts, node: '\0' })!.content.split('\0');
  const nodeIn = (text: string): string | null => {
    if (text.length <= head.length + tail.length) return null;
    if (!text.startsWith(head) || !text.endsWith(tail)) return null;
    const node = unescapeNode(opts.platform, text.slice(head.length, text.length - tail.length));
    if (/[\r\n]/.test(node)) return null;
    // byte for byte what this code writes with that Node — else not this copy's entry
    return render({ ...opts, node })!.content === text ? node : null;
  };
  return { ...entry, nodeIn };
}

/** The Node as `render` spells it, back to a path: the plist's XML, the .desktop's quoting. */
function unescapeNode(platform: NodeJS.Platform, s: string): string {
  if (platform === 'darwin') return s.replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  if (platform === 'linux') return s.replace(/\\(["\\`$])/g, '$1');
  return s;
}

function render(opts: EntryOptions): AutostartEntry | null {
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

/** A Node in Homebrew's versioned folder: its formula's folder, the links that follow upgrades. */
function homebrewNode(
  execPath: string,
  platform: NodeJS.Platform,
): { formulaDir: string; links: string[] } | null {
  const m = platform === 'darwin' && /^(.+)\/Cellar\/([^/]+)\/[^/]+\/bin\/node$/.exec(execPath);
  if (!m) return null;
  const [, prefix, formula] = m;
  return {
    formulaDir: `${prefix}/Cellar/${formula}/`,
    links: [`${prefix}/opt/${formula}/bin/node`, `${prefix}/bin/node`],
  };
}

/** `realpath` of a path, or null when there is no such file (any more). */
const resolved = (realpath: (p: string) => string, p: string): string | null => {
  try {
    return realpath(p);
  } catch {
    return null;
  }
};

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
  const brew = homebrewNode(execPath, opts.platform);
  if (!brew) return execPath;
  const realpath: (p: string) => string = opts.realpath ?? fs.realpathSync;
  const real = resolved(realpath, execPath);
  if (real === null) return execPath; // no such file any more: nothing to compare with
  return brew.links.find((link) => resolved(realpath, link) === real) ?? execPath;
}

/**
 * The Node to start a child with (the app, a fresh waiter, the launcher). A waiter left running
 * outlives `brew upgrade`, which deletes the versioned folder its process.execPath names: every
 * start then failed with ENOENT (the app on a visit, a restart with new code) until the waiter
 * was restarted by hand (Mac check of 1.10.1). While that file is there it is taken as it is (a
 * release copy's app/node/bin/node always); once gone, the formula's link to its newer version.
 */
export function liveNode(
  execPath = process.execPath,
  opts: { platform?: NodeJS.Platform; realpath?: (p: string) => string } = {},
): string {
  const realpath: (p: string) => string = opts.realpath ?? fs.realpathSync;
  if (resolved(realpath, execPath) !== null) return execPath;
  const brew = homebrewNode(execPath, opts.platform ?? process.platform);
  if (!brew) return execPath; // nothing to take instead: the start fails as it did
  // <prefix>/bin/node may be another formula's (node beside a keg-only node@24): the same one only
  const upgraded = (link: string) => !!resolved(realpath, link)?.startsWith(brew.formulaDir);
  return brew.links.find(upgraded) ?? execPath;
}

export function currentEntry(root: string): AutostartEntry | null {
  return autostartEntry({
    platform: process.platform,
    home: os.homedir(),
    appData: process.env.APPDATA,
    // liveNode first: an app that outlived `brew upgrade` would write its deleted Cellar folder
    // when the switch is turned on (Mac check of 1.10.1)
    node: stableNode(liveNode(), { platform: process.platform }),
    script: path.join(root, 'server', 'src', 'standby.ts'),
    root,
  });
}

export function isAutostartOn(entry: AutostartEntry | null): boolean {
  return !!entry && fs.existsSync(entry.file);
}

/** The bytes of the entry's file: the .vbs as UTF-16 LE with a BOM, the others UTF-8. */
function entryBytes(entry: AutostartEntry): Buffer {
  return entry.utf16
    ? Buffer.from(String.fromCharCode(0xfeff) + entry.content, 'utf16le')
    : Buffer.from(entry.content);
}

/** The parts of node:fs a whole-file write takes (a test passes its own). */
export interface WriteFs {
  writeFileSync: (file: string, data: Buffer) => void;
  renameSync: (from: string, to: string) => void;
  rmSync: (file: string, opts: { force: boolean }) => void;
}

/**
 * New bytes for a file, all or nothing (Mac check of 1.10.1): written beside it as <file>.tmp,
 * then renamed over it. Written in place, a kill or a power cut mid-write left an empty plist
 * launchd can't start while the switch said on. On a failure the temp goes, the old file stays.
 * The switch (setAutostart) and the rewrite at the app's start (refreshAutostart) both use it.
 */
export function writeWhole(file: string, data: Buffer, wfs: WriteFs = fs): void {
  const tmp = `${file}.tmp`;
  try {
    wfs.writeFileSync(tmp, data);
    wfs.renameSync(tmp, file);
  } catch (err) {
    try {
      wfs.rmSync(tmp, { force: true });
    } catch {
      // the write's own error is the one to report
    }
    throw err;
  }
}

export function setAutostart(entry: AutostartEntry | null, on: boolean): void {
  if (!entry) throw new Error(N_('Автозапуск не підтримується на цій системі'));
  if (on) {
    fs.mkdirSync(path.dirname(entry.file), { recursive: true });
    writeWhole(entry.file, entryBytes(entry));
  } else {
    fs.rmSync(entry.file, { force: true });
  }
}

export interface AutostartFiles {
  /** The file's bytes; throws (ENOENT) when there is none. */
  read: (file: string) => Buffer;
  /** The file's new bytes, all or nothing (writeWhole). */
  write: (file: string, data: Buffer) => void;
  /** Is there such a file (the Node an entry names)? */
  exists: (file: string) => boolean;
}

const diskFiles: AutostartFiles = {
  read: (file) => fs.readFileSync(file),
  write: (file, data) => writeWhole(file, data),
  exists: (file) => fs.existsSync(file),
};

/**
 * The entry follows the Node this app would write now (Mac check of 1.10.1). Written only when the
 * switch is flipped, an entry from before 1.9.2 kept Homebrew's versioned folder: after the next
 * `brew upgrade` launchd could not start the waiter at login (exit 78) while the switch still
 * said on. Called at the app's start: no file — nothing (off stays off); this copy's entry naming
 * a Node that is gone, or (a Mac) one in Homebrew's Cellar — rewritten; naming another Node that
 * is there — kept: `npm run dev` under nvm and the launcher under Homebrew would otherwise take the
 * entry back and forth, start after start. Another copy's (a release folder beside a clone, a test
 * copy) or a hand-made one — left alone. The same rule on every system. Never throws: a failure
 * is logged.
 */
export function refreshAutostart(
  entry: AutostartEntry | null,
  opts: { log?: (m: string) => void; files?: AutostartFiles; platform?: NodeJS.Platform } = {},
): 'off' | 'same' | 'rewritten' | 'kept' | 'other' | 'failed' {
  if (!entry) return 'off';
  const log = opts.log ?? ((m: string) => console.log(m));
  const files = opts.files ?? diskFiles;
  let bytes: Buffer;
  try {
    bytes = files.read(entry.file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'off';
    log(`autostart: ${entry.file} not checked: ${(err as Error).message}`);
    return 'failed';
  }
  const want = entryBytes(entry);
  if (bytes.equals(want)) return 'same';
  const text = entry.utf16
    ? bytes.toString('utf16le').replace(/^\ufeff/, '')
    : bytes.toString('utf8');
  const was = entry.nodeIn?.(text) ?? null;
  if (was === null) return 'other';
  // only what 1.9.2 left behind: a Node gone, or one the next `brew upgrade` deletes
  const cellar = homebrewNode(was, opts.platform ?? process.platform) !== null;
  if (!cellar && files.exists(was)) return 'kept';
  try {
    files.write(entry.file, want);
  } catch (err) {
    log(`autostart: ${entry.file} not rewritten: ${(err as Error).message}`);
    return 'failed';
  }
  log(`autostart: ${entry.file} started ${was}, now ${entry.nodeIn?.(entry.content)}`);
  return 'rewritten';
}
