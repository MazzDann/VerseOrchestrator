import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { isLocalRequest } from './access.js';
import {
  findByToken,
  getPairing,
  isRemoteCommand,
  sanitizePassage,
  sanitizeSong,
  touchPairing,
  type RemoteCommand,
} from './remote.js';

/**
 * Live hub: the in-memory "what's on screen now" state plus a WebSocket channel at
 * `/api/ws`. The control window still publishes slides over HTTP (`POST /api/live`,
 * local-only); every publish is pushed to connected sockets at once (GET /api/live is
 * the polling fallback).
 *
 * Every socket starts as a read-only VIEWER. It can upgrade with a hello:
 *   { type: 'hello', role: 'control' }        — only from this machine + same origin
 *   { type: 'hello', role: 'remote', token }  — a paired speaker remote (remote.ts)
 * A remote may then send { type: 'command', cmd, id } for the commands its pairing allows;
 * the hub forwards them to the control socket(s) as { type: 'command', cmd, id, from } and
 * acks the remote with the control window's { type: 'result' } (see onCommand).
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
let screenState: { screen: unknown; next: unknown; preview: unknown } = {
  screen: null,
  next: null,
  preview: null,
};
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

/**
 * Disconnect every socket of a pairing: `revoked` (pairing deleted, close 4001) or
 * `reissued` (a new code was issued — the phone must scan the new QR, close 4002).
 */
export function dropRemote(pairingId: string, why: 'revoked' | 'reissued' = 'revoked'): void {
  for (const c of sockets('remote')) {
    if (meta.get(c)?.pairingId === pairingId) {
      if (why === 'revoked') send(c, { type: 'revoked' });
      else
        send(c, {
          type: 'denied',
          reason: 'Код цього пульта перевипущено. Відскануйте новий QR у вікні керування.',
        });
      c.close(why === 'revoked' ? 4001 : 4002, why);
    }
  }
  notifyRemotesChanged();
}

/** A pairing's permissions changed: its open remote pages update their buttons at once. */
export function notifyAllowed(pairingId: string, allowed: readonly string[]): void {
  for (const c of sockets('remote')) {
    if (meta.get(c)?.pairingId === pairingId) send(c, { type: 'allowed', allowed });
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
    touchPairing(p);
    send(ws, { type: 'welcome', role: 'remote', name: p.name, allowed: p.allowed });
    send(ws, { type: 'screen', ...screenState });
    notifyRemotesChanged();
    notifyViewers();
  }
}

/**
 * Remote commands (1.3.3): the remote is acked with the REAL outcome — the control window
 * applies the command and answers `{ type: 'result', id, ok, reason }` — or told it didn't
 * answer in time. Every command has an id (made up here for older remote pages); a retry
 * with the same id (the phone resending after a reconnect) is not forwarded again, it just
 * gets the ack of the first one — so a flaky connection can't advance the show twice.
 */
interface Pending {
  remote: WebSocket;
  cmd: RemoteCommand;
  timer: ReturnType<typeof setTimeout>;
}
const pending = new Map<string, Pending>();
/** Outcomes of recent commands, by id, to answer retries (30 s). */
const answered = new Map<string, { at: number; ack: object }>();
const ANSWERED_MS = 30_000;
let resultTimeoutMs = 2500;
/** Tests shorten the wait for a control window's answer. */
export function setCommandTimeout(ms: number): void {
  resultTimeoutMs = ms;
}

const commandId = (raw: unknown, pairingId: string) =>
  typeof raw === 'string' && /^[\w.-]{1,64}$/.test(raw)
    ? `${pairingId}:${raw}` // scoped per pairing: one remote can't touch another's ids
    : `${pairingId}:srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function finish(id: string, ack: Record<string, unknown>): void {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  clearTimeout(p.timer);
  const frame = { type: 'ack', cmd: p.cmd, ...ack };
  answered.set(id, { at: Date.now(), ack: frame });
  send(p.remote, frame);
}

function onCommand(ws: WebSocket, m: Meta, msg: Record<string, unknown>) {
  const cmd = msg.cmd;
  const clientId = typeof msg.id === 'string' ? msg.id : undefined;
  const p = m.role === 'remote' && m.pairingId ? getPairing(m.pairingId) : undefined;
  const reject = (reason: string) =>
    send(ws, { type: 'ack', id: clientId, cmd, ok: false, reason });
  if (!p) return reject('Немає доступу');
  // `pick` is checked by what it carries (verses → «Вибір віршів», a stanza → «Пісні»);
  // `songs` is a permission only, never a command
  if (!isRemoteCommand(cmd) || cmd === 'songs' || (cmd !== 'pick' && !p.allowed.includes(cmd)))
    return reject('Ця дія пульту не дозволена');
  // A passage (1.5.1) or a song stanza (1.5.3) chosen on the phone: `pick` needs one;
  // `show` with one also needs the permission to choose.
  const passage = msg.passage === undefined ? null : sanitizePassage(msg.passage);
  if (msg.passage !== undefined && !passage) return reject('Неправильний уривок');
  const song = msg.song === undefined || passage ? null : sanitizeSong(msg.song);
  if (msg.song !== undefined && !passage && !song) return reject('Неправильна строфа');
  if (cmd === 'pick' && !passage && !song) return reject('Не вибрано вірш');
  // each ability on its own, per remote: verses need «Вибір віршів», songs need «Пісні»
  if (passage && !p.allowed.includes('pick')) return reject('Вибір віршів пульту не дозволено');
  if (song && !p.allowed.includes('songs')) return reject('Пісні пульту не дозволено');

  const id = commandId(clientId, p.id);
  const now = Date.now();
  for (const [k, v] of answered) if (now - v.at > ANSWERED_MS) answered.delete(k);
  const done = answered.get(id);
  if (done) return send(ws, done.ack); // a retry of something already applied
  if (pending.has(id)) {
    pending.get(id)!.remote = ws; // a retry while waiting: answer on the new socket
    return;
  }

  m.recent = m.recent.filter((t) => now - t < 1000);
  if (m.recent.length >= MAX_COMMANDS_PER_SEC) return reject('Забагато натискань');
  m.recent.push(now);
  touchPairing(p);
  const controls = sockets('control');
  if (controls.length === 0) return reject('Вікно керування не відкрите');
  pending.set(id, {
    remote: ws,
    cmd: cmd as RemoteCommand,
    timer: setTimeout(
      () => finish(id, { id: clientId, ok: false, reason: 'Вікно керування не відповіло' }),
      resultTimeoutMs,
    ),
  });
  for (const c of controls) {
    send(c, {
      type: 'command',
      cmd: cmd as RemoteCommand,
      id,
      from: p.name,
      ...(passage ? { passage } : {}),
      ...(song ? { song } : {}),
    });
  }
}

/**
 * The operator suggests something to a remote (1.5.4): a passage or a song stanza the
 * speaker may take into their preview or put on screen — or ignore. Nothing changes until
 * the speaker acts, so there is nothing to resolve between the two. Only to a remote
 * allowed to choose that kind; the control window hears how many of its pages got it.
 */
function onSuggest(ws: WebSocket, msg: Record<string, unknown>) {
  const to = typeof msg.to === 'string' ? msg.to : '';
  const p = getPairing(to);
  const passage = msg.passage === undefined ? null : sanitizePassage(msg.passage);
  const song = passage || msg.song === undefined ? null : sanitizeSong(msg.song);
  const answer = (delivered: number, reason?: string) =>
    send(ws, { type: 'suggested', to, delivered, reason });
  if (!p) return answer(0, 'Пульт не знайдено');
  if (!passage && !song) return answer(0, 'Нічого не вибрано');
  if (passage && !p.allowed.includes('pick')) return answer(0, 'Цьому пульту не дозволено вірші');
  if (song && !p.allowed.includes('songs')) return answer(0, 'Цьому пульту не дозволено пісні');
  const frame = {
    type: 'suggest',
    ...(passage ? { passage } : { song }),
    reference: String(msg.reference ?? '').slice(0, 200),
    text: String(msg.text ?? '').slice(0, 400),
  };
  let delivered = 0;
  for (const c of sockets('remote')) {
    if (meta.get(c)?.pairingId === p.id) {
      send(c, frame);
      delivered++;
    }
  }
  answer(delivered, delivered ? undefined : 'Пульт не на зв’язку');
}

/** A control window's answer to a forwarded command (the first one wins). */
function onResult(msg: Record<string, unknown>) {
  const id = typeof msg.id === 'string' ? msg.id : '';
  const clientId = id.slice(id.indexOf(':') + 1);
  finish(id, {
    id: clientId.startsWith('srv-') ? undefined : clientId,
    ok: msg.ok === true,
    reason: typeof msg.reason === 'string' ? msg.reason.slice(0, 200) : undefined,
  });
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
      else if (msg?.type === 'result' && m.role === 'control') onResult(msg);
      else if (msg?.type === 'suggest' && m.role === 'control') onSuggest(ws, msg);
      else if (msg?.type === 'publish' && m.role === 'control') {
        // Audience follow-along over the control socket (HTTP POST /api/live is the fallback).
        if (msg.paused === true) pauseLive();
        else publishLive(msg.slide ?? null);
      } else if (msg?.type === 'echo' && m.role === 'control') {
        // Sync benchmark (/bench): a tiny reply, so a round trip = payload in + ack out.
        send(ws, { type: 'echo', id: msg.id });
      } else if (msg?.type === 'screen' && m.role === 'control') {
        screenState = {
          screen: msg.screen ?? null,
          next: msg.next ?? null,
          // what «На екран» (`show`) would put there — the control window's preview
          preview: msg.preview ?? null,
        };
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
