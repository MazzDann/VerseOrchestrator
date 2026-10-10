import { describe, expect, it } from 'vitest';
import { createChooserWatch } from './chooserWatch';

/** Outputs whose full-screen state the test sets, a clock it runs by hand. */
function setup() {
  const outs = [
    { id: 'p1', name: 'vo-presenter', fullscreen: true },
    { id: 's1', name: 'vo-stage', fullscreen: true },
    { id: 'p2', name: 'vo-presenter-x', fullscreen: false },
  ];
  const dropped: string[] = [];
  const queue: (() => void)[] = [];
  const watch = createChooserWatch({
    outputs: () => outs,
    dropped: (o) => dropped.push(o.id),
    later: (fn) => queue.push(fn),
  });
  const settle = () => queue.splice(0).forEach((fn) => fn());
  return { outs, dropped, watch, settle };
}

describe('a file chooser and the full-screen outputs (2026-10-10)', () => {
  it('reports the outputs a chooser took out of full screen — once', () => {
    const { outs, dropped, watch, settle } = setup();
    watch.opening();
    // Chromium drops them while the chooser is open
    outs[0].fullscreen = false;
    outs[1].fullscreen = false;
    watch.closed(); // the window has the focus again
    watch.closed(); // … and the input's change: the same chooser
    settle();
    expect(dropped).toEqual(['p1', 's1']); // not p2: it wasn't full screen before
  });

  it('nothing to say when nothing left full screen, or nothing was full screen', () => {
    const a = setup();
    a.watch.opening();
    a.watch.closed();
    a.settle();
    expect(a.dropped).toEqual([]);
    const b = setup();
    for (const o of b.outs) o.fullscreen = false;
    b.watch.opening();
    b.watch.closed();
    b.settle();
    expect(b.dropped).toEqual([]);
  });

  it('the focus coming back without a chooser says nothing', () => {
    const { outs, dropped, watch, settle } = setup();
    outs[0].fullscreen = false; // the operator pressed F in it: not ours to undo
    watch.closed();
    settle();
    expect(dropped).toEqual([]);
  });

  it('an output back in full screen by the time it settles is left alone', () => {
    const { outs, dropped, watch, settle } = setup();
    watch.opening();
    outs[0].fullscreen = false;
    watch.closed();
    outs[0].fullscreen = true;
    settle();
    expect(dropped).toEqual([]);
  });
});
