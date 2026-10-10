import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { isUnreadable, readJson, writeJson } from './jsonFile.js';

/**
 * Speaker remotes: phones paired by the operator (QR) that may send a SCOPED set of
 * commands to the control window.
 *
 * Only a SHA-256 of each token is kept — in memory and on disk. The plain token exists
 * once, in the create/reissue response (→ QR); a leaked secrets file can't be used to
 * drive the show. Pairings persist in `<data>/secrets.json` when the server setting
 * `remotes.persist` is on (see serverSettings.ts); otherwise a restart revokes them all.
 */

/**
 * Commands a remote may send. Settings, library rebuild etc. are never remote-able.
 * `show` (0.6.0) puts the control window's preview on screen, like the operator's F5.
 * `pick` (0.6.1) lets the phone choose verses itself — its own cursor, sent as a passage
 * (to preview with `pick`, to put on screen with `show` + passage, which needs both).
 * `songs` (0.6.3) is a permission, not a command: song stanzas chosen on the phone go
 * the same way (`pick` / `show` + song) — the operator grants it per remote on its own.
 * `cover` and `countdown` (1.9.0-beta.10) are «Заставка» (the L key) and «Відлік» (start /
 * pause / take off) — asked for a control window on another computer (F1005-10). `timer`
 * (1.11.0-beta.2) — the speaker's own timer on «Сцена»: start, pause / go on, ±1 хв, off.
 */
export const REMOTE_COMMANDS = [
  'next',
  'prev',
  'blank',
  'black',
  'show',
  'pick',
  'songs',
  'playlist',
  'cover',
  'countdown',
  'timer',
] as const;
export type RemoteCommand = (typeof REMOTE_COMMANDS)[number];

/**
 * What a remote can SEND (permissions above are what it may): the buttons, `show` / `pick`
 * (checked by what they carry) and `queue` (0.6.9: add the speaker's choice to the shared
 * running order — needs «Послідовність» plus the right to choose that kind).
 */
export const REMOTE_ACTIONS = [
  'next',
  'prev',
  'blank',
  'black',
  'show',
  'pick',
  'queue',
  'cover',
  'countdown',
  'timer',
] as const;
export type RemoteAction = (typeof REMOTE_ACTIONS)[number];
export const isRemoteAction = (c: unknown): c is RemoteAction =>
  REMOTE_ACTIONS.includes(c as RemoteAction);

/** What a new pairing may do unless the operator widens it (new abilities stay off). */
export const DEFAULT_ALLOWED: RemoteCommand[] = ['next', 'prev', 'blank'];

/**
 * What the operator paired (1.9.0-beta.10): a phone (`/remote`, a QR) or a control window on
 * another computer of the LAN (`/desk`, a link). The hub treats both alike — the permissions
 * decide; the kind names the row and the link in «Пульт». Older files have none: a phone.
 */
export type PairingKind = 'phone' | 'desk';
const asKind = (raw: unknown): PairingKind => (raw === 'desk' ? 'desk' : 'phone');

export interface Pairing {
  id: string;
  name: string;
  kind: PairingKind;
  /** hex SHA-256 of the token */
  tokenHash: string;
  allowed: RemoteCommand[];
  createdAt: number;
  lastSeen: number | null;
}

interface SecretsFile {
  version: 1;
  remotes: Pairing[];
}

const pairings = new Map<string, Pairing>();
let secretsFile: string | null = null;
let persist = false;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(18).toString('base64url');

/**
 * secrets.json couldn't be read at start (held for a moment — right after an update's restart,
 * say): it is read again before the pairings are used or saved (1.9.3 review).
 */
let unread = false;

/** Read persisted pairings (call once at startup). */
export function initRemoteStore(opts: { file: string | null; persist: boolean }): void {
  secretsFile = opts.file;
  persist = opts.persist;
  pairings.clear();
  unread = false;
  load();
}

/** The pairings in the file, added to those here (an id already here stays as it is). */
function load(): void {
  if (!secretsFile || !persist) return;
  const data = readJson<Partial<SecretsFile>>(secretsFile, { version: 1, remotes: [] });
  unread = isUnreadable(secretsFile);
  for (const raw of Array.isArray(data.remotes) ? data.remotes : []) adopt(raw);
}

/**
 * One stored pairing, checked: added unless its id is here already (that one stays as it is).
 * `name` makes its name: an import from another copy keeps names apart (uniqueName).
 */
function adopt(raw: unknown, name = (n: string) => n): Pairing | null {
  const r = raw as Partial<Record<keyof Pairing, unknown>> | null;
  if (!r || typeof r.id !== 'string' || !/^[0-9a-f]{64}$/.test(String(r.tokenHash))) return null;
  if (pairings.has(r.id)) return null;
  const p: Pairing = {
    id: r.id,
    name: name(String(r.name ?? 'Пульт').slice(0, 40)), // i18n-ignore: a stored name
    kind: asKind(r.kind),
    tokenHash: String(r.tokenHash),
    allowed: sanitizeAllowed(r.allowed),
    createdAt: Number(r.createdAt) || Date.now(),
    lastSeen: typeof r.lastSeen === 'number' ? r.lastSeen : null,
  };
  pairings.set(p.id, p);
  return p;
}

/** A pairing with this id or token is here already: an import from another copy adds only new ones. */
export function knownPairing(id: string, tokenHash: string): boolean {
  ready();
  if (pairings.has(id)) return true;
  for (const p of pairings.values()) if (p.tokenHash === tokenHash) return true;
  return false;
}

/**
 * Pairings carried over from another copy of the app («Перенести з іншої копії…», 1.12.0-beta.2):
 * added as that copy had them — permissions, kind; a name taken here gets « (2)» —, and saved
 * (persistence is on by then: the import turns it on). Returns the ids added.
 */
export function adoptPairings(list: unknown[]): string[] {
  ready();
  const added: string[] = [];
  for (const raw of list) {
    const r = raw as { id?: unknown; tokenHash?: unknown } | null;
    if (!r || knownPairing(String(r.id), String(r.tokenHash))) continue;
    const p = adopt(raw, uniqueName);
    if (p) added.push(p.id);
  }
  if (added.length)
    saveOr(() => {
      for (const id of added) pairings.delete(id);
    });
  return added;
}

/** The pairings an import added, dropped again by its «Повернути як було»; returns those dropped. */
export function dropPairings(ids: string[]): string[] {
  ready();
  const gone = ids.map((id) => pairings.get(id)).filter((p): p is Pairing => !!p);
  for (const p of gone) pairings.delete(p.id);
  if (gone.length)
    saveOr(() => {
      for (const p of gone) pairings.set(p.id, p);
    });
  return gone.map((p) => p.id);
}

/** Before the pairings are used: the file not read at start is read now, if it can be. */
const ready = () => {
  if (unread) load();
};

/** Turn persistence on/off at runtime (server setting changed). Off also wipes the file. */
export function setRemotePersistence(on: boolean): void {
  if (on === persist) return; // another setting saved: secrets.json isn't touched
  persist = on;
  if (on) ready();
  save();
}

function save(): void {
  if (!secretsFile) return;
  ready();
  const remotes = persist ? [...pairings.values()] : [];
  // persistence off wipes the file whatever it held: not made from reading it
  writeJson(secretsFile, { version: 1, remotes } satisfies SecretsFile, {
    secret: true,
    replace: !persist,
  });
}

/** A change kept only if it is saved: `undo` puts it back when the file can't be written. */
function saveOr(undo: () => void): void {
  try {
    save();
  } catch (err) {
    undo();
    throw err;
  }
}

/** lastSeen changes on every press — batch those writes. */
let saveTimer: NodeJS.Timeout | null = null;
function saveSoon(): void {
  if (!persist || !secretsFile || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    // only «last seen»: a file that can't be written now waits for the next press
    try {
      save();
    } catch (err) {
      console.warn('[remote]', (err as Error).message);
    }
  }, 5000);
  saveTimer.unref?.();
}

export function touchPairing(p: Pairing): void {
  p.lastSeen = Date.now();
  saveSoon();
}

/** Create a pairing; the returned `token` is the only time it exists in plain form. */
export function createPairing(
  name: string,
  allowed?: unknown,
  kind?: unknown,
): Pairing & { token: string } {
  ready();
  const token = newToken();
  const p: Pairing = {
    id: randomUUID(),
    // the page names it in its language; this is for a request without a name
    name: uniqueName(name.trim().slice(0, 40) || `Пульт ${pairings.size + 1}`), // i18n-ignore
    kind: asKind(kind),
    tokenHash: hashToken(token),
    allowed: sanitizeAllowed(allowed),
    createdAt: Date.now(),
    lastSeen: null,
  };
  pairings.set(p.id, p);
  saveOr(() => pairings.delete(p.id)); // no remote listed whose token nobody got
  return { ...p, token };
}

/**
 * One name per pairing (1.9.0-beta.10): the operator tells remotes apart by it, and a desk knows
 * its own slide by it (`source.by`) — «Пульт 2» made again after a revoke becomes «Пульт 2 (2)».
 */
function uniqueName(name: string): string {
  const taken = new Set([...pairings.values()].map((p) => p.name));
  if (!taken.has(name)) return name;
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = name.slice(0, 40 - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Issue a new token for an existing pairing (the old one stops working at once). */
export function reissuePairing(id: string): (Pairing & { token: string }) | null {
  ready();
  const p = pairings.get(id);
  if (!p) return null;
  const token = newToken();
  const was = p.tokenHash;
  p.tokenHash = hashToken(token);
  saveOr(() => (p.tokenHash = was));
  return { ...p, token };
}

export function sanitizeAllowed(raw: unknown): RemoteCommand[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ALLOWED];
  const ok = raw.filter((c): c is RemoteCommand => REMOTE_COMMANDS.includes(c as RemoteCommand));
  return [...new Set(ok)];
}

/** Constant-time lookup by hash (don't leak which pairing / prefix matched). */
export function findByToken(token: unknown): Pairing | null {
  if (typeof token !== 'string' || token.length < 10) return null;
  ready();
  const h = Buffer.from(hashToken(token), 'hex');
  let found: Pairing | null = null;
  for (const p of pairings.values()) {
    if (timingSafeEqual(h, Buffer.from(p.tokenHash, 'hex'))) found = p;
  }
  return found;
}

/**
 * Change what a pairing may do (0.6.0 — new abilities are off by default, so the operator
 * turns them on for a remote that already exists). An empty list is allowed: the phone
 * stays paired but can only watch.
 */
export function setPairingAllowed(id: string, allowed: unknown): Pairing | null {
  ready();
  const p = pairings.get(id);
  if (!p || !Array.isArray(allowed)) return null;
  const was = p.allowed;
  p.allowed = sanitizeAllowed(allowed);
  saveOr(() => (p.allowed = was));
  return p;
}

export function revokePairing(id: string): boolean {
  ready();
  const p = pairings.get(id);
  if (!p) return false;
  pairings.delete(id);
  saveOr(() => pairings.set(id, p));
  return true;
}

export function getPairing(id: string): Pairing | undefined {
  ready();
  return pairings.get(id);
}

/** Public view for the control UI — never includes the token or its hash. */
export function listPairings(online: (id: string) => boolean) {
  ready();
  return [...pairings.values()].map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    allowed: p.allowed,
    createdAt: p.createdAt,
    lastSeen: p.lastSeen,
    online: online(p.id),
  }));
}

/** A passage chosen on a phone (0.6.1): translations, book, chapter, verses. */
export interface Passage {
  translationIds: number[];
  bookNumber: number;
  chapter: number;
  verses: number[];
}

const posInt = (n: unknown, max: number): n is number =>
  Number.isInteger(n) && (n as number) > 0 && (n as number) <= max;

/** A passage from a phone, or null when it isn't one (bounded: at most 5 translations, 200 verses). */
export function sanitizePassage(raw: unknown): Passage | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ids = r.translationIds;
  const verses = r.verses;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 5) return null;
  if (!Array.isArray(verses) || verses.length === 0 || verses.length > 200) return null;
  if (!ids.every((i) => posInt(i, 2 ** 31)) || !verses.every((v) => posInt(v, 1000))) return null;
  if (!posInt(r.bookNumber, 10_000) || !posInt(r.chapter, 1000)) return null;
  return {
    translationIds: ids as number[],
    bookNumber: r.bookNumber,
    chapter: r.chapter,
    verses: [...new Set(verses as number[])].sort((a, b) => a - b),
  };
}

/** A song stanza chosen on a phone (0.6.3). */
export interface SongPick {
  songId: number;
  stanza: number;
}

/** A song stanza from a phone, or null when it isn't one. */
export function sanitizeSong(raw: unknown): SongPick | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!posInt(r.songId, 2 ** 31)) return null;
  if (!Number.isInteger(r.stanza) || (r.stanza as number) < 0 || (r.stanza as number) > 500) {
    return null;
  }
  return { songId: r.songId, stanza: r.stanza as number };
}

/**
 * «Відлік» from a remote (1.9.0-beta.10): `start` a new one — of `seconds` (1 s – 12 h) or the
 * operator's saved length —, `pause` (pause / go on, the T key) or `stop` (take it off).
 */
export interface CountdownOp {
  op: 'start' | 'pause' | 'stop';
  seconds?: number;
}

/** What a remote asks of the speaker's timer (1.11.0-beta.2): start (minutes, else the saved length), pause / go on, ±minutes, off. */
export interface TimerOp {
  op: 'start' | 'pause' | 'shift' | 'stop';
  minutes?: number;
}

/** A timer request from a remote, or null when it isn't one: whole minutes, ±1…60 to shift, ≤ 12 h to start. */
export function sanitizeTimer(raw: unknown): TimerOp | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.op === 'pause' || r.op === 'stop') return r.minutes === undefined ? { op: r.op } : null;
  if (r.op === 'start') {
    if (r.minutes === undefined) return { op: 'start' };
    return posInt(r.minutes, 12 * 60) ? { op: 'start', minutes: r.minutes } : null;
  }
  if (r.op === 'shift') {
    const m = r.minutes;
    return typeof m === 'number' && Number.isInteger(m) && m !== 0 && Math.abs(m) <= 60
      ? { op: 'shift', minutes: m }
      : null;
  }
  return null;
}

/** A countdown request from a remote, or null when it isn't one. */
export function sanitizeCountdown(raw: unknown): CountdownOp | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.op !== 'start' && r.op !== 'pause' && r.op !== 'stop') return null;
  if (r.seconds === undefined) return { op: r.op };
  if (r.op !== 'start' || !posInt(r.seconds, 12 * 3600)) return null;
  return { op: r.op, seconds: r.seconds };
}
