/**
 * The screens attached to this computer (1.3.2), via the Window Management API
 * (`getScreenDetails`, Chrome/Edge — a one-time permission). Without it (another browser,
 * permission denied) only the current screen is known and windows open where the
 * browser puts them.
 */

export interface ScreenInfo {
  /** stable enough to find the same screen again in a saved layout */
  key: string;
  label: string;
  /** the usable area (without the taskbar/dock), in screen coordinates */
  x: number;
  y: number;
  w: number;
  h: number;
  primary: boolean;
  internal: boolean;
}

export type ScreenAccess = 'granted' | 'prompt' | 'denied' | 'unsupported';

interface ScreenDetailed {
  label?: string;
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  left: number;
  top: number;
  width: number;
  height: number;
  isPrimary: boolean;
  isInternal: boolean;
}

interface ScreenDetails extends EventTarget {
  screens: ScreenDetailed[];
}

type WithScreens = { getScreenDetails?: () => Promise<ScreenDetails> };

export const screensSupported = () =>
  typeof (window as unknown as WithScreens).getScreenDetails === 'function';

export async function screenAccess(): Promise<ScreenAccess> {
  if (!screensSupported()) return 'unsupported';
  for (const name of ['window-management', 'window-placement']) {
    try {
      const s = await navigator.permissions.query({ name: name as PermissionName });
      return s.state as ScreenAccess;
    } catch {
      /* older name, or not queryable */
    }
  }
  return 'prompt';
}

function toInfo(s: ScreenDetailed, i: number): ScreenInfo {
  const label = s.label || (s.isPrimary ? 'Основний екран' : `Екран ${i + 1}`);
  return {
    key: `${label}|${s.left},${s.top}|${s.width}x${s.height}`,
    label,
    x: s.availLeft,
    y: s.availTop,
    w: s.availWidth,
    h: s.availHeight,
    primary: s.isPrimary,
    internal: s.isInternal,
  };
}

/** The current screen only — what every browser can tell. */
function currentScreen(): ScreenInfo {
  const s = window.screen as Screen & { availLeft?: number; availTop?: number };
  return {
    key: 'current',
    label: 'Цей екран',
    x: s.availLeft ?? 0,
    y: s.availTop ?? 0,
    // a hidden or embedded page may report 0 — fall back to what else is known
    w: s.availWidth || s.width || window.outerWidth,
    h: s.availHeight || s.height || window.outerHeight,
    primary: true,
    internal: false,
  };
}

let details: ScreenDetails | null = null;

/**
 * The screens, primary first. `ask` = true may show the browser's permission prompt, so
 * pass it only from a user action; otherwise without permission → the current screen.
 */
export async function listScreens(
  ask = false,
): Promise<{ access: ScreenAccess; screens: ScreenInfo[] }> {
  const access = await screenAccess();
  if (access === 'unsupported' || access === 'denied' || (access === 'prompt' && !ask)) {
    return { access, screens: [currentScreen()] };
  }
  try {
    details ??= await (window as unknown as WithScreens).getScreenDetails!();
    const screens = details.screens
      .map(toInfo)
      .sort((a, b) => Number(b.primary) - Number(a.primary));
    return { access: 'granted', screens };
  } catch {
    return { access: await screenAccess(), screens: [currentScreen()] };
  }
}

/** Screens plugged in/out or rearranged (only after access was granted). */
export function onScreensChange(cb: () => void): () => void {
  if (!details) return () => undefined;
  details.addEventListener('screenschange', cb);
  return () => details?.removeEventListener('screenschange', cb);
}

/** Which screen a window is on: the one holding the centre of its bounds. */
export function screenOf(
  b: { x: number; y: number; w: number; h: number },
  screens: ScreenInfo[],
): ScreenInfo | undefined {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return (
    screens.find((s) => cx >= s.x && cx < s.x + s.w && cy >= s.y && cy < s.y + s.h) ??
    (screens.length === 1 ? screens[0] : undefined)
  );
}

/** window.open features that fill a screen's usable area. */
export function featuresFor(s: ScreenInfo): string {
  return `popup,left=${s.x},top=${s.y},width=${s.w},height=${s.h}`;
}
