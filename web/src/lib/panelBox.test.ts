import { describe, expect, it } from 'vitest';
import {
  bottomHeightAfter,
  fitInView,
  growBox,
  placeInView,
  rememberPanelSize,
  resizeBox,
} from './panelBox';

// «Налаштування вигляду» where it opens in a 1120×500 window: at the right edge (Mac check)
const view = { w: 1120, h: 500 };
const atRight = { x: 708, y: 107, w: 400, h: 377 };

describe('a floating panel resized by its edges (1.4.6)', () => {
  it('the corner grip cannot grow a panel at the window’s edge — the left edge can', () => {
    // the grip ('se'): 4 px wider, 8 px taller at most
    expect(resizeBox(atRight, 'se', 120, 120, view)).toEqual({ x: 708, y: 107, w: 404, h: 385 });
    // the left edge moves the panel's origin: wider to the left, the right edge stays
    expect(resizeBox(atRight, 'w', -150, 0, view)).toEqual({ x: 558, y: 107, w: 550, h: 377 });
    // the top edge: taller upwards
    expect(resizeBox(atRight, 'n', 0, -60, view)).toEqual({ x: 708, y: 47, w: 400, h: 437 });
  });

  it('stays inside the window and keeps the minimum size', () => {
    // pulled past the window's left and top edges: stops 8 px short of them
    expect(resizeBox(atRight, 'nw', -2000, -2000, view)).toEqual({
      x: 8,
      y: 8,
      w: 1100,
      h: 476,
    });
    // pushed across itself: the minimum 260 × 160, the opposite edges where they were
    expect(resizeBox(atRight, 'nw', 2000, 2000, view)).toEqual({ x: 848, y: 324, w: 260, h: 160 });
    expect(resizeBox(atRight, 'se', -2000, -2000, view)).toEqual({
      x: 708,
      y: 107,
      w: 260,
      h: 160,
    });
  });

  it('a side edge changes only the width, the top or bottom only the height', () => {
    expect(resizeBox(atRight, 'e', -100, 50, view)).toEqual({ x: 708, y: 107, w: 300, h: 377 });
    expect(resizeBox(atRight, 's', 50, -100, view)).toEqual({ x: 708, y: 107, w: 400, h: 277 });
    expect(resizeBox(atRight, 'ne', -40, 20, view)).toEqual({ x: 708, y: 127, w: 360, h: 357 });
    expect(resizeBox(atRight, 'sw', -40, -20, view)).toEqual({ x: 668, y: 107, w: 440, h: 357 });
  });
});

describe('the grip’s arrow keys and the default size (1.4.6)', () => {
  // narrowed to the minimum and pushed to the window's right edge (the Mac measurement)
  const narrow = { x: 852, y: 107, w: 260, h: 377 };

  it('at the window’s right edge → moves the panel left to make the room', () => {
    let b = narrow;
    for (let i = 0; i < 3; i++) b = growBox(b, 16, 0, view);
    expect(b).toEqual({ x: 804, y: 107, w: 308, h: 377 });
  });

  it('at the bottom edge ↓ moves it up; away from the edges only the size changes', () => {
    expect(growBox({ x: 708, y: 115, w: 400, h: 377 }, 0, 16, view)).toEqual({
      x: 708,
      y: 99,
      w: 400,
      h: 393,
    });
    expect(growBox({ x: 100, y: 50, w: 400, h: 300 }, 16, 0, view)).toEqual({
      x: 100,
      y: 50,
      w: 416,
      h: 300,
    });
  });

  it('never leaves the window or goes below the minimums', () => {
    expect(growBox(narrow, -16, 0, view)).toEqual(narrow);
    expect(growBox({ x: 8, y: 8, w: 1104, h: 484 }, 16, 16, view)).toEqual({
      x: 8,
      y: 8,
      w: 1104,
      h: 484,
    });
  });

  it('the default size by a double-click at the window’s edge keeps the panel inside', () => {
    expect(placeInView({ x: 852, y: 107 }, 400, 377, view)).toEqual({ x: 712, y: 107 });
    // larger than the window: to its left / top edge
    expect(placeInView({ x: 300, y: 300 }, 2000, 900, view)).toEqual({ x: 8, y: 8 });
  });

  it('a size fits the window from its place; a natural height stays natural', () => {
    expect(fitInView({ w: 600, h: 600 }, { x: 708, y: 107 }, view)).toEqual({ w: 404, h: 385 });
    expect(fitInView({ w: 100, h: null }, { x: 8, y: 8 }, view)).toEqual({ w: 260, h: null });
  });
});

describe('the display panel’s height below the centre (1.4.6)', () => {
  // the operator's 450 in a 500 px window, which shows 250 of it
  it('a click on the handle (no move) keeps the stored height', () => {
    expect(bottomHeightAfter(450, 250, 250, 0)).toBe(450);
  });

  it('↑ or a drag up in a column with no room keeps the stored height', () => {
    expect(bottomHeightAfter(450, 250, 250, 16)).toBe(450);
    // a pixel won from the chapters above is still below what was stored
    expect(bottomHeightAfter(450, 250, 251, 300)).toBe(450);
  });

  it('growing with room stores what is shown (not past the column’s room)', () => {
    expect(bottomHeightAfter(280, 280, 296, 16)).toBe(296);
    expect(bottomHeightAfter(280, 280, 450, 400)).toBe(450);
    // from the 10rem minimum the panel was held at (a 20 px root), above the stored 160
    expect(bottomHeightAfter(160, 200, 216, 16)).toBe(216);
  });

  it('shrinking stores what is shown — smaller, as asked', () => {
    expect(bottomHeightAfter(450, 250, 234, -16)).toBe(234);
    expect(bottomHeightAfter(280, 280, 180, -100)).toBe(180);
  });

  it('↓ against the panel’s minimum keeps the stored height (the songs open above)', () => {
    expect(bottomHeightAfter(296, 160, 160, -16)).toBe(296);
    expect(bottomHeightAfter(160, 200, 200, -16)).toBe(160);
  });
});

describe('the separate settings window’s size (1.4.6)', () => {
  const storage = (init?: string) => {
    const m = new Map<string, string>(init === undefined ? [] : [['k', init]]);
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      read: () => JSON.parse(m.get('k') ?? 'null'),
    };
  };

  it('becomes the panel’s size; the panel’s place stays', () => {
    const s = storage(JSON.stringify({ x: 700, y: 90, w: 400, h: 377 }));
    rememberPanelSize('k', 620.4, 811.6, s);
    expect(s.read()).toEqual({ x: 700, y: 90, w: 620, h: 812 });
  });

  it('a panel never moved gets a size and no place (it opens where it would)', () => {
    const s = storage();
    rememberPanelSize('k', 560, 820, s);
    expect(s.read()).toEqual({ w: 560, h: 820 });
  });

  it('a garbled entry is replaced; a minimised window (0 × 0) changes nothing', () => {
    const s = storage('{oops');
    rememberPanelSize('k', 0, 0, s);
    expect(() => s.read()).toThrow();
    rememberPanelSize('k', 500, 600, s);
    expect(s.read()).toEqual({ w: 500, h: 600 });
  });

  it('a storage that throws is ignored', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(() => rememberPanelSize('k', 500, 600, broken)).not.toThrow();
  });
});
