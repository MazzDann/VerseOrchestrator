import { N_ } from '@vo/shared';

/**
 * «Пересканувати модулі» as the server's own job (1.12.4, users' report F1010-01: the button spun
 * for good — the page waited on one long request, and nothing said how far the build was or let it
 * stop). The request starts the job and returns at once; every window reads its state (GET
 * /api/rebuild, and the hub tells control windows as it changes): which module, how many of how
 * many, «Зупинити». A builder silent for too long is stopped (the watchdog).
 *
 * Stopping is safe: the builder writes the whole library in one transaction, so a build stopped
 * before its commit leaves the library as it was (builder/src/build.ts).
 */

export type RebuildPhase = 'idle' | 'running' | 'done' | 'failed' | 'stopped';

export type RebuildError = { key: string; vars?: Record<string, string> } | { text: string };

export interface RebuildState {
  /** grows with every job, across restarts too: a window tells a new job from one it saw end */
  id: number;
  phase: RebuildPhase;
  /** what the builder is reading — a module's name, or `songs` / `finish` (build.ts `step()`) */
  current: string | null;
  step: number;
  total: number;
  startedAt: number | null;
  endedAt: number | null;
  /** a dictionary key with its values, or the builder's own last words */
  error: RebuildError | null;
}

/** What the job needs of the builder process — a child process in the server, a fake in tests. */
export interface BuilderProcess {
  /** each line it prints; `err`: on stderr */
  onOutput(cb: (line: string, err: boolean) => void): void;
  onError(cb: (err: Error) => void): void;
  onExit(cb: (code: number | null) => void): void;
  /** stop it and whatever it started (npm → tsx → node) */
  kill(): void;
}

/** `[builder] step 3/29 RST+` — the builder's progress line (build.ts `step()`). */
export const STEP_LINE = /^\[builder\] step (\d+)\/(\d+) (.+)$/;

/**
 * Ten minutes. Measured on the PC (20 Bibles, 3 dictionaries, 3 commentaries — 537 195 verses):
 * the whole build 45.9 s, its longest silence 9.2 s (the FTS optimize and VACUUM at the end).
 */
export const SILENT_MS = 10 * 60 * 1000;

export interface RebuildJobOptions {
  start: () => BuilderProcess;
  /** the state changed: tell the windows */
  onChange?: (s: RebuildState) => void;
  /**
   * The build ended, any way: drop the cached connection — a stop after the commit (in VACUUM)
   * leaves a new library too.
   */
  onSettled?: () => void;
  /** no line from the builder for this long: stopped as stuck */
  silentMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export function createRebuildJob(o: RebuildJobOptions) {
  const now = o.now ?? Date.now;
  const setTimer = o.setTimer ?? ((fn, ms) => setTimeout(fn, ms).unref());
  const clearTimer = o.clearTimer ?? ((t) => clearTimeout(t as NodeJS.Timeout));
  const silentMs = o.silentMs ?? SILENT_MS;
  let state: RebuildState = {
    id: 0,
    phase: 'idle',
    current: null,
    step: 0,
    total: 0,
    startedAt: null,
    endedAt: null,
    error: null,
  };
  let child: BuilderProcess | null = null;
  let watchdog: unknown = null;
  // the builder's stderr, its own words for a failure (as before 1.12.4)
  let stderr = '';

  const set = (patch: Partial<RebuildState>) => {
    state = { ...state, ...patch };
    o.onChange?.(state);
  };
  const end = (phase: Exclude<RebuildPhase, 'idle' | 'running'>, error: RebuildError | null) => {
    if (state.phase !== 'running') return;
    if (watchdog !== null) clearTimer(watchdog);
    watchdog = null;
    child = null;
    o.onSettled?.();
    set({ phase, error, endedAt: now(), current: null });
  };
  const arm = () => {
    if (watchdog !== null) clearTimer(watchdog);
    watchdog = setTimer(() => {
      watchdog = null;
      const p = child;
      end('failed', {
        key: N_('Збирач мовчав {minutes} хв — його зупинено. Спробуйте ще раз'),
        vars: { minutes: String(Math.round(silentMs / 60_000)) },
      });
      p?.kill();
    }, silentMs);
  };

  return {
    state: () => state,
    running: () => state.phase === 'running',
    /** Start a build; one already running is the answer as it is. */
    start(): RebuildState {
      if (state.phase === 'running') return state;
      stderr = '';
      set({
        // from the clock, so a restarted server's jobs still count up: a window open across the
        // restart would take its job 1 for one it announced already (review)
        id: Math.max(state.id + 1, now()),
        phase: 'running',
        current: null,
        step: 0,
        total: 0,
        startedAt: now(),
        endedAt: null,
        error: null,
      });
      let p: BuilderProcess;
      try {
        p = o.start();
      } catch (err) {
        end('failed', {
          key: N_('Не вдалося запустити збірку: {error}'),
          vars: { error: (err as Error).message },
        });
        return state;
      }
      child = p;
      arm();
      p.onOutput((line, err) => {
        if (child !== p) return;
        arm();
        if (err) stderr = (stderr + line + '\n').slice(-2000);
        const m = STEP_LINE.exec(line.trim());
        if (m) set({ step: Number(m[1]), total: Number(m[2]), current: m[3] });
      });
      p.onError((err) => {
        if (child !== p) return;
        end('failed', {
          key: N_('Не вдалося запустити збірку: {error}'),
          vars: { error: err.message },
        });
      });
      p.onExit((code) => {
        if (child !== p) return;
        if (code === 0) return end('done', null);
        const last = stderr.trim().slice(-500);
        end(
          'failed',
          last
            ? { text: last }
            : { key: N_('Збірка завершилась з кодом {code}'), vars: { code: String(code) } },
        );
      });
      return state;
    },
    /** «Зупинити»: before the builder's commit the library stays as it was. */
    stop(): RebuildState {
      if (state.phase !== 'running') return state;
      const p = child;
      end('stopped', null);
      p?.kill();
      return state;
    },
  };
}
