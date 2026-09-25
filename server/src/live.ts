import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * Live hub: the in-memory "what's on screen now" state plus a WebSocket push channel at
 * `/api/ws`. The control window still publishes over HTTP (`POST /api/live`, guarded as
 * local-only); every publish is pushed to connected viewers at once, replacing the 1.5 s
 * polling as the primary path (polling `GET /api/live` stays as the fallback).
 *
 * Wire format (JSON text frames), server → client:
 *   { type: 'slide', version: number, slide: unknown }
 * Viewers are read-only: anything a client sends is ignored for now.
 */

let liveState: unknown = null;
let liveVersion = 0;
let wss: WebSocketServer | null = null;

export const WS_PATH = '/api/ws';

export function getLive() {
  return { version: liveVersion, slide: liveState };
}

const slideFrame = () => JSON.stringify({ type: 'slide', ...getLive() });

/** Store a new live slide and push it to every open viewer socket. */
export function publishLive(slide: unknown): number {
  liveState = slide ?? null;
  liveVersion += 1;
  if (wss) {
    const frame = slideFrame();
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(frame);
    }
  }
  return liveVersion;
}

export function viewerCount(): number {
  return wss ? wss.clients.size : 0;
}

/** Attach the WebSocket endpoint to the HTTP server (upgrade on WS_PATH only). */
export function attachLiveHub(server: Server): void {
  wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss!.handleUpgrade(req, socket, head, (ws) => wss!.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    const alive = { v: true };
    ws.on('pong', () => (alive.v = true));
    (ws as WebSocket & { alive?: typeof alive }).alive = alive;
    // A freshly connected viewer gets the current slide immediately.
    ws.send(slideFrame());
  });

  // Heartbeat: drop sockets that stopped answering (phone slept, Wi-Fi changed) so the
  // client's reconnect logic kicks in and we don't push into dead connections.
  const beat = setInterval(() => {
    for (const client of wss!.clients) {
      const a = (client as WebSocket & { alive?: { v: boolean } }).alive;
      if (a && !a.v) {
        client.terminate();
        continue;
      }
      if (a) a.v = false;
      client.ping();
    }
  }, 25_000);
  wss.on('close', () => clearInterval(beat));
}
