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

/** Names that could not be re-acquired just now (no window of that name any more). */
const missing = new Map<string, number>();
const RETRY_MS = 10_000;

/**
 * The window of this name even if this page didn't open it — after a reload of the
 * control window, or when another control window took over (Mac test, 1.4.5): the
 * references were in the old page. `window.open('', name)` hands back an existing
 * same-origin window of that name without navigating it. Call it only for a window
 * that is known to be open (it announces itself — lib/outputs.ts): for a name nobody
 * holds any more the browser would open a blank pop-up, which is closed at once.
 */
export function adoptOutput(name: string): Window | null {
  const held = windowRef(name);
  if (held) return held;
  if (!name.startsWith('vo-')) return null;
  const tried = missing.get(name);
  if (tried && Date.now() - tried < RETRY_MS) return null;
  missing.set(name, Date.now());
  // Ours and just closed: the list still shows it for a moment — don't open a blank one
  // (another window may take the name later; the next try, after RETRY_MS, adopts it).
  if (refs.has(name)) {
    refs.delete(name);
    return null;
  }
  try {
    const w = window.open('', name);
    if (!w) return null;
    // A window that did not exist comes back as a fresh about:blank (its origin reads
    // "null"): close it before anyone sees it.
    if (w.location.href === 'about:blank') {
      w.close();
      return null;
    }
    if (w.location.origin !== location.origin) return null;
    refs.set(name, w);
    missing.delete(name);
    return w;
  } catch {
    return null; // a cross-origin document under that name: not ours
  }
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
