import {
  CONTROL_PAGE_ID,
  currentOutputs,
  outputs,
  waitForNewOutput,
  type OutputInfo,
  type OutputKind,
} from './lib/outputs';
import { featuresFor, listScreens, type ScreenInfo } from './lib/screens';
import { delegateFullscreen } from './lib/fullscreen';
import { useSettings } from './settingsStore';

/**
 * Opening output windows (`/presenter`, `/stage`) and the settings window. With the
 * Window Management API (Chrome/Edge, one-time permission) a window goes to a chosen
 * screen — by default the first secondary one; otherwise a plain pop-up the user drags
 * over. The «Вікна виводу» panel moves and closes output windows by COMMANDS they carry
 * out on themselves (0.5.11, lib/outputs.ts) — any control window, whichever opened them;
 * the references of windows opened here serve focusing and going fullscreen.
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
 * control window, or when another control window took over (Mac test, 0.5.5): the
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
 * Windows opened with «Відкривати на весь екран», waiting for a click to lend them: the
 * click that opened a window is used up by `window.open`, so the operator's next click
 * anywhere in this window (picking a verse, say) sends them fullscreen — one window per
 * click, since delegating uses the click up. A window stays pending until it is
 * fullscreen or closed (1 min at most).
 */
const pending = new Map<string, number>();
const PENDING_MS = 60_000;
let clickHook = false;

function lendNextClick(name: string): void {
  pending.set(name, Date.now());
  if (clickHook) return;
  clickHook = true;
  window.addEventListener(
    'click',
    () => {
      for (const [n, since] of pending) {
        const w = windowRef(n);
        if (!w || isFullscreen(w) || Date.now() - since > PENDING_MS) {
          pending.delete(n);
          continue;
        }
        // The window may still be loading, or this click is already lent: next click.
        if (delegateFullscreen(w, true)) break;
      }
    },
    true,
  );
}

/** Is `w` fullscreen right now? (same origin — readable; anything else counts as no) */
function isFullscreen(w: Window): boolean {
  try {
    return !!w.document.fullscreenElement;
  } catch {
    return false;
  }
}

type Target = Pick<OutputInfo, 'id' | 'name' | 'opener'>;

/**
 * Our reference to an output window — only for one this control page opened (it reports
 * its opener): another group's window can't be reached by name, and asking would open
 * a blank pop-up instead.
 */
export function outputRef(o: Target): Window | null {
  return o.opener === CONTROL_PAGE_ID ? adoptOutput(o.name) : null;
}

/**
 * Fullscreen on / off for an output window. On: from a click handler in this window,
 * whose gesture is lent to it (lib/fullscreen.ts) — needs our reference; false when
 * there is none or the browser can't delegate (the window still takes F / a click).
 * Off needs no gesture: the window is told to leave.
 */
export function fullscreenOutput(o: Target, on: boolean): boolean {
  if (!on) {
    outputs?.command(o.id, { do: 'exitFullscreen' });
    return true;
  }
  const w = outputRef(o);
  return !!w && delegateFullscreen(w, true);
}

/** How long a window opened with `noopener` may take to announce itself (dev build: ~1–3 s). */
const ANNOUNCE_MS = 10_000;

/**
 * Open an output window; resolves to whether it opened (false: the browser blocked it).
 * `screen` — where (default: the first secondary screen, if the browser tells us about
 * screens; asking may show its permission prompt, so call this from a user action).
 * `another` — a new window even if one of this kind is open; otherwise the open one is
 * brought forward (and moved, when a screen is given). `fullscreen` (default: the
 * «Відкривати на весь екран» setting) — an open window is asked at once; a new one gets
 * the operator's next click (Chrome/Edge, lib/fullscreen.ts). With «Окремий процес»
 * (0.5.13) the window opens with `noopener` — see openSeparate.
 */
export async function openOutput(
  kind: OutputKind,
  opts: { screen?: ScreenInfo; another?: boolean; fullscreen?: boolean } = {},
): Promise<boolean> {
  const name = opts.another ? `vo-${kind}-${Date.now().toString(36)}` : `vo-${kind}`;
  const settings = useSettings.getState().outputs;
  if (settings.separate) return openSeparate(kind, name, opts);
  const fullscreen = opts.fullscreen ?? settings.fullscreen;
  const open = windowRef(name);
  if (open) {
    if (opts.screen) place(open, opts.screen);
    open.focus();
    if (fullscreen && !isFullscreen(open)) delegateFullscreen(open, true);
    return true;
  }
  const screen = opts.screen ?? (await defaultScreen());
  const w = window.open(
    `${location.origin}${PATH[kind]}`,
    name,
    screen ? featuresFor(screen) : `popup,${FALLBACK[kind]}`,
  );
  if (w) {
    refs.set(name, w);
    if (screen) place(w, screen); // some browsers ignore left/top in the features
    if (fullscreen) lendNextClick(name);
  }
  return !!w;
}

async function defaultScreen(): Promise<ScreenInfo | undefined> {
  const { screens } = await listScreens(true);
  return screens.find((s) => !s.primary);
}

/**
 * «Окремий процес для кожного вікна» (0.5.13): `noopener` puts the window in a browsing
 * context group of its own — its own renderer in Chrome/Edge, so a crash there leaves the
 * control window and the other outputs running (Windows test). The price: no reference
 * back (window.open returns null), so it counts as opened once it announces itself, it
 * is placed / brought forward by bus commands, and it goes fullscreen by F / a click in
 * it. An open window of this kind is brought forward instead of opening a second one.
 */
async function openSeparate(
  kind: OutputKind,
  name: string,
  opts: { screen?: ScreenInfo; another?: boolean },
): Promise<boolean> {
  const open = opts.another ? null : currentOutputs().find((o) => o.kind === kind);
  if (open) {
    if (opts.screen) moveOutput(open, opts.screen);
    focusOutput(open);
    return true;
  }
  const screen = opts.screen ?? (await defaultScreen());
  const before = new Set(currentOutputs().map((o) => o.id));
  window.open(
    `${location.origin}${PATH[kind]}`,
    name,
    `${screen ? featuresFor(screen) : `popup,${FALLBACK[kind]}`},noopener`,
  );
  const o = await waitForNewOutput(kind, before, ANNOUNCE_MS);
  // some browsers ignore left/top in the features: put it there by command
  if (o && screen && (o.bounds.x !== screen.x || o.bounds.y !== screen.y)) moveOutput(o, screen);
  return !!o;
}

/** Move an output window to a screen — it leaves fullscreen and moves itself. */
export function moveOutput(o: Target, s: ScreenInfo): void {
  outputs?.command(o.id, { do: 'move', to: { x: s.x, y: s.y, w: s.w, h: s.h } });
}

/**
 * Bring an output window forward. With our reference the browser does it; otherwise the
 * window is asked to focus itself, which browsers may ignore — false then (the panel
 * shows the window's number on it instead).
 */
export function focusOutput(o: Target): boolean {
  const w = outputRef(o);
  if (w) {
    w.focus();
    return true;
  }
  outputs?.command(o.id, { do: 'focus' });
  return false;
}

/** Close an output window — it closes itself (a script-opened window may). */
export function closeOutput(o: Target): void {
  outputs?.command(o.id, { do: 'close' });
}

/** Open the presenter (audience) output window — on a secondary screen if possible. */
export function openPresenterWindow(another = false): Promise<boolean> {
  return openOutput('presenter', { another });
}

/** Open the stage-display (operator/speaker confidence) window. */
export function openStageWindow(another = false): Promise<boolean> {
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
