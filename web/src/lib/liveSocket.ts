/**
 * Client side of the server's live hub (`/api/ws`, see server/src/live.ts): a WebSocket
 * that reconnects with capped exponential backoff and reports whether it is up, so
 * callers can fall back to HTTP polling only while it's down.
 */
export interface LiveFrame {
  type: 'slide';
  version: number;
  slide: unknown;
}

export function connectLive(opts: {
  onFrame: (f: LiveFrame) => void;
  onStatus: (open: boolean) => void;
}): () => void {
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
      opts.onStatus(true);
    };
    ws.onmessage = (e) => {
      try {
        const f = JSON.parse(String(e.data)) as LiveFrame;
        if (f && f.type === 'slide' && typeof f.version === 'number') opts.onFrame(f);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      opts.onStatus(false);
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

  open();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    ws?.close();
  };
}
