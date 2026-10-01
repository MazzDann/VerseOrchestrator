/**
 * A floating panel's box (components/FloatingPanel): where it may stand and how large it may
 * be inside the window; and the height kept for the display panel below the centre (Control).
 */

/** Room kept between a panel and the window's edges. */
export const PANEL_MARGIN = 8;
export const PANEL_MIN_W = 260;
export const PANEL_MIN_H = 160;

/** Which edge or corner a resize pulls: the corner grip is 'se'; the others since 1.4.6. */
export type PanelEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface PanelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The panel's box after pulling `edge` by (dx, dy) from `start`, in a window `view` large:
 * a pulled edge stays inside the window and the panel keeps its minimum size. The left and
 * top edges move the panel's origin — a panel at the window's right or bottom edge (where it
 * opens by default) could not grow from its corner grip at all (Mac check, 1.4.6).
 */
export function resizeBox(
  start: PanelBox,
  edge: PanelEdge,
  dx: number,
  dy: number,
  view: { w: number; h: number },
): PanelBox {
  let { x, y, w, h } = start;
  if (edge.includes('e'))
    w = Math.max(PANEL_MIN_W, Math.min(start.w + dx, view.w - PANEL_MARGIN - start.x));
  if (edge.includes('s'))
    h = Math.max(PANEL_MIN_H, Math.min(start.h + dy, view.h - PANEL_MARGIN - start.y));
  if (edge.includes('w')) {
    const right = start.x + start.w;
    x = Math.max(PANEL_MARGIN, Math.min(start.x + dx, right - PANEL_MIN_W));
    w = right - x;
  }
  if (edge.includes('n')) {
    const bottom = start.y + start.h;
    y = Math.max(PANEL_MARGIN, Math.min(start.y + dy, bottom - PANEL_MIN_H));
    h = bottom - y;
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

export interface PanelPoint {
  x: number;
  y: number;
}

/** The window's inner size, as the functions here take it. */
export interface PanelView {
  w: number;
  h: number;
}

/**
 * Where a panel `w` × `h` large may stand: `p` moved inside the window, PANEL_MARGIN from its
 * edges; a panel larger than the window keeps to its left / top edge.
 */
export function placeInView(p: PanelPoint, w: number, h: number, view: PanelView): PanelPoint {
  const maxX = Math.max(PANEL_MARGIN, view.w - w - PANEL_MARGIN);
  const maxY = Math.max(PANEL_MARGIN, view.h - h - PANEL_MARGIN);
  return {
    x: Math.min(Math.max(PANEL_MARGIN, p.x), maxX),
    y: Math.min(Math.max(PANEL_MARGIN, p.y), maxY),
  };
}

/** A size `s` that fits the window from `p`, never below the minimums; `h` null = natural. */
export function fitInView(
  s: { w: number; h: number },
  p: PanelPoint,
  view: PanelView,
): { w: number; h: number };
export function fitInView(
  s: { w: number; h: number | null },
  p: PanelPoint,
  view: PanelView,
): { w: number; h: number | null };
export function fitInView(s: { w: number; h: number | null }, p: PanelPoint, view: PanelView) {
  const maxW = Math.max(PANEL_MIN_W, view.w - p.x - PANEL_MARGIN);
  const maxH = Math.max(PANEL_MIN_H, view.h - p.y - PANEL_MARGIN);
  return {
    w: Math.min(Math.max(PANEL_MIN_W, s.w), maxW),
    h: s.h === null ? null : Math.min(Math.max(PANEL_MIN_H, s.h), maxH),
  };
}

/**
 * The corner grip's arrow keys: `box` grown by (dx, dy). At the window's right or bottom edge —
 * where a panel opens by default — it moves left / up to make the room (1.4.6); it never leaves
 * the window or goes below the minimums.
 */
export function growBox(box: PanelBox, dx: number, dy: number, view: PanelView): PanelBox {
  const want = { w: box.w + dx, h: box.h + dy };
  const p = placeInView(box, want.w, want.h, view);
  return { ...p, ...fitInView(want, p, view) };
}

/**
 * The display panel below the centre (Control, 1.4.6): the height to keep after a resize that
 * asked for `delta` px more (a drag or an arrow key; 0 — a click that did not move) and took the
 * panel from `from` to `shown` px. A short column — a short window, the songs open above — shows
 * less than the operator's `stored` height, and that squeezed height must not replace it, or the
 * panel would stay small once there is room again: what is shown is kept only when the panel
 * moved the way asked (growing: never below the stored height); a click, or a step the column
 * had no room for, changes nothing.
 */
export function bottomHeightAfter(
  stored: number,
  from: number,
  shown: number,
  delta: number,
): number {
  if (delta > 0 && shown > from) return Math.max(stored, shown);
  if (delta < 0 && shown < from) return Math.min(stored, shown);
  return stored;
}

/** Where «Налаштування вигляду» keeps its place and size (Control's FloatingPanel). */
export const SETTINGS_PANEL_KEY = 'vo:settingsPanelPos';

/**
 * Keep a size for a panel's next opening — the separate settings window gives the one the
 * operator dragged it to (1.4.6): it opens in the panel's place with the panel's size
 * (openSettingsWindow), so the panel takes it on, and the window opens with it next time.
 * The panel's place stays as it was.
 */
export function rememberPanelSize(
  key: string,
  w: number,
  h: number,
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): void {
  if (!(w > 0 && h > 0)) return;
  try {
    let was: Record<string, unknown> = {};
    try {
      const v: unknown = JSON.parse(storage.getItem(key) ?? 'null');
      if (v && typeof v === 'object' && !Array.isArray(v)) was = v as Record<string, unknown>;
    } catch {
      /* a garbled entry: start afresh */
    }
    storage.setItem(key, JSON.stringify({ ...was, w: Math.round(w), h: Math.round(h) }));
  } catch {
    /* storage unavailable — the panel keeps its default size */
  }
}
