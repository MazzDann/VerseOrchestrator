import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createOutputs,
  HEARTBEAT_MS,
  outputLabels,
  STALE_HIDDEN_MS,
  STALE_MS,
  type OutputChannel,
  type OutputInfo,
  type OutputWire,
  type TrackedOutput,
} from './outputs';
import { featuresFor, screenOf, type ScreenInfo } from './screens';

/** An in-memory BroadcastChannel: a post reaches every OTHER endpoint, asynchronously. */
function hub() {
  const endpoints = new Set<(m: OutputWire) => void>();
  const endpoint = (): OutputChannel => {
    const mine = new Set<(m: OutputWire) => void>();
    return {
      post: (m) => {
        for (const cb of endpoints) if (!mine.has(cb)) queueMicrotask(() => cb(structuredClone(m)));
      },
      listen: (cb) => {
        mine.add(cb);
        endpoints.add(cb);
        return () => {
          mine.delete(cb);
          endpoints.delete(cb);
        };
      },
    };
  };
  return { endpoint };
}

const flush = async () => {
  for (let i = 0; i < 3; i++) await Promise.resolve();
};

const info = (
  id: string,
  kind: OutputInfo['kind'] = 'presenter',
  over: Partial<OutputInfo> = {},
) => {
  const i: OutputInfo = {
    id,
    name: `vo-${kind}`,
    kind,
    bounds: { x: 1920, y: 0, w: 1920, h: 1080 },
    fullscreen: false,
    visible: true,
    openedAt: Number(id.replace(/\D/g, '')) || 1,
    ...over,
  };
  return i;
};

describe('output windows registry', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lists a window that announces itself; a heartbeat with no news does not re-emit', async () => {
    const h = hub();
    const control = createOutputs(h.endpoint(), () => Date.now());
    const emits: TrackedOutput[][] = [];
    control.track((l) => emits.push(l));
    const w = createOutputs(h.endpoint()).announce(
      () => info('w1'),
      () => undefined,
    );
    await flush();
    expect(emits.at(-1)!.map((o) => o.id)).toEqual(['w1']);
    const count = emits.length;
    vi.advanceTimersByTime(HEARTBEAT_MS * 2); // two heartbeats, nothing changed
    await flush();
    expect(emits).toHaveLength(count);
    w.stop();
  });

  it('reports changes (moved, fullscreen) and removes a window that says bye', async () => {
    const h = hub();
    const control = createOutputs(h.endpoint(), () => Date.now());
    let list: TrackedOutput[] = [];
    control.track((l) => (list = l));
    let current = info('w1');
    const w = createOutputs(h.endpoint()).announce(
      () => current,
      () => undefined,
    );
    await flush();
    current = { ...current, fullscreen: true, bounds: { x: 0, y: 0, w: 1920, h: 1080 } };
    w.changed();
    await flush();
    expect(list[0].fullscreen).toBe(true);
    expect(list[0].bounds.x).toBe(0);
    w.stop();
    await flush();
    expect(list).toEqual([]);
  });

  it('drops a window that went silent (crashed, closed without bye)', async () => {
    const h = hub();
    const control = createOutputs(h.endpoint(), () => Date.now());
    let list: TrackedOutput[] = [];
    control.track((l) => (list = l));
    h.endpoint().post({ t: 'win', info: info('w9') }); // one announcement, then nothing
    await flush();
    expect(list).toHaveLength(1);
    vi.advanceTimersByTime(STALE_MS + HEARTBEAT_MS);
    await flush();
    expect(list).toEqual([]);
  });

  it('keeps a hidden window through throttled heartbeats, drops it once truly silent', async () => {
    const h = hub();
    const control = createOutputs(h.endpoint(), () => Date.now());
    let list: TrackedOutput[] = [];
    control.track((l) => (list = l));
    // fullscreen on the projector, but its Space is not the one shown right now
    h.endpoint().post({ t: 'win', info: info('w5', 'presenter', { visible: false }) });
    await flush();
    expect(list).toHaveLength(1);
    vi.advanceTimersByTime(STALE_MS + HEARTBEAT_MS); // a visible window would be gone by now
    await flush();
    expect(list.map((o) => o.id)).toEqual(['w5']);
    vi.advanceTimersByTime(STALE_HIDDEN_MS);
    await flush();
    expect(list).toEqual([]);
  });

  it('a control window opened later learns about existing windows at once (who)', async () => {
    const h = hub();
    const a = createOutputs(h.endpoint()).announce(
      () => info('w1'),
      () => undefined,
    );
    const b = createOutputs(h.endpoint()).announce(
      () => info('w2', 'stage'),
      () => undefined,
    );
    await flush();
    let list: TrackedOutput[] = [];
    createOutputs(h.endpoint(), () => Date.now()).track((l) => (list = l));
    await flush();
    expect(list.map((o) => o.id).sort()).toEqual(['w1', 'w2']);
    a.stop();
    b.stop();
  });

  it('identify reaches only the named window', async () => {
    const h = hub();
    const control = createOutputs(h.endpoint());
    const seen: string[] = [];
    const a = createOutputs(h.endpoint()).announce(
      () => info('w1'),
      (l) => seen.push(`w1:${l}`),
    );
    const b = createOutputs(h.endpoint()).announce(
      () => info('w2'),
      (l) => seen.push(`w2:${l}`),
    );
    control.identify('w2', 'Показ 2');
    await flush();
    expect(seen).toEqual(['w2:Показ 2']);
    a.stop();
    b.stop();
  });

  it('commands (move / close / focus / leave fullscreen) reach only the named window', async () => {
    const h = hub();
    // a control window that did NOT open the outputs (another group of windows): the
    // channel is all it needs (Windows two-monitor test, 0.5.11)
    const other = createOutputs(h.endpoint());
    const got: string[] = [];
    const a = createOutputs(h.endpoint()).announce(
      () => info('w1', 'presenter', { opener: 'page-a' }),
      () => undefined,
      (c) => got.push(`w1:${JSON.stringify(c)}`),
    );
    const b = createOutputs(h.endpoint()).announce(
      () => info('w2'),
      () => undefined,
      (c) => got.push(`w2:${c.do}`),
    );
    other.command('w1', { do: 'move', to: { x: 1920, y: 0, w: 1600, h: 900 } });
    other.command('w2', { do: 'close' });
    other.command('w9', { do: 'focus' }); // gone: nobody answers
    await flush();
    expect(got).toEqual(['w1:{"do":"move","to":{"x":1920,"y":0,"w":1600,"h":900}}', 'w2:close']);
    a.stop();
    b.stop();
  });

  it('a slide that failed to draw in a window reaches the control windows (0.13.0)', async () => {
    const h = hub();
    const control = createOutputs(h.endpoint());
    const errors: string[] = [];
    const off = control.track(
      () => undefined,
      (id, message) => errors.push(`${id}: ${message}`),
    );
    const w = createOutputs(h.endpoint()).announce(
      () => info('w1'),
      () => undefined,
    );
    w.failed("Cannot read properties of null (reading 'length')");
    await flush();
    expect(errors).toEqual(["w1: Cannot read properties of null (reading 'length')"]);
    w.stop();
    off();
  });

  it('a window the browser kept out of fullscreen says so to the control windows (1.2.1)', async () => {
    const h = hub();
    const control = createOutputs(h.endpoint());
    const refused: string[] = [];
    const errors: string[] = [];
    const off = control.track(
      () => undefined,
      (id, message) => errors.push(`${id}: ${message}`),
      (id, message) => refused.push(`${id}: ${message}`),
    );
    const w = createOutputs(h.endpoint()).announce(
      () => info('w1'),
      () => undefined,
    );
    w.refused('Permissions check failed');
    await flush();
    expect(refused).toEqual(['w1: Permissions check failed']);
    expect(errors).toEqual([]);
    w.stop();
    off();
  });

  it('the tracked list keeps who opened each window', async () => {
    const h = hub();
    const control = createOutputs(h.endpoint());
    let list: TrackedOutput[] = [];
    const off = control.track((l) => (list = l));
    const a = createOutputs(h.endpoint()).announce(
      () => info('w1', 'presenter', { opener: 'page-a' }),
      () => undefined,
    );
    await flush();
    expect(list.map((o) => o.opener)).toEqual(['page-a']);
    a.stop();
    off();
  });

  it('numbers windows per kind in the order they opened', () => {
    const labels = outputLabels([info('w1'), info('w2', 'stage'), info('w3')]);
    expect([...labels.values()]).toEqual(['Показ 1', 'Сцена 1', 'Показ 2']);
  });
});

describe('screens', () => {
  const left: ScreenInfo = {
    key: 'a',
    label: 'Built-in',
    x: 0,
    y: 0,
    w: 1440,
    h: 900,
    primary: true,
    internal: true,
  };
  const right: ScreenInfo = {
    ...left,
    key: 'b',
    label: 'Projector',
    x: 1440,
    w: 1920,
    h: 1080,
    primary: false,
  };

  it('finds the screen holding a window by its centre', () => {
    expect(screenOf({ x: 1500, y: 10, w: 1800, h: 1000 }, [left, right])?.key).toBe('b');
    expect(screenOf({ x: 100, y: 100, w: 800, h: 600 }, [left, right])?.key).toBe('a');
    // mostly on the left screen even though it pokes onto the right one
    expect(screenOf({ x: 1000, y: 0, w: 600, h: 400 }, [left, right])?.key).toBe('a');
    expect(screenOf({ x: 9000, y: 0, w: 10, h: 10 }, [left, right])).toBeUndefined();
    expect(screenOf({ x: 9000, y: 0, w: 10, h: 10 }, [left])?.key).toBe('a'); // only one known
  });

  it('opens a window over a screen’s usable area', () => {
    expect(featuresFor(right)).toBe('popup,left=1440,top=0,width=1920,height=1080');
  });
});
