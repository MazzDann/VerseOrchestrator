/**
 * Fullscreen for output windows, driven from the control window (0.5.7).
 *
 * `requestFullscreen()` only works from a user gesture in the SAME window, so a window
 * we have just opened can't go fullscreen by itself. Chrome (and Edge) let one window
 * hand its gesture to another — capability delegation: `postMessage(msg, { delegate:
 * 'fullscreen' })` from a click handler here, then `requestFullscreen()` inside the
 * output window's `message` handler. Verified on the Mac (Chrome 154): works up to
 * ~5 s after the click — enough to open a window, let it load and put it fullscreen;
 * refused without a gesture. Browsers without delegation (Safari, Firefox) throw on
 * the option or ignore it — there the output window keeps its own F / click toggle.
 *
 * Opening a window straight into fullscreen is not possible with one click:
 * `window.open` CONSUMES the click, the new window inherits no activation (checked:
 * `navigator.userActivation.isActive` is false on load, `requestFullscreen` → «Permissions
 * check failed»), and Chrome's `fullscreen` window feature opened a plain window here.
 * So «Відкривати на весь екран» works with the operator's NEXT click in the control
 * window: that click is lent to every freshly opened window (openPresenter.ts).
 */

export const FULLSCREEN_MSG = 'vo-fullscreen';

export interface FullscreenWire {
  t: typeof FULLSCREEN_MSG;
  on: boolean;
}

export function isFullscreenWire(d: unknown): d is FullscreenWire {
  return (
    !!d &&
    typeof d === 'object' &&
    (d as FullscreenWire).t === FULLSCREEN_MSG &&
    typeof (d as FullscreenWire).on === 'boolean'
  );
}

/** Output side: enter or leave fullscreen in this window — rejects when the browser refuses. */
export async function setOwnFullscreen(on: boolean): Promise<void> {
  if (on === !!document.fullscreenElement) return;
  if (!on) return document.exitFullscreen();
  if (!document.documentElement.requestFullscreen) throw new Error('Fullscreen API unavailable');
  return document.documentElement.requestFullscreen();
}

/** F or a click in the output window: its own gesture, and the operator sees the result there. */
export function toggleOwnFullscreen(): void {
  setOwnFullscreen(!document.fullscreenElement).catch(() => undefined);
}

type RefusedListener = (message: string) => void;
const refused = new Set<RefusedListener>();

/**
 * Output side: the browser refused a request the control window sent (1.2.1). Seen on a
 * Mac with a presenter behind other windows: «Permissions check failed», and the operator
 * never knew. The window passes it on (lib/outputs.ts), the control window says what to do.
 */
export function onFullscreenRefused(cb: RefusedListener): () => void {
  refused.add(cb);
  return () => {
    refused.delete(cb);
  };
}

/**
 * Output side: carry out one message if it is a fullscreen request from `origin` (the
 * control window's), and report a refusal. Returns the attempt, for tests.
 */
export function handleFullscreenMessage(
  e: Pick<MessageEvent, 'origin' | 'data'>,
  origin: string,
  apply: (on: boolean) => Promise<void> = setOwnFullscreen,
): Promise<void> | undefined {
  if (e.origin !== origin || !isFullscreenWire(e.data)) return undefined;
  return apply(e.data.on).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    for (const l of refused) l(message);
  });
}

/** Output side: apply fullscreen requests from a same-origin window (the control). */
export function listenFullscreen(): () => void {
  const onMessage = (e: MessageEvent) => void handleFullscreenMessage(e, location.origin);
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

/**
 * Control side: ask `w` to enter (or leave) fullscreen, lending it this window's user
 * gesture. Call it from a click handler. False = the browser has no delegation, or the
 * gesture has expired — the window can still go fullscreen with F / a click in it.
 */
export function delegateFullscreen(w: Window, on: boolean): boolean {
  const msg: FullscreenWire = { t: FULLSCREEN_MSG, on };
  try {
    w.postMessage(msg, {
      targetOrigin: location.origin,
      delegate: 'fullscreen',
    } as WindowPostMessageOptions);
    return true;
  } catch {
    return false;
  }
}
