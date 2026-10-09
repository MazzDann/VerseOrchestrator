import { execFile } from 'node:child_process';
import { N_, tr } from './lang.js';

/**
 * Windows «Peek» and the output windows (F1005-05). A pointer resting on a window thumbnail above
 * a taskbar button makes Windows show only that window and hide every other one on every screen:
 * the projector showed the desktop until the pointer moved on (the users' feedback of 2026-10-05;
 * found on the test Windows 11 21H2 of 2026-10-10 — the control window, «Показ» and «Сцена» share
 * one taskbar button, so reaching the control window by its thumbnail is enough). A page can't
 * opt out; this server, on the same computer, can: DWMWA_EXCLUDED_FROM_PEEK on the output
 * windows' top-level browser windows. Measured there: set from another process it returns S_OK
 * for Edge 154 and LibreWolf 141 windows, they stay on screen during a Peek, through full screen
 * on and off (the attribute lives on the window; it can't be read back).
 *
 * The output pages carry their own titles (`VerseOrchestrator — Показ` / `— Сцена`, web
 * lib/outputs.ts) and ask (POST /api/windows/peek-guard) when they open, move, resize or change
 * full screen — a tab dragged out into a window of its own is a new window. One PowerShell run
 * marks every such window it finds (≈0.35 s, async: the hub never waits). Requests while a run
 * goes, or sooner than `minIntervalMs` after one began, become ONE more run after it. Anything but
 * Windows: nothing. VO_PEEK_GUARD=0 turns it off; three failed runs in a row turn it off until the
 * app restarts (PowerShell blocked, Add-Type refused by a policy) — each reason logged once.
 */

/** The output windows' titles in every interface language — what a browser window's title starts with. */
export const OUTPUT_TITLES = (['uk', 'en'] as const).flatMap((lang) =>
  [N_('Показ'), N_('Сцена')].map((kind) => `VerseOrchestrator — ${tr(kind, undefined, lang)}`),
);

/** Top-level browser windows: Chromium's (Chrome, Edge, Opera, Brave, Vivaldi) and Gecko's. */
export const BROWSER_WINDOW_CLASSES = ['Chrome_WidgetWin_1', 'MozillaWindowClass'];

/** DWMWINDOWATTRIBUTE: DWMWA_EXCLUDED_FROM_PEEK (DWMWA_DISALLOW_PEEK, 11, did not help on 22000). */
export const DWMWA_EXCLUDED_FROM_PEEK = 12;

/**
 * The C# that marks the windows: every visible top-level window of one of `classes` whose title
 * starts with one of `titles` gets the attribute; one line per window, `HWND HRESULT` in hex.
 * It goes to PowerShell through the environment, so the command line stays one ASCII line and
 * no file is written next to the app.
 */
export const PEEK_GUARD_CS = `using System; using System.Text; using System.Runtime.InteropServices;
public static class VoPeekGuard {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(IntPtr h, int a, ref int v, int s);
  public static string Run(string[] titles, string[] classes) {
    StringBuilder found = new StringBuilder();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      StringBuilder c = new StringBuilder(256); GetClassNameW(h, c, 256);
      if (Array.IndexOf(classes, c.ToString()) < 0) return true;
      StringBuilder t = new StringBuilder(512); GetWindowTextW(h, t, 512);
      string title = t.ToString();
      foreach (string p in titles) {
        if (p.Length == 0 || !title.StartsWith(p, StringComparison.Ordinal)) continue;
        int on = 1;
        int hr = DwmSetWindowAttribute(h, ${DWMWA_EXCLUDED_FROM_PEEK}, ref on, 4);
        found.AppendFormat("{0:X} {1:X8}\\n", h.ToInt64(), hr);
        break;
      }
      return true;
    }, IntPtr.Zero);
    return found.ToString();
  }
}`;

/** The one-line PowerShell command: compile, run, print. */
export const PEEK_GUARD_COMMAND =
  "$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; " +
  'Add-Type -TypeDefinition $env:VO_PEEK_CS; ' +
  '[VoPeekGuard]::Run($env:VO_PEEK_TITLES.Split([char]10), $env:VO_PEEK_CLASSES.Split([char]10))';

/** What a run left: exit code, output, and an error when it didn't start or ran past its time. */
export interface GuardRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

/** Runs PowerShell without waiting on the event loop; tests pass their own. */
export type GuardRunner = (env: NodeJS.ProcessEnv) => Promise<GuardRunResult>;

const powershellRunner: GuardRunner = (env) =>
  new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PEEK_GUARD_COMMAND],
      { env, windowsHide: true, timeout: 15_000, encoding: 'utf8' },
      (error, stdout, stderr) =>
        resolve({
          // a number: PowerShell's exit code; ENOENT, a timeout's kill: none
          code: error
            ? typeof (error as { code?: unknown }).code === 'number'
              ? (error as { code: number }).code
              : null
            : 0,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          error: error ?? undefined,
        }),
    );
  });

/** The windows one run marked: `hwnd` and its HRESULT (0 = done). */
export function parseGuardOutput(stdout: string): { hwnd: string; hr: number }[] {
  return stdout
    .split(/\r?\n/)
    .map((l) => /^([0-9A-F]+) ([0-9A-F]{8})$/i.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ hwnd: m[1], hr: Number.parseInt(m[2], 16) | 0 }));
}

export type GuardAnswer = 'queued' | 'off';

export interface PeekGuardOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  run?: GuardRunner;
  /** a run starts at most this often (ms) — later requests wait and become one run */
  minIntervalMs?: number;
  log?: (m: string) => void;
  now?: () => number;
  /** what to look for — OUTPUT_TITLES and BROWSER_WINDOW_CLASSES; a test's own otherwise */
  titles?: readonly string[];
  classes?: readonly string[];
}

export const MAX_FAILURES = 3;

export function createPeekGuard(o: PeekGuardOptions = {}) {
  const platform = o.platform ?? process.platform;
  const env = o.env ?? process.env;
  const run = o.run ?? powershellRunner;
  const minIntervalMs = o.minIntervalMs ?? 3000;
  const log = o.log ?? ((m: string) => console.log(`[peek] ${m}`));
  const now = o.now ?? Date.now;
  const off = platform !== 'win32' || env.VO_PEEK_GUARD === '0';
  let running = false;
  let again = false;
  let timer: NodeJS.Timeout | null = null;
  let lastStart = -Infinity;
  let failures = 0;
  let disabled = false;
  const said = new Set<string>();
  let marked = -1;
  const once = (reason: string) => {
    if (said.has(reason)) return;
    said.add(reason);
    log(reason);
  };
  const runEnv = (): NodeJS.ProcessEnv => ({
    ...env,
    VO_PEEK_CS: PEEK_GUARD_CS,
    VO_PEEK_TITLES: (o.titles ?? OUTPUT_TITLES).join('\n'),
    VO_PEEK_CLASSES: (o.classes ?? BROWSER_WINDOW_CLASSES).join('\n'),
  });

  const failed = (reason: string) => {
    failures++;
    once(`not marked: ${reason}`);
    if (failures >= MAX_FAILURES) {
      disabled = true;
      log(`${MAX_FAILURES} failed runs in a row: off until the app restarts`);
    }
  };

  async function start(): Promise<void> {
    timer = null;
    running = true;
    again = false;
    lastStart = now();
    try {
      const r = await run(runEnv());
      const windows = parseGuardOutput(r.stdout);
      if (r.error || r.code !== 0) {
        // PowerShell's own first line says why (a policy, Add-Type refused); never the window titles
        const why = (r.stderr.split(/\r?\n/).find((l) => l.trim() && !l.startsWith('#<')) ?? '')
          .trim()
          .slice(0, 160);
        failed(why || r.error?.message || `exit ${r.code}`);
      } else if (windows.some((w) => w.hr !== 0)) {
        failed(
          `DwmSetWindowAttribute ${windows.map((w) => `0x${(w.hr >>> 0).toString(16)}`).join(', ')}`,
        );
      } else {
        failures = 0;
        // said when the count changes, not on every move of a window
        if (windows.length !== marked) log(`kept out of Windows Peek: ${windows.length} window(s)`);
        marked = windows.length;
      }
    } catch (err) {
      failed((err as Error).message);
    } finally {
      running = false;
      if (again && !disabled) schedule();
    }
  }

  function schedule(): void {
    if (timer) return;
    const wait = Math.max(0, lastStart + minIntervalMs - now());
    timer = setTimeout(() => void start(), wait);
    timer.unref?.();
  }

  return {
    /** An output window opened, moved or changed: mark the output windows (soon). */
    request(): GuardAnswer {
      if (off || disabled) return 'off';
      if (running) again = true;
      else schedule();
      return 'queued';
    },
    /** for tests and the log: is anything pending */
    get busy(): boolean {
      return running || !!timer;
    },
  };
}
