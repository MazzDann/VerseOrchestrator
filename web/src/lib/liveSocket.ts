/**
 * Client side of the server's live hub (`/api/ws`, see server/src/live.ts): a WebSocket
 * that reconnects with capped exponential backoff, re-sends its `hello` (role) on every
 * connect, and reports whether it is up — so callers can fall back to HTTP polling only
 * while it's down.
 */
export interface LiveFrame {
  type: 'slide';
  version: number;
  slide: unknown;
  /** Follow-along is off / not started: show a notice, not the (cleared) slide. */
  paused?: boolean;
}

/** Any frame the hub sends (slide · welcome · denied · ack · revoked · command · remotes). */
export type HubFrame = { type: string } & Record<string, unknown>;

export interface LiveConnection {
  /** Send a JSON frame now; returns false while disconnected (caller decides what to show). */
  send: (frame: object) => boolean;
  stop: () => void;
}

/**
 * The longest wait between reconnect attempts (1.5.29). The hub is on this machine or the
 * local network, where a refused connect costs nothing; with a 10 s cap a remote stayed dead
 * for up to 10 s after the app came back (a viewer took 9.5 s after a 26 s outage).
 */
export const RETRY_CAP_MS = 2000;

export function connectLive(opts: {
  /** Sent on every (re)connect to claim a role: control / remote. Omit for a viewer. */
  hello?: object;
  onFrame?: (f: LiveFrame) => void;
  onMessage?: (f: HubFrame) => void;
  /** The socket went up or down — once per change, not on every failed retry (1.5.29). */
  onStatus?: (open: boolean) => void;
  /** Stop reconnecting when the server says we're not welcome (bad token, revoked). */
  stopOn?: (f: HubFrame) => boolean;
}): LiveConnection {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  /** Set while a reconnect attempt waits its turn — not while connecting or connected. */
  let timer: number | undefined;
  /** What `onStatus` last said (null: nothing yet). */
  let up: boolean | null = null;
  const report = (open: boolean) => {
    if (up === open) return;
    up = open;
    opts.onStatus?.(open);
  };

  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`;

  const open = () => {
    timer = undefined;
    if (closed) return;
    try {
      ws = new WebSocket(url);
    } catch {
      schedule();
      return;
    }
    ws.onopen = () => {
      retry = 0;
      if (opts.hello) ws?.send(JSON.stringify({ type: 'hello', ...opts.hello }));
      report(true);
    };
    ws.onmessage = (e) => {
      let f: HubFrame;
      try {
        f = JSON.parse(String(e.data)) as HubFrame;
      } catch {
        return; // ignore malformed frames
      }
      if (!f || typeof f.type !== 'string') return;
      if (f.type === 'slide' && typeof f.version === 'number')
        opts.onFrame?.(f as unknown as LiveFrame);
      opts.onMessage?.(f);
      if (opts.stopOn?.(f)) closed = true;
    };
    ws.onclose = () => {
      report(false);
      schedule();
    };
    ws.onerror = () => ws?.close();
  };

  const schedule = () => {
    if (closed) return;
    // 0.5 s, 1 s, then every 2 s — quick after a blip, and soon after the app is back.
    const delay = Math.min(RETRY_CAP_MS, 500 * 2 ** retry++);
    timer = window.setTimeout(open, delay);
  };

  // Back on the network, or back on screen (a phone unlocked, the tab brought forward — a
  // hidden page's timers run late): try at once instead of waiting for the next attempt.
  const retryNow = () => {
    if (closed || timer === undefined) return; // connected, connecting or stopped
    window.clearTimeout(timer);
    retry = 0;
    open();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') retryNow();
  };

  // Leaving the page (navigating away, closing — or into the back/forward cache): close the
  // socket at once. A page frozen in that cache kept it open and still answered the
  // server's pings, so a control window in charge never handed over (1.5.8). Coming back
  // from the cache connects again.
  const onHide = () => {
    window.clearTimeout(timer);
    timer = undefined;
    const w = ws;
    ws = null;
    if (w) {
      w.onclose = null; // no reconnect while the page is gone
      w.close();
    }
  };
  const onShow = (e: PageTransitionEvent) => {
    if (e.persisted && !closed && !ws) open();
  };
  window.addEventListener('pagehide', onHide);
  window.addEventListener('pageshow', onShow);
  window.addEventListener('online', retryNow);
  // fired at the document, bubbles to the window
  window.addEventListener('visibilitychange', onVisible);

  open();
  return {
    send: (frame) => {
      if (ws?.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(frame));
      return true;
    },
    stop: () => {
      closed = true;
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('online', retryNow);
      window.removeEventListener('visibilitychange', onVisible);
      // A stopped connection says nothing more: its close event arrives after the caller
      // has moved on (an effect re-run) and is not an outage (1.5.25).
      if (ws) ws.onclose = null;
      ws?.close();
    },
  };
}
