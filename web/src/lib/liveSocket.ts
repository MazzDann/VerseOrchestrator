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

export function connectLive(opts: {
  /** Sent on every (re)connect to claim a role: control / remote. Omit for a viewer. */
  hello?: object;
  onFrame?: (f: LiveFrame) => void;
  onMessage?: (f: HubFrame) => void;
  onStatus?: (open: boolean) => void;
  /** Stop reconnecting when the server says we're not welcome (bad token, revoked). */
  stopOn?: (f: HubFrame) => boolean;
}): LiveConnection {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let timer: number | undefined;

  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`;

  const open = () => {
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
      opts.onStatus?.(true);
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
      opts.onStatus?.(false);
      schedule();
    };
    ws.onerror = () => ws?.close();
  };

  const schedule = () => {
    if (closed) return;
    // 0.5 s, 1 s, 2 s … capped at 10 s — quick after a blip, gentle when the server is down.
    const delay = Math.min(10_000, 500 * 2 ** retry++);
    timer = window.setTimeout(open, delay);
  };

  // Leaving the page (navigating away, closing — or into the back/forward cache): close the
  // socket at once. A page frozen in that cache kept it open and still answered the
  // server's pings, so a control window in charge never handed over (1.5.8). Coming back
  // from the cache connects again.
  const onHide = () => {
    window.clearTimeout(timer);
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
      ws?.close();
    },
  };
}
