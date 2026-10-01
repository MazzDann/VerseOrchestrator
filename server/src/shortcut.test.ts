import { execFileSync, spawnSync, type spawnSync as SpawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLang } from './lang';

/**
 * No test here may run osascript, pgrep, lsof, open or PowerShell for real: AppleScript that
 * reaches a browser puts macOS's «“…” wants access to control “Google Chrome”» on the screen of
 * whoever runs the tests (a mutation check that dropped the fake runner did, 2026-10-01),
 * `open -a` brings an app forward there, and lsof reads that machine's connections. Such a test
 * fails here instead.
 */
vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<{ spawnSync: typeof SpawnSync }>();
  return {
    ...real,
    spawnSync: (...args: Parameters<typeof SpawnSync>) => {
      if (/(^|[/\\])(osascript|pgrep|lsof|open|powershell(\.exe)?)$/i.test(args[0]))
        throw new Error(`a test ran ${args[0]}`);
      return real.spawnSync(...args);
    },
  };
});
import {
  alreadyOpenLines,
  appleString,
  appWindowCommand,
  CONTROL_TITLES,
  createShortcut,
  GECKO_ENGINE,
  geckoAppsConnectedTo,
  linuxDesktopEntry,
  MAC_BROWSERS,
  MAC_RAISE_TIMEOUT_MS,
  macBrowsersFor,
  macCommand,
  macRaiseScript,
  osascriptFailure,
  raiseControlWindow,
  raiseReport,
  readControlWindows,
  runningMacBrowsers,
  type RunResult,
} from './shortcut';

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

/** A runner that answers from a script of replies and records what was asked: nothing spawns. */
function fakeRunner(reply: (cmd: string, args: string[]) => Partial<RunResult>) {
  const calls: { cmd: string; args: string[]; timeout: number }[] = [];
  const run = (cmd: string, args: string[], timeout: number): RunResult => {
    calls.push({ cmd, args, timeout });
    return { status: 0, stdout: '', stderr: '', ...reply(cmd, args) };
  };
  return { run, calls };
}

const browser = (name: string) => MAC_BROWSERS.find((b) => b.name === name)!;
/**
 * pgrep's answer for the processes running here that match its pattern, osascript's per browser
 * (by the bundle id it addresses).
 */
function mac(running: string[], answers: Record<string, Partial<RunResult>> = {}) {
  return fakeRunner((cmd, args) => {
    if (cmd === '/usr/bin/pgrep') {
      const hits = running.filter((n) => new RegExp(args.at(-1)!).test(n));
      return hits.length
        ? { stdout: hits.map((n, i) => `${100 + i} ${n}`).join('\n') + '\n' }
        : { status: 1 };
    }
    const id = MAC_BROWSERS.find((b) => args[1].includes(`application id "${b.id}"`))!.id;
    return answers[id] ?? { stdout: 'no\n' };
  });
}
/** The waiter's port: the launcher looks for browsers connected to it. */
const PORT = 4747;
const FIREFOX_APP = '/Applications/Firefox.app';
/** The files a process has loaded (lsof's «txt»), as on this Mac (2026-10-01). */
const FIREFOX_PROC = [
  `${FIREFOX_APP}/Contents/MacOS/firefox`,
  `${FIREFOX_APP}${GECKO_ENGINE}`,
  '/usr/lib/dyld',
];
const FIREFOX_SOCKET_PROC = [
  `${FIREFOX_APP}/Contents/MacOS/plugin-container.app/Contents/MacOS/plugin-container`,
  `${FIREFOX_APP}${GECKO_ENGINE}`,
];
const ZEN_PROC = [
  '/Applications/Zen.app/Contents/MacOS/zen',
  `/Applications/Zen.app${GECKO_ENGINE}`,
];
const DEV_EDITION_PROC = [
  '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
  `/Applications/Firefox Developer Edition.app${GECKO_ENGINE}`,
];
const CHROME_FRAMEWORK =
  '/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/154.0.0.0';
const CHROME_HELPER_PROC = [
  `${CHROME_FRAMEWORK}/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper`,
  `${CHROME_FRAMEWORK}/Google Chrome Framework`,
];
/**
 * A Mac where these processes (pid → loaded files) hold a page of the app open at PORT: lsof's
 * connections (the waiter's own ends too, as pid 1; over IPv6 when said), lsof's files of the
 * pids asked, `open`'s answer by the app it is given.
 */
function gecko(
  procs: Record<number, string[]>,
  answers: Record<string, Partial<RunResult>> = {},
  ipv6 = false,
) {
  const pids = Object.keys(procs);
  const at = (port: number) => (ipv6 ? `[::1]:${port}` : `127.0.0.1:${port}`);
  return fakeRunner((cmd, args) => {
    if (cmd === '/usr/sbin/lsof' && args.includes('-sTCP:ESTABLISHED')) {
      if (!pids.length) return { status: 1 };
      const waiter = pids.map((_, i) => `f${20 + i}\nn${at(PORT)}->${at(53000 + i)}`);
      const browsers = pids.map((p, i) => `p${p}\nf31\nn${at(53000 + i)}->${at(PORT)}`);
      return { stdout: ['p1', ...waiter, ...browsers].join('\n') + '\n' };
    }
    if (cmd === '/usr/sbin/lsof') {
      const asked = args[args.indexOf('-p') + 1].split(',');
      const out = asked.flatMap((p) => [
        `p${p}`,
        ...(procs[Number(p)] ?? []).map((f) => `ftxt\nn${f}`),
      ]);
      return { stdout: out.join('\n') + '\n' };
    }
    if (cmd === '/usr/bin/open') return answers[args[1]] ?? {};
    throw new Error(`unexpected ${cmd}`);
  });
}
const denied = {
  status: 1,
  stderr: '24:31: execution error: Not authorized to send Apple events to Google Chrome. (-1743)\n',
};
/** The same refusal as osascript prints it on a Mac in Ukrainian (checked here, 2026-10-01). */
const deniedUk = {
  status: 1,
  stderr: '24:31: execution error: Не дозволено надсилати події Apple до Google Chrome. (-1743)\n',
};

describe('the open control window brought forward on a Mac (AppleScript)', () => {
  it('runs nothing for real in these tests (checked with commands that reach no browser)', () => {
    expect(() => runningMacBrowsers()).toThrow('a test ran /usr/bin/pgrep');
    expect(() => raiseControlWindow('win32')).toThrow('a test ran powershell.exe');
    // Firefox: lsof comes first and is refused, so `open` is never reached here (port 1: a
    // mock that missed lsof would find nothing connected there) …
    expect(() => raiseControlWindow('darwin', undefined, 'firefox', 1)).toThrow(
      'a test ran /usr/sbin/lsof',
    );
    // … and `open` itself is refused (by its name: this path doesn't exist, so a mock that
    // missed it would only fail to start it)
    const nowhere = path.join(os.tmpdir(), 'vo-no-such-dir', 'open');
    expect(() => spawnSync(nowhere, ['-a', FIREFOX_APP])).toThrow(`a test ran ${nowhere}`);
  });

  it('asks Chrome first, then Edge, Brave, Chromium, Arc, Safari', () => {
    expect(MAC_BROWSERS.map((b) => b.id)).toEqual([
      'com.google.Chrome',
      'com.microsoft.edgemac',
      'com.brave.Browser',
      'org.chromium.Chromium',
      'company.thebrowser.Browser',
      'com.apple.Safari',
    ]);
  });

  it('writes AppleScript string literals', () => {
    expect(appleString('VerseOrchestrator — керування')).toBe('"VerseOrchestrator — керування"');
    expect(appleString('a "b" \\ c')).toBe('"a \\"b\\" \\\\ c"');
    const script = macRaiseScript(browser('Google Chrome'), ['say "hi"\\']);
    expect(script).toContain('if n starts with "say \\"hi\\"\\\\" then');
  });

  it('looks for both titles in every tab and leaves a closed browser closed', () => {
    for (const b of MAC_BROWSERS) {
      const script = macRaiseScript(b);
      const lines = script.split('\n');
      // the `is running` check comes first: a `tell` to a closed browser would start it
      expect(lines[0]).toBe(`if application id "${b.id}" is running then`);
      expect(lines[1]).toBe(`  tell application id "${b.id}"`);
      expect(script).toContain(
        `if n starts with "${CONTROL_TITLES[0]}" or n starts with "${CONTROL_TITLES[1]}" then`,
      );
      expect(CONTROL_TITLES).toEqual([
        'VerseOrchestrator — керування',
        'VerseOrchestrator — control',
      ]);
      expect(script).toContain('repeat with i from 1 to count of tabs of w');
      expect(script).toMatch(/set index of w to 1\n\s+activate\n\s+return "yes"/);
      expect(lines.at(-1)).toBe('return "no"');
    }
  });

  it("speaks each browser's own terms", () => {
    for (const name of ['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Chromium']) {
      const script = macRaiseScript(browser(name));
      expect(script).toContain('set n to title of tab i of w');
      expect(script).toContain('set active tab index of w to hit');
      expect(script).toContain('if minimized of w then set minimized of w to false');
    }
    const arc = macRaiseScript(browser('Arc'));
    expect(arc).toContain('set n to title of tab i of w');
    expect(arc).toContain('tell tab hit of w to select');
    expect(arc).not.toContain('active tab index');
    expect(arc).not.toContain('minimized');
    const safari = macRaiseScript(browser('Safari'));
    expect(safari).toContain('set n to name of tab i of w');
    expect(safari).toContain('set current tab of w to tab hit of w');
    expect(safari).toContain('if miniaturized of w then set miniaturized of w to false');
    expect(safari).not.toContain('active tab index');
  });

  it('finds the running browsers with pgrep, in its own order', () => {
    const { run, calls } = mac(['Safari', 'Brave Browser', 'Google Chrome']);
    expect(runningMacBrowsers(run, 501).map((b) => b.name)).toEqual([
      'Google Chrome',
      'Brave Browser',
      'Safari',
    ]);
    expect(calls).toEqual([
      {
        cmd: '/usr/bin/pgrep',
        args: [
          '-x',
          '-l',
          '-U',
          '501',
          '^(Google Chrome|Microsoft Edge|Brave Browser|Chromium|Arc|Safari)$',
        ],
        timeout: 2000,
      },
    ]);
    expect(runningMacBrowsers(mac([]).run, 501)).toEqual([]);
    expect(runningMacBrowsers(fakeRunner(() => ({ error: enoent() })).run, 501)).toEqual([]);
  });

  it('tells why osascript brought nothing forward', () => {
    expect(osascriptFailure({ status: 0, stdout: 'no\n', stderr: '' })).toBeNull();
    expect(osascriptFailure({ status: 1, stdout: '', stderr: denied.stderr })).toBe('denied');
    expect(
      osascriptFailure({
        status: 1,
        stdout: '',
        stderr: 'execution error: Not authorised to send Apple events to Safari.',
      }),
    ).toBe('denied');
    // a Mac in Ukrainian (the user's) words it its own way: only the number tells
    expect(osascriptFailure({ status: 1, stdout: '', stderr: deniedUk.stderr })).toBe('denied');
    expect(
      osascriptFailure({
        status: 1,
        stdout: '',
        stderr: '24:31: execution error: Zugriff verweigert. (-1743)\n',
      }),
    ).toBe('denied');
    expect(
      osascriptFailure({
        status: 1,
        stdout: '',
        stderr: 'execution error: AppleEvent timed out. (-1712)',
      }),
    ).toBe('timeout');
    expect(
      osascriptFailure({
        status: 1,
        stdout: '',
        stderr: 'execution error: Safari got an error: Application isn’t running. (-600)',
      }),
    ).toBe('not-running');
    expect(
      osascriptFailure({
        status: 1,
        stdout: '',
        stderr: "syntax error: A class name can't go after this identifier. (-2740)",
      }),
    ).toBe('error');
    expect(osascriptFailure({ status: null, stdout: '', stderr: '', error: timedOut() })).toBe(
      'timeout',
    );
    expect(osascriptFailure({ status: null, stdout: '', stderr: '', error: enoent() })).toBe(
      'error',
    );
  });

  it('asks the running browsers in turn until one has it', () => {
    const { run, calls } = mac(['Google Chrome', 'Safari'], {
      'com.apple.Safari': { stdout: 'yes\n' },
    });
    expect(raiseControlWindow('darwin', run)).toEqual({
      raised: true,
      browser: 'Safari',
      denied: [],
      timedOut: false,
    });
    expect(calls.map((c) => c.cmd)).toEqual([
      '/usr/bin/pgrep',
      '/usr/bin/osascript',
      '/usr/bin/osascript',
    ]);
    expect(calls[1]).toEqual({
      cmd: '/usr/bin/osascript',
      args: ['-e', macRaiseScript(browser('Google Chrome'))],
      timeout: MAC_RAISE_TIMEOUT_MS,
    });
    expect(calls[2].args).toEqual(['-e', macRaiseScript(browser('Safari'))]);
    // found in the first: the rest isn't asked
    const first = mac(['Google Chrome', 'Safari'], { 'com.google.Chrome': { stdout: 'yes\n' } });
    expect(raiseControlWindow('darwin', first.run).browser).toBe('Google Chrome');
    expect(first.calls).toHaveLength(2);
  });

  it('asks nothing when no browser runs, and nothing at all on Linux', () => {
    const none = mac([]);
    expect(raiseControlWindow('darwin', none.run)).toEqual({
      raised: false,
      denied: [],
      timedOut: false,
    });
    expect(none.calls.map((c) => c.cmd)).toEqual(['/usr/bin/pgrep']);
    const linux = fakeRunner(() => ({ stdout: 'yes' }));
    expect(raiseControlWindow('linux', linux.run).raised).toBe(false);
    expect(linux.calls).toEqual([]);
  });

  it("reads the app's answer about open control windows, an older app's too", () => {
    expect(readControlWindows({ open: 2, active: { browser: 'firefox' } })).toEqual({
      open: 2,
      active: 'firefox',
    });
    for (const browser of ['edge', 'chromium', 'safari', 'other'] as const)
      expect(readControlWindows({ open: 1, active: { browser } }).active).toBe(browser);
    // before this change the app said only how many (1.1.0)
    expect(readControlWindows({ open: 2 })).toEqual({ open: 2, active: null });
    expect(readControlWindows({ open: 0, active: null })).toEqual({ open: 0, active: null });
    // a browser this launcher doesn't know: every browser is asked, as before
    expect(readControlWindows({ open: 1, active: { browser: 'ladybird' } }).active).toBe('other');
    for (const junk of [null, 'x', [], { open: 'many' }, { open: -1 }])
      expect(readControlWindows(junk)).toEqual({ open: 0, active: null });
  });

  it('asks only the browsers that can hold the window in charge', () => {
    const names = (bs: readonly { name: string }[]) => bs.map((b) => b.name);
    // Chrome, Brave, Chromium and Arc send one User-Agent; Edge its own
    expect(names(macBrowsersFor('chromium'))).toEqual([
      'Google Chrome',
      'Brave Browser',
      'Chromium',
      'Arc',
    ]);
    expect(names(macBrowsersFor('edge'))).toEqual(['Microsoft Edge']);
    expect(names(macBrowsersFor('safari'))).toEqual(['Safari']);
    for (const unknown of ['other', null] as const)
      expect(macBrowsersFor(unknown)).toEqual(MAC_BROWSERS);

    // in Safari: pgrep looks for Safari alone, only Safari is asked
    const safari = mac(['Google Chrome', 'Safari'], { 'com.apple.Safari': { stdout: 'yes\n' } });
    expect(raiseControlWindow('darwin', safari.run, 'safari')).toMatchObject({
      raised: true,
      browser: 'Safari',
    });
    expect(safari.calls.map((c) => c.cmd)).toEqual(['/usr/bin/pgrep', '/usr/bin/osascript']);
    expect(safari.calls[0].args.at(-1)).toBe('^(Safari)$');
    expect(safari.calls[1].args).toEqual(['-e', macRaiseScript(browser('Safari'))]);

    // in Chrome (or Brave, Arc): no Safari, no Edge — no prompt for a browser that doesn't hold it
    const chrome = mac(['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Safari'], {
      'com.brave.Browser': { stdout: 'yes\n' },
    });
    expect(raiseControlWindow('darwin', chrome.run, 'chromium').browser).toBe('Brave Browser');
    expect(chrome.calls[0].args.at(-1)).toBe('^(Google Chrome|Brave Browser|Chromium|Arc)$');
    expect(chrome.calls.slice(1).map((c) => c.args[1])).toEqual([
      macRaiseScript(browser('Google Chrome')),
      macRaiseScript(browser('Brave Browser')),
    ]);

    // in Edge: Edge alone
    const edge = mac(['Google Chrome', 'Microsoft Edge']);
    expect(raiseControlWindow('darwin', edge.run, 'edge').raised).toBe(false);
    expect(edge.calls.slice(1).map((c) => c.args[1])).toEqual([
      macRaiseScript(browser('Microsoft Edge')),
    ]);

    // not known (an older app, another browser): every running one, in order, as before
    for (const unknown of ['other', null] as const) {
      const all = mac(['Safari', 'Google Chrome']);
      raiseControlWindow('darwin', all.run, unknown);
      expect(all.calls[0].args.at(-1)).toBe(
        '^(Google Chrome|Microsoft Edge|Brave Browser|Chromium|Arc|Safari)$',
      );
      expect(all.calls.slice(1).map((c) => c.args[1])).toEqual([
        macRaiseScript(browser('Google Chrome')),
        macRaiseScript(browser('Safari')),
      ]);
    }
  });

  it('brings Firefox forward by LaunchServices: no AppleScript, no permission to ask', () => {
    // the user's Mac (2026-10-01): the control window in Firefox, a Chrome tab on standby,
    // Zen running with no page of the app open
    const { run, calls } = gecko({ 9009: FIREFOX_PROC, 35473: CHROME_HELPER_PROC });
    expect(raiseControlWindow('darwin', run, 'firefox', PORT)).toEqual({
      raised: true,
      browser: 'Firefox',
      appOnly: true,
      denied: [],
      timedOut: false,
    });
    expect(calls).toEqual([
      {
        cmd: '/usr/sbin/lsof',
        args: ['-nP', '-a', '-u', expect.any(String), '-iTCP:4747', '-sTCP:ESTABLISHED', '-Fpn'],
        timeout: 5000,
      },
      // the browsers' ends only: not the waiter's (pid 1)
      {
        cmd: '/usr/sbin/lsof',
        args: ['-nP', '-a', '-p', '9009,35473', '-d', 'txt', '-Fn'],
        timeout: 5000,
      },
      // no pgrep, no osascript: nothing asks for a permission
      { cmd: '/usr/bin/open', args: ['-a', FIREFOX_APP], timeout: 5000 },
    ]);
  });

  it('brings forward the Gecko browser that holds the app, not Firefox by name', () => {
    // Zen (or LibreWolf) says «Firefox/» too: Zen comes forward, while Firefox runs beside it
    const zen = gecko({ 9008: ZEN_PROC, 35473: CHROME_HELPER_PROC });
    expect(raiseControlWindow('darwin', zen.run, 'firefox', PORT)).toMatchObject({
      raised: true,
      browser: 'Zen',
      appOnly: true,
    });
    expect(zen.calls.at(-1)!.args).toEqual(['-a', '/Applications/Zen.app']);
    // Developer Edition, with regular Firefox installed and closed: never `open -b` (that
    // would start Firefox) — the very app that runs
    const dev = gecko({ 9100: DEV_EDITION_PROC });
    expect(raiseControlWindow('darwin', dev.run, 'firefox', PORT).browser).toBe(
      'Firefox Developer Edition',
    );
    expect(dev.calls.at(-1)!.args).toEqual(['-a', '/Applications/Firefox Developer Edition.app']);
    // the connection in a helper process (a socket process), over IPv6, beside the main one:
    // still one app
    const helper = gecko({ 9009: FIREFOX_PROC, 9010: FIREFOX_SOCKET_PROC }, {}, true);
    expect(geckoAppsConnectedTo(helper.run, PORT, 501)).toEqual([FIREFOX_APP]);
    expect(helper.calls[0].args).toContain('501');
  });

  it("brings nothing forward when it can't tell which Gecko browser holds the window", () => {
    // Firefox and Zen both have a page of the app open: which one is in charge is unknown
    const both = gecko({ 9009: FIREFOX_PROC, 9008: ZEN_PROC });
    expect(raiseControlWindow('darwin', both.run, 'firefox', PORT)).toEqual({
      raised: false,
      denied: [],
      timedOut: false,
    });
    expect(both.calls.map((c) => c.cmd)).not.toContain('/usr/bin/open');
    // none connected here (the window reached the app another way, or closed meanwhile): no
    // second lsof, no `open` — a closed browser is never started
    const none = gecko({});
    expect(raiseControlWindow('darwin', none.run, 'firefox', PORT).raised).toBe(false);
    expect(none.calls.map((c) => c.cmd)).toEqual(['/usr/sbin/lsof']);
    const chromeOnly = gecko({ 35473: CHROME_HELPER_PROC });
    expect(raiseControlWindow('darwin', chromeOnly.run, 'firefox', PORT).raised).toBe(false);
    expect(chromeOnly.calls.map((c) => c.cmd)).toEqual(['/usr/sbin/lsof', '/usr/sbin/lsof']);
    // no port to look at: nothing runs
    const noPort = gecko({ 9009: FIREFOX_PROC });
    expect(raiseControlWindow('darwin', noPort.run, 'firefox').raised).toBe(false);
    expect(noPort.calls).toEqual([]);
    // `open` failed or didn't start: where to look
    const failed = gecko({ 9009: FIREFOX_PROC }, { [FIREFOX_APP]: { status: 1, stderr: 'x\n' } });
    expect(raiseControlWindow('darwin', failed.run, 'firefox', PORT).raised).toBe(false);
    const crashed = gecko(
      { 9009: FIREFOX_PROC },
      { [FIREFOX_APP]: { status: null, error: enoent() } },
    );
    expect(raiseControlWindow('darwin', crashed.run, 'firefox', PORT).raised).toBe(false);
    // Windows and Linux don't care which browser: AppActivate finds any by its title
    const win = fakeRunner(() => ({ stdout: 'yes\r\n' }));
    expect(raiseControlWindow('win32', win.run, 'firefox', PORT).raised).toBe(true);
    expect(win.calls.map((c) => c.cmd)).toEqual(['powershell.exe']);
    const linux = fakeRunner(() => ({}));
    expect(raiseControlWindow('linux', linux.run, 'firefox', PORT).raised).toBe(false);
    expect(linux.calls).toEqual([]);
  });

  it('keeps PowerShell on Windows', () => {
    const { run, calls } = fakeRunner(() => ({ stdout: 'yes\r\n' }));
    expect(raiseControlWindow('win32', run).raised).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('powershell.exe');
    expect(calls[0].timeout).toBe(5000);
    expect(calls[0].args.at(-1)).toBe(
      `$s = New-Object -ComObject WScript.Shell; if ($s.AppActivate('${CONTROL_TITLES[0]}') -or $s.AppActivate('${CONTROL_TITLES[1]}')) { 'yes' }`,
    );
    expect(raiseControlWindow('win32', fakeRunner(() => ({})).run).raised).toBe(false);
  });

  it('names the browsers macOS keeps it from, and stops waiting after a timeout', () => {
    const { run } = mac(['Google Chrome', 'Brave Browser', 'Safari'], {
      'com.google.Chrome': denied,
      'com.brave.Browser': {
        ...denied,
        stderr: denied.stderr.replace('Google Chrome', 'Brave Browser'),
      },
    });
    expect(raiseControlWindow('darwin', run)).toEqual({
      raised: false,
      denied: ['Google Chrome', 'Brave Browser'],
      timedOut: false,
    });
    const slow = mac(['Google Chrome', 'Safari'], {
      'com.google.Chrome': { status: null, error: timedOut() },
    });
    expect(raiseControlWindow('darwin', slow.run)).toEqual({
      raised: false,
      denied: [],
      timedOut: true,
    });
    expect(slow.calls).toHaveLength(2); // pgrep and Chrome: Safari isn't asked to wait too
  });

  it('says where to allow it — naming Terminal only when the start window runs there', () => {
    try {
      setLang('uk');
      expect(
        raiseReport({ raised: true, browser: 'Safari', denied: [], timedOut: false }, terminal),
      ).toEqual(['Вікно керування вже відкрите — перемикаю на нього.']);
      expect(raiseReport({ raised: false, denied: [], timedOut: false }, terminal)).toEqual([
        'Вікно керування вже відкрите — знайдіть його серед вікон браузера.',
      ]);
      const chrome = { raised: false, denied: ['Google Chrome'], timedOut: false };
      const uk = raiseReport(chrome, terminal);
      expect(uk).toHaveLength(2);
      expect(uk[1]).toBe(
        'macOS не дозволяє Терміналу керувати Google Chrome. Щоб дозволити, відкрийте Системні параметри → Приватність і безпека → Автоматизація → Термінал і ввімкніть Google Chrome.',
      );
      // iTerm2, an editor's terminal, tmux, nothing known: the app is described, not named
      for (const env of [{ TERM_PROGRAM: 'iTerm.app' }, { TERM_PROGRAM: 'vscode' }, {}]) {
        expect(raiseReport(chrome, env)[1]).toBe(
          'macOS не дозволяє програмі, у якій відкрито вікно запуску, керувати Google Chrome. Щоб дозволити, відкрийте Системні параметри → Приватність і безпека → Автоматизація, знайдіть цю програму й увімкніть під нею Google Chrome.',
        );
      }
      setLang('en');
      const safari = { raised: false, denied: ['Safari'], timedOut: true };
      expect(raiseReport(safari, terminal)).toEqual([
        'The control window is open already — find it among the browser’s windows.',
        "macOS doesn't let Terminal control Safari. To allow it, open System Settings → Privacy & Security → Automation → Terminal and turn on Safari.",
        'If macOS asks for permission to control the browser, allow it and start again.',
      ]);
      expect(raiseReport(safari, { TERM_PROGRAM: 'iTerm.app' })[1]).toBe(
        "macOS doesn't let the app the start window runs in control Safari. To allow it, open System Settings → Privacy & Security → Automation, find that app and turn on Safari under it.",
      );
      expect(raiseReport(firefoxShown, terminal)).toEqual([
        'The control window is open in Firefox — showing Firefox.',
        "Firefox doesn't let the start file pick its window or tab — for that, keep the control window in Chrome or Safari.",
      ]);
    } finally {
      setLang('uk');
    }
  });

  it('gives the launcher its lines for an open control window', () => {
    const another = 'Щоб відкрити ще одне, запустіть з --new-window.';
    // found: «switching to it», never «find it»
    const found = mac(['Google Chrome'], { 'com.google.Chrome': { stdout: 'yes\n' } });
    expect(alreadyOpenLines(null, PORT, 'darwin', found.run, terminal)).toEqual([
      'Вікно керування вже відкрите — перемикаю на нього.',
      another,
    ]);
    // not found: «find it», never «switching to it»
    expect(alreadyOpenLines(null, PORT, 'darwin', mac(['Google Chrome']).run, terminal)).toEqual([
      'Вікно керування вже відкрите — знайдіть його серед вікон браузера.',
      another,
    ]);
    // refused on a Ukrainian Mac: where to allow it
    const refused = alreadyOpenLines(
      null,
      PORT,
      'darwin',
      mac(['Google Chrome'], { 'com.google.Chrome': deniedUk }).run,
      terminal,
    );
    expect(refused).toHaveLength(3);
    expect(refused[0]).toBe('Вікно керування вже відкрите — знайдіть його серед вікон браузера.');
    expect(refused[1]).toMatch(/^macOS не дозволяє Терміналу керувати Google Chrome\. /);
    expect(refused[2]).toBe(another);
    // in Firefox: Firefox comes forward, and the user hears it can't pick the window
    const firefox = gecko({ 9009: FIREFOX_PROC, 35473: CHROME_HELPER_PROC });
    expect(alreadyOpenLines('firefox', PORT, 'darwin', firefox.run, terminal)).toEqual([
      'Вікно керування відкрите у Firefox — показую Firefox.',
      'Firefox не дає файлу запуску вибрати своє вікно чи вкладку — для цього тримайте вікно керування в Chrome або Safari.',
      another,
    ]);
    expect(firefox.calls.map((c) => c.cmd)).toEqual([
      '/usr/sbin/lsof',
      '/usr/sbin/lsof',
      '/usr/bin/open',
    ]);
    // in Zen: Zen by its name
    expect(
      alreadyOpenLines('firefox', PORT, 'darwin', gecko({ 9008: ZEN_PROC }).run, terminal)[0],
    ).toBe('Вікно керування відкрите у Zen — показую Zen.');
    // … and when it can't: where to look, as before
    const both = gecko({ 9009: FIREFOX_PROC, 9008: ZEN_PROC });
    expect(alreadyOpenLines('firefox', PORT, 'darwin', both.run, terminal)).toEqual([
      'Вікно керування вже відкрите — знайдіть його серед вікон браузера.',
      another,
    ]);
    // Windows as in 1.1.0; Linux runs nothing and says where to look
    const win = fakeRunner(() => ({ stdout: 'yes\r\n' }));
    expect(alreadyOpenLines(null, PORT, 'win32', win.run, {})[0]).toBe(
      'Вікно керування вже відкрите — перемикаю на нього.',
    );
    const linux = fakeRunner(() => ({ stdout: 'yes' }));
    expect(alreadyOpenLines(null, PORT, 'linux', linux.run, {})).toEqual([
      'Вікно керування вже відкрите — знайдіть його серед вікон браузера.',
      another,
    ]);
    expect(linux.calls).toEqual([]);
  });
});

const terminal = { TERM_PROGRAM: 'Apple_Terminal' };
const firefoxShown = {
  raised: true,
  browser: 'Firefox',
  appOnly: true,
  denied: [],
  timedOut: false,
};

function timedOut(): NodeJS.ErrnoException {
  return Object.assign(new Error('spawnSync /usr/bin/osascript ETIMEDOUT'), { code: 'ETIMEDOUT' });
}
function enoent(): NodeJS.ErrnoException {
  return Object.assign(new Error('spawnSync /usr/bin/pgrep ENOENT'), { code: 'ENOENT' });
}
