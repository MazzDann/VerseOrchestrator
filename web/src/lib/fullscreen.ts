/**
 * Fullscreen for output windows, driven from the control window (1.4.7).
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

/** Output side: apply fullscreen requests from a same-origin window (the control). */
export function listenFullscreen(apply: (on: boolean) => void): () => void {
  const onMessage = (e: MessageEvent) => {
    if (e.origin === location.origin && isFullscreenWire(e.data)) apply(e.data.on);
  };
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
