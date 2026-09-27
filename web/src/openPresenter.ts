import type { OutputKind } from './lib/outputs';
import { featuresFor, listScreens, type ScreenInfo } from './lib/screens';

/**
 * Opening output windows (`/presenter`, `/stage`) and the settings window. With the
 * Window Management API (Chrome/Edge, one-time permission) a window goes to a chosen
 * screen — by default the first secondary one; otherwise a plain pop-up the user drags
 * over. The references of windows opened here are kept, so the control window can
 * focus, move and close them (the «Вікна виводу» panel).
 */

const PATH: Record<OutputKind, string> = { presenter: '/presenter', stage: '/stage' };
const FALLBACK: Record<OutputKind, string> = {
  presenter: 'width=1280,height=720',
  stage: 'width=1100,height=700',
};

const refs = new Map<string, Window>();

/** The window we opened under this name, if it's still open. */
export function windowRef(name: string): Window | null {
  const w = refs.get(name);
  return w && !w.closed ? w : null;
}

function place(w: Window, s: ScreenInfo): void {
  try {
    w.moveTo(s.x, s.y);
    w.resizeTo(s.w, s.h);
  } catch {
    /* the browser may refuse — the window stays where it is */
  }
}

/**
 * Open an output window. `screen` — where (default: the first secondary screen, if the
 * browser tells us about screens; asking may show its permission prompt, so call this
 * from a user action). `another` — a new window even if one of this kind is open;
 * otherwise the open one is brought forward (and moved, when a screen is given).
 */
export async function openOutput(
  kind: OutputKind,
  opts: { screen?: ScreenInfo; another?: boolean } = {},
): Promise<Window | null> {
  const name = opts.another ? `vo-${kind}-${Date.now().toString(36)}` : `vo-${kind}`;
  const open = windowRef(name);
  if (open) {
    if (opts.screen) place(open, opts.screen);
    open.focus();
    return open;
  }
  let screen = opts.screen;
  if (!screen) {
    const { screens } = await listScreens(true);
    screen = screens.find((s) => !s.primary);
  }
  const w = window.open(
    `${location.origin}${PATH[kind]}`,
    name,
    screen ? featuresFor(screen) : `popup,${FALLBACK[kind]}`,
  );
  if (w) {
    refs.set(name, w);
    if (screen) place(w, screen); // some browsers ignore left/top in the features
  }
  return w;
}

export function moveOutput(name: string, screen: ScreenInfo): boolean {
  const w = windowRef(name);
  if (!w) return false;
  place(w, screen);
  w.focus();
  return true;
}

export function focusOutput(name: string): boolean {
  const w = windowRef(name);
  w?.focus();
  return !!w;
}

export function closeOutput(name: string): boolean {
  const w = windowRef(name);
  w?.close();
  return !!w;
}

/** Open the presenter (audience) output window — on a secondary screen if possible. */
export function openPresenterWindow(another = false): Promise<Window | null> {
  return openOutput('presenter', { another });
}

/** Open the stage-display (operator/speaker confidence) window. */
export function openStageWindow(another = false): Promise<Window | null> {
  return openOutput('stage', { another });
}

/** Open the settings in a standalone window — on a secondary screen if possible. */
export async function openSettingsWindow(): Promise<Window | null> {
  const s = (await listScreens(true)).screens.find((x) => !x.primary);
  const at = s ? `,left=${s.x},top=${s.y}` : '';
  return window.open(
    `${location.origin}/settings`,
    'vo-settings',
    `popup,width=560,height=820${at}`,
  );
}
