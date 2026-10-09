import { describe, expect, it } from 'vitest';
import { createTabWatch } from './tabNotice';

/** A document whose visibility the test sets, timers it runs by hand. */
function setup() {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
  };
  const queue: (() => void)[] = [];
  const shown: string[] = [];
  const watch = createTabWatch(
    (kind) => shown.push(kind),
    doc as unknown as Document,
    (fn) => queue.push(fn),
  );
  const set = (v: DocumentVisibilityState) => {
    doc.visibilityState = v;
    for (const fn of [...listeners]) fn();
  };
  return { watch, shown, set, tick: () => queue.splice(0).forEach((fn) => fn()), listeners };
}

describe('an output window opened as a tab of the control window (LibreWolf, 2026-10-10)', () => {
  it('a window of its own: the control page stays visible — nothing to say', () => {
    const t = setup();
    t.watch('presenter');
    t.tick();
    t.set('hidden'); // covered later, say: not the opening
    t.set('visible');
    expect(t.shown).toEqual([]);
  });

  it('the control page hidden at once: said when the operator comes back — once', () => {
    const t = setup();
    t.watch('presenter');
    t.set('hidden'); // the tab took its place
    t.tick();
    expect(t.shown).toEqual([]); // not while nobody sees this page
    t.set('visible');
    expect(t.shown).toEqual(['presenter']);
    expect(t.listeners.size).toBe(0);
    // a second output, a tab again: no second notice in this page
    t.watch('stage');
    t.set('hidden');
    t.tick();
    t.set('visible');
    expect(t.shown).toEqual(['presenter']);
  });
});
