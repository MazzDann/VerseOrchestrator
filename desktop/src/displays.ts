/**
 * Where a window the control window opens goes, and whether it goes fullscreen — pure, so it is
 * tested without Electron (displays.test.ts).
 *
 * The web app opens an output window with `window.open(url, name, 'popup,left=…,top=…,width=…,
 * height=…')` on the screen it picked (lib/screens.ts, the Window Management API Electron grants).
 * A browser needs a click to go fullscreen; here the shell does it at once: an output window on a
 * screen other than the control window's opens fullscreen on that whole screen. On the control
 * window's own screen it stays a window (it would cover the operator).
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Display {
  id: number;
  bounds: Rect;
}

/** The output pages: the presentation window and the stage go fullscreen; the key never (OBS takes a window). */
export type OutputPage = 'presenter' | 'stage' | 'key' | null;

export function outputPage(url: string, origin: string): OutputPage {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.origin !== origin) return null;
  const m = /^\/(presenter|stage|key)\/?$/.exec(u.pathname);
  return m ? (m[1] as OutputPage) : null;
}

/** `left=…,top=…,width=…,height=…` from window.open's features; absent ones undefined. */
export function featureRect(features: string): Partial<Rect> {
  const out: Partial<Rect> = {};
  for (const part of features.split(',')) {
    const [k, v] = part.split('=').map((s) => s.trim().toLowerCase());
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (k === 'left' || k === 'screenx') out.x = n;
    else if (k === 'top' || k === 'screeny') out.y = n;
    else if (k === 'width') out.width = n;
    else if (k === 'height') out.height = n;
  }
  return out;
}

const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

/** The display a point is on — or, past every edge, the nearest one by its centre. */
export function displayAt(displays: Display[], x: number, y: number): Display | null {
  if (displays.length === 0) return null;
  const hit = displays.find((d) => contains(d.bounds, x, y));
  if (hit) return hit;
  const dist = (d: Display) =>
    Math.hypot(d.bounds.x + d.bounds.width / 2 - x, d.bounds.y + d.bounds.height / 2 - y);
  return [...displays].sort((a, b) => dist(a) - dist(b))[0];
}

export interface Placement {
  /** where the window opens */
  bounds: Rect;
  /** fullscreen on that display at once */
  fullscreen: boolean;
  display: Display | null;
}

/**
 * An output window's place: on the display its features point at (the screen the web app
 * picked), fullscreen when that is not the control window's display. Without a place in the
 * features: the first display that isn't the control window's, else a window beside it.
 */
export function placeOutput(
  page: OutputPage,
  features: string,
  displays: Display[],
  controlDisplay: Display | null,
): Placement {
  const f = featureRect(features);
  const asked = f.x !== undefined && f.y !== undefined ? displayAt(displays, f.x, f.y) : null;
  const display =
    asked ?? displays.find((d) => d.id !== controlDisplay?.id) ?? controlDisplay ?? null;
  const other = !!display && display.id !== controlDisplay?.id;
  const fullscreen = page !== 'key' && page !== null && other;
  const bounds: Rect =
    display && (fullscreen || f.width === undefined)
      ? fullscreen
        ? { ...display.bounds }
        : {
            x: display.bounds.x + 80,
            y: display.bounds.y + 80,
            width: Math.min(960, display.bounds.width - 160),
            height: Math.min(540, display.bounds.height - 160),
          }
      : {
          x: f.x ?? 80,
          y: f.y ?? 80,
          width: f.width ?? 960,
          height: f.height ?? 540,
        };
  return { bounds, fullscreen, display };
}
