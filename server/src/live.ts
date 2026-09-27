import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { isLocalRequest } from './access.js';
import { findByToken, getPairing, isRemoteCommand, type RemoteCommand } from './remote.js';

/**
 * Live hub: the in-memory "what's on screen now" state plus a WebSocket channel at
 * `/api/ws`. The control window still publishes slides over HTTP (`POST /api/live`,
 * local-only); every publish is pushed to connected sockets at once (GET /api/live is
 * the polling fallback).
 *
 * Every socket starts as a read-only VIEWER. It can upgrade with a hello:
 *   { type: 'hello', role: 'control' }        — only from this machine + same origin
 *   { type: 'hello', role: 'remote', token }  — a paired speaker remote (remote.ts)
 * A remote may then send { type: 'command', cmd } for the commands its pairing allows;
 * the hub forwards them to the control socket(s) as { type: 'command', cmd, from }.
 * The control socket publishes the audience slide with { type: 'publish', slide } (or
 * { type: 'publish', paused: true } when follow-along is switched off) and reports
 * { type: 'screen', screen, next } (compact summaries) whenever
 * the output changes; the hub relays it to remotes only (never to audience viewers), and
 * sends control sockets { type: 'viewers', count } whenever the audience count changes.
 *
 * Server → client frames: slide · welcome · denied · ack · revoked · remotes (control only:
 * "the remote list/online state changed, refetch").
 */

type Role = 'viewer' | 'control' | 'remote';
interface Meta {
  role: Role;
  alive: boolean;
  pairingId?: string;
  /** Command timestamps in the last second, for rate limiting. */
  recent: number[];
}

let liveState: unknown = null;
let liveVersion = 0;
/**
 * Audience follow-along is OFF (or not started yet): viewers show a «paused» notice
 * instead of freezing on whatever was last published. Starts paused — nothing is
 * broadcast until the operator switches follow-along on.
 */
let livePaused = true;
/**
 * What the output window shows now and what «Далі» would show — compact summaries sent
 * by the control socket for REMOTES only. Separate from liveState on purpose: the
 * audience follow-along is opt-in (the operator may keep it off), but a speaker's
 * remote always needs to see what's on screen.
 */
let screenState: { screen: unknown; next: unknown } = { screen: null, next: null };
let wss: WebSocketServer | null = null;
const meta = new WeakMap<WebSocket, Meta>();

export const WS_PATH = '/api/ws';
const MAX_COMMANDS_PER_SEC = 8;
/** Frames from clients: a whole long passage in several translations can exceed tens of
 * KB — an oversized frame makes ws close the socket, so leave generous headroom. */
const MAX_FRAME_BYTES = 256 * 1024;

export function getLive() {
  return { version: liveVersion, slide: liveState, paused: livePaused };
}

const slideFrame = () => JSON.stringify({ type: 'slide', ...getLive() });
const send = (ws: WebSocket, frame: object) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
};
const sockets = (role?: Role) =>
  wss ? [...wss.clients].filter((c) => !role || meta.get(c)?.role === role) : [];

/** Store a new live slide and push it to every open socket (this also un-pauses). */
export function publishLive(slide: unknown): number {
  liveState = slide ?? null;
  livePaused = false;
  return pushLive();
}

/** Follow-along switched off: clear the slide so phones stop showing stale text. */
export function pauseLive(): number {
  liveState = null;
  livePaused = true;
  return pushLive();
}

function pushLive(): number {
  liveVersion += 1;
  const frame = slideFrame();
  for (const c of sockets()) if (c.readyState === WebSocket.OPEN) c.send(frame);
  return liveVersion;
}

/** Audience sockets (not the control window, not remotes). */
export function viewerCount(): number {
  return sockets('viewer').length;
}

/** Tell control windows how many audience phones are connected right now. */
function notifyViewers(): void {
  const frame = { type: 'viewers', count: viewerCount() };
  for (const c of sockets('control')) send(c, frame);
}

export function isRemoteOnline(pairingId: string): boolean {
  return sockets('remote').some((c) => meta.get(c)?.pairingId === pairingId);
}

/** Tell control windows to refetch the remote list (pairing added/removed/connected). */
export function notifyRemotesChanged(): void {
  for (const c of sockets('control')) send(c, { type: 'remotes' });
}

/** Disconnect every socket of a revoked pairing. */
export function dropRemote(pairingId: string): void {
  for (const c of sockets('remote')) {
    if (meta.get(c)?.pairingId === pairingId) {
      send(c, { type: 'revoked' });
      c.close(4001, 'revoked');
    }
  }
  notifyRemotesChanged();
}

/** Origin must match Host: blocks other sites (open in the operator's browser) from
 * opening a control socket — browsers don't apply CORS to WebSockets. */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function onHello(ws: WebSocket, m: Meta, req: IncomingMessage, msg: Record<string, unknown>) {
  if (msg.role === 'control') {
    if (!isLocalRequest(req) || !sameOrigin(req)) {
      send(ws, { type: 'denied', reason: 'Керування доступне лише з цього комп’ютера' });
      return;
    }
    m.role = 'control';
    send(ws, { type: 'welcome', role: 'control' });
    notifyViewers(); // this socket stopped counting as a viewer; also primes the new control
    return;
  }
  if (msg.role === 'remote') {
    const p = findByToken(msg.token);
    if (!p) {
      send(ws, { type: 'denied', reason: 'Пульт не знайдено або його відкликано' });
      ws.close(4003, 'bad token');
      return;
    }
    m.role = 'remote';
    m.pairingId = p.id;
    p.lastSeen = Date.now();
    send(ws, { type: 'welcome', role: 'remote', name: p.name, allowed: p.allowed });
    send(ws, { type: 'screen', ...screenState });
    notifyRemotesChanged();
    notifyViewers();
  }
}

function onCommand(ws: WebSocket, m: Meta, msg: Record<string, unknown>) {
  const cmd = msg.cmd;
  const p = m.role === 'remote' && m.pairingId ? getPairing(m.pairingId) : undefined;
  if (!p) return send(ws, { type: 'ack', cmd, ok: false, reason: 'Немає доступу' });
  if (!isRemoteCommand(cmd) || !p.allowed.includes(cmd)) {
    return send(ws, { type: 'ack', cmd, ok: false, reason: 'Ця дія пульту не дозволена' });
  }
  const now = Date.now();
  m.recent = m.recent.filter((t) => now - t < 1000);
  if (m.recent.length >= MAX_COMMANDS_PER_SEC) {
    return send(ws, { type: 'ack', cmd, ok: false, reason: 'Забагато натискань' });
  }
  m.recent.push(now);
  p.lastSeen = now;
  const controls = sockets('control');
  if (controls.length === 0) {
    return send(ws, { type: 'ack', cmd, ok: false, reason: 'Вікно керування не відкрите' });
  }
  for (const c of controls) send(c, { type: 'command', cmd: cmd as RemoteCommand, from: p.name });
  send(ws, { type: 'ack', cmd, ok: true });
}

/** Attach the WebSocket endpoint to the HTTP server (upgrade on WS_PATH only). */
export function attachLiveHub(server: Server): void {
  wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES });

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss!.handleUpgrade(req, socket, head, (ws) => wss!.emit('connection', ws, req));
  });

  wss.on('connection', (ws, req: IncomingMessage) => {
    const m: Meta = { role: 'viewer', alive: true, recent: [] };
    meta.set(ws, m);
    ws.on('pong', () => (m.alive = true));
    ws.on('message', (data) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (msg?.type === 'hello') onHello(ws, m, req, msg);
      else if (msg?.type === 'command') onCommand(ws, m, msg);
      else if (msg?.type === 'publish' && m.role === 'control') {
        // Audience follow-along over the control socket (HTTP POST /api/live is the fallback).
        if (msg.paused === true) pauseLive();
        else publishLive(msg.slide ?? null);
      } else if (msg?.type === 'screen' && m.role === 'control') {
        screenState = { screen: msg.screen ?? null, next: msg.next ?? null };
        for (const c of sockets('remote')) send(c, { type: 'screen', ...screenState });
      }
    });
    ws.on('close', () => {
      if (m.role === 'remote') notifyRemotesChanged();
      if (m.role === 'viewer') notifyViewers();
    });
    // Everyone gets the current slide immediately (viewers read it, remotes show it).
    ws.send(slideFrame());
    notifyViewers();
  });

  // Heartbeat: drop sockets that stopped answering (phone slept, Wi-Fi changed) so the
  // client's reconnect logic kicks in and we don't push into dead connections.
  const beat = setInterval(() => {
    for (const c of wss!.clients) {
      const m = meta.get(c);
      if (m && !m.alive) {
        c.terminate();
        continue;
      }
      if (m) m.alive = false;
      c.ping();
    }
  }, 25_000);
  wss.on('close', () => clearInterval(beat));
}
