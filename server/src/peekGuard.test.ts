import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BROWSER_WINDOW_CLASSES,
  createPeekGuard,
  MAX_FAILURES,
  OUTPUT_TITLES,
  parseGuardOutput,
  PEEK_GUARD_COMMAND,
  PEEK_GUARD_CS,
  type GuardRunResult,
} from './peekGuard';

afterEach(() => {
  vi.useRealTimers();
});

/** A runner that records each run and answers after `ms` with `answer()`: nothing spawns. */
function fakeRunner(answer: () => GuardRunResult = () => ok('110BBC 00000000\n'), ms = 300) {
  const runs: { env: NodeJS.ProcessEnv; at: number }[] = [];
  const run = (env: NodeJS.ProcessEnv) => {
    runs.push({ env, at: Date.now() });
    return new Promise<GuardRunResult>((r) => setTimeout(() => r(answer()), ms));
  };
  return { run, runs };
}
const ok = (stdout: string): GuardRunResult => ({ code: 0, stdout, stderr: '' });

describe('Windows «Peek» and the output windows (F1005-05)', () => {
  it('looks for the output windows by their titles in both languages', () => {
    // the strings web/src/lib/outputs.ts outputTitle gives the pages (its test checks the same)
    expect(OUTPUT_TITLES).toEqual([
      'VerseOrchestrator — Показ',
      'VerseOrchestrator — Сцена',
      'VerseOrchestrator — Presentation',
      'VerseOrchestrator — Stage',
    ]);
    // never the control window's: «VerseOrchestrator — керування» starts with none of them
    expect(OUTPUT_TITLES.some((t) => 'VerseOrchestrator — керування'.startsWith(t))).toBe(false);
    expect(BROWSER_WINDOW_CLASSES).toEqual(['Chrome_WidgetWin_1', 'MozillaWindowClass']);
  });

  it('runs one ASCII line of PowerShell; the C# and the titles go through the environment', () => {
    expect(PEEK_GUARD_COMMAND).not.toMatch(/[\r\n]/);
    expect(/^[\x20-\x7e]*$/.test(PEEK_GUARD_COMMAND)).toBe(true);
    expect(PEEK_GUARD_COMMAND).toContain('$env:VO_PEEK_CS');
    expect(PEEK_GUARD_COMMAND).toContain('[Console]::OutputEncoding = [Text.Encoding]::UTF8');
    expect(PEEK_GUARD_CS).toContain('DwmSetWindowAttribute(h, 12, ref on, 4)');
    expect(PEEK_GUARD_CS).toContain('StartsWith(p, StringComparison.Ordinal)');
  });

  it('reads what a run marked', () => {
    expect(parseGuardOutput('906A6 00000000\r\n40C1C 80070005\n\nnoise\n')).toEqual([
      { hwnd: '906A6', hr: 0 },
      { hwnd: '40C1C', hr: 0x80070005 | 0 },
    ]);
    expect(parseGuardOutput('')).toEqual([]);
  });

  it('does nothing but on Windows, or when switched off', () => {
    const r = fakeRunner();
    expect(createPeekGuard({ platform: 'darwin', run: r.run, log: () => {} }).request()).toBe(
      'off',
    );
    expect(createPeekGuard({ platform: 'linux', run: r.run, log: () => {} }).request()).toBe('off');
    const offByEnv = createPeekGuard({
      platform: 'win32',
      env: { VO_PEEK_GUARD: '0' },
      run: r.run,
      log: () => {},
    });
    expect(offByEnv.request()).toBe('off');
    expect(r.runs).toEqual([]);
  });

  it('a burst of requests is one run, then at most one more — never sooner than the interval', async () => {
    vi.useFakeTimers();
    const r = fakeRunner();
    const log: string[] = [];
    const g = createPeekGuard({ platform: 'win32', env: {}, run: r.run, log: (m) => log.push(m) });
    for (let i = 0; i < 10; i++) expect(g.request()).toBe('queued');
    await vi.advanceTimersByTimeAsync(0);
    expect(r.runs).toHaveLength(1);
    // the run passes what to look for
    expect(r.runs[0].env.VO_PEEK_TITLES?.split('\n')).toEqual(OUTPUT_TITLES);
    expect(r.runs[0].env.VO_PEEK_CLASSES?.split('\n')).toEqual(BROWSER_WINDOW_CLASSES);
    expect(r.runs[0].env.VO_PEEK_CS).toBe(PEEK_GUARD_CS);
    // more while it runs: one more run, 3 s after the first began
    for (let i = 0; i < 5; i++) g.request();
    await vi.advanceTimersByTimeAsync(2000);
    expect(r.runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1100);
    expect(r.runs).toHaveLength(2);
    expect(r.runs[1].at - r.runs[0].at).toBeGreaterThanOrEqual(3000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(r.runs).toHaveLength(2);
    expect(g.busy).toBe(false);
    // said once: the count didn't change
    expect(log).toEqual(['kept out of Windows Peek: 1 window(s)']);
  });

  it('failures are said once each; three in a row switch it off until a restart', async () => {
    vi.useFakeTimers();
    let answer: GuardRunResult = {
      code: 1,
      stdout: '',
      stderr:
        'Add-Type : Cannot add type. Definition of new types is not supported in this language mode.\r\n',
    };
    const r = fakeRunner(() => answer, 10);
    const log: string[] = [];
    const g = createPeekGuard({
      platform: 'win32',
      env: {},
      run: r.run,
      log: (m) => log.push(m),
      minIntervalMs: 100,
    });
    g.request();
    await vi.advanceTimersByTimeAsync(200);
    // a success in between starts the count again
    answer = ok('');
    g.request();
    await vi.advanceTimersByTimeAsync(200);
    answer = { code: 0, stdout: '906A6 80070005\n', stderr: '' };
    for (let i = 0; i < MAX_FAILURES; i++) {
      expect(g.request()).toBe('queued');
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(g.request()).toBe('off');
    expect(r.runs).toHaveLength(2 + MAX_FAILURES);
    expect(log).toEqual([
      'not marked: Add-Type : Cannot add type. Definition of new types is not supported in this language mode.',
      'kept out of Windows Peek: 0 window(s)',
      'not marked: DwmSetWindowAttribute 0x80070005',
      `${MAX_FAILURES} failed runs in a row: off until the app restarts`,
    ]);
  });

  it('one window that refuses does not switch the guard off for the others (review)', async () => {
    vi.useFakeTimers();
    // an elevated browser's window next to ours: refused every time, the other marked
    const r = fakeRunner(() => ok('906A6 00000000\n40C1C 80070005\n'), 10);
    const log: string[] = [];
    const g = createPeekGuard({
      platform: 'win32',
      env: {},
      run: r.run,
      log: (m) => log.push(m),
      minIntervalMs: 100,
    });
    for (let i = 0; i < MAX_FAILURES + 2; i++) {
      expect(g.request()).toBe('queued');
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(g.request()).toBe('queued');
    expect(log).toEqual([
      'some windows not marked: DwmSetWindowAttribute 0x80070005',
      'kept out of Windows Peek: 1 window(s)',
    ]);
  });

  it('a clock set back never stalls the next run past the interval (review)', async () => {
    vi.useFakeTimers();
    let clock = 1_000_000;
    const r = fakeRunner(() => ok(''), 10);
    const g = createPeekGuard({
      platform: 'win32',
      env: {},
      run: r.run,
      log: () => {},
      now: () => clock,
    });
    g.request();
    await vi.advanceTimersByTimeAsync(50);
    expect(r.runs).toHaveLength(1);
    clock -= 3_600_000; // an hour back: time sync after a boot with a fast clock
    g.request();
    await vi.advanceTimersByTimeAsync(3100);
    expect(r.runs).toHaveLength(2);
  });

  it('a runner that throws or PowerShell that is missing counts as a failure, not a crash', async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const g = createPeekGuard({
      platform: 'win32',
      env: {},
      minIntervalMs: 10,
      log: (m) => log.push(m),
      run: async () => ({
        code: null,
        stdout: '',
        stderr: '',
        error: new Error('spawn powershell.exe ENOENT'),
      }),
    });
    g.request();
    await vi.advanceTimersByTimeAsync(50);
    expect(log).toEqual(['not marked: spawn powershell.exe ENOENT']);
  });

  it.runIf(process.platform === 'win32')(
    'the real PowerShell compiles the C# and runs it (nothing matches: no window is touched)',
    async () => {
      const log: string[] = [];
      const g = createPeekGuard({
        log: (m) => log.push(m),
        // the machine's own environment (PowerShell needs PATH, SystemRoot) — without the switch
        env: { ...process.env, VO_PEEK_GUARD: undefined },
        // a title no window has
        titles: [`VO peek guard test ${process.pid} ${Date.now()}`],
      });
      expect(g.request()).toBe('queued');
      for (let i = 0; i < 300 && (g.busy || log.length === 0); i++)
        await new Promise((r) => setTimeout(r, 100));
      expect(log).toEqual(['kept out of Windows Peek: 0 window(s)']);
    },
    40_000,
  );
});
