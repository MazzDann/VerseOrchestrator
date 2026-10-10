import { describe, expect, it, vi } from 'vitest';
import { createRebuildJob, type BuilderProcess, type RebuildState } from './rebuildJob';

/** A builder the test drives: say(line), exit(code), and whether it was killed. */
function fakeBuilder() {
  let out: (l: string, err: boolean) => void = () => {};
  let exit: (code: number | null) => void = () => {};
  let fail: (e: Error) => void = () => {};
  const p = {
    killed: 0,
    say: (l: string, err = false) => out(l, err),
    exit: (code: number | null) => exit(code),
    fail: (e: Error) => fail(e),
    process: {
      onOutput: (cb) => (out = cb),
      onExit: (cb) => (exit = cb),
      onError: (cb) => (fail = cb),
      kill: () => void (p.killed += 1),
    } satisfies BuilderProcess,
  };
  return p;
}

function job(silentMs = 1000) {
  let t = 0;
  let timer: { fn: () => void; at: number } | null = null;
  const builders: ReturnType<typeof fakeBuilder>[] = [];
  const seen: RebuildState[] = [];
  const settled = vi.fn();
  const j = createRebuildJob({
    start: () => {
      const b = fakeBuilder();
      builders.push(b);
      return b.process;
    },
    onChange: (s) => seen.push(s),
    onSettled: settled,
    silentMs,
    now: () => t,
    setTimer: (fn, ms) => (timer = { fn, at: t + ms }),
    clearTimer: () => (timer = null),
  });
  const later = (ms: number) => {
    t += ms;
    if (timer && t >= timer.at) {
      const { fn } = timer;
      timer = null;
      fn();
    }
  };
  return { j, builders, seen, settled, later };
}

describe('the library rebuild as the server’s job (1.12.4)', () => {
  it('starts at once, says how far it is from the builder’s step lines, and ends done', () => {
    const { j, builders, settled } = job();
    expect(j.start()).toMatchObject({ id: 1, phase: 'running', step: 0 });
    const b = builders[0];
    b.say('[builder] importing: 2 Bibles, 0 dictionaries, 0 crossrefs, 0 commentaries');
    b.say('[builder] step 1/4 RST+');
    expect(j.state()).toMatchObject({ step: 1, total: 4, current: 'RST+' });
    b.say('[builder] step 4/4 finish');
    b.exit(0);
    expect(j.state()).toMatchObject({ phase: 'done', current: null, error: null });
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('a second start joins the running one — one builder', () => {
    const { j, builders } = job();
    j.start();
    expect(j.start()).toMatchObject({ id: 1, phase: 'running' });
    expect(builders).toHaveLength(1);
  });

  it('«Зупинити» kills the builder; its late exit changes nothing; the next start is a new job', () => {
    const { j, builders, settled } = job();
    j.start();
    expect(j.stop()).toMatchObject({ phase: 'stopped' });
    expect(builders[0].killed).toBe(1);
    builders[0].exit(1); // the killed tree closes after
    expect(j.state().phase).toBe('stopped');
    expect(settled).toHaveBeenCalledTimes(1);
    expect(j.start()).toMatchObject({ id: 2, phase: 'running', error: null });
    expect(builders).toHaveLength(2);
  });

  it('a failure says the builder’s last words on stderr — or its exit code', () => {
    const a = job();
    a.j.start();
    a.builders[0].say('[builder] step 1/3 RST+');
    a.builders[0].say('Error: SQLITE_FULL: database or disk is full', true);
    a.builders[0].exit(1);
    expect(a.j.state()).toMatchObject({
      phase: 'failed',
      error: { text: 'Error: SQLITE_FULL: database or disk is full' },
    });
    const b = job();
    b.j.start();
    b.builders[0].exit(3);
    expect(b.j.state().error).toMatchObject({ vars: { code: '3' } });
  });

  it('a builder silent past the watchdog is stopped; any line rearms it', () => {
    const { j, builders, later } = job(1000);
    j.start();
    later(900);
    builders[0].say('[builder] step 1/3 RST+');
    later(900); // 1800 since the start, 900 since the line
    expect(j.state().phase).toBe('running');
    later(100);
    expect(j.state()).toMatchObject({ phase: 'failed', error: { vars: { minutes: '0' } } });
    expect(builders[0].killed).toBe(1);
  });

  it('a builder that can’t start fails the job, and the next start tries again', () => {
    let first = true;
    const j = createRebuildJob({
      start: () => {
        if (first) {
          first = false;
          throw new Error('spawn npm ENOENT');
        }
        return fakeBuilder().process;
      },
      setTimer: () => null,
      clearTimer: () => {},
    });
    expect(j.start()).toMatchObject({
      phase: 'failed',
      error: { vars: { error: 'spawn npm ENOENT' } },
    });
    expect(j.start()).toMatchObject({ id: 2, phase: 'running' });
  });

  it('every change reaches the windows, ending with the outcome', () => {
    const { j, builders, seen } = job();
    j.start();
    builders[0].say('[builder] step 1/2 KJV+');
    builders[0].exit(0);
    expect(seen.map((s) => `${s.phase}:${s.step}`)).toEqual(['running:0', 'running:1', 'done:1']);
  });
});
