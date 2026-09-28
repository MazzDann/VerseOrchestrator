import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readJson, writeJson } from './jsonFile.js';

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
 * `show` (1.5.0) puts the control window's preview on screen, like the operator's F5.
 * `pick` (1.5.1) lets the phone choose verses itself — its own cursor, sent as a passage
 * (to preview with `pick`, to put on screen with `show` + passage, which needs both).
 */
export const REMOTE_COMMANDS = ['next', 'prev', 'blank', 'black', 'show', 'pick'] as const;
export type RemoteCommand = (typeof REMOTE_COMMANDS)[number];

/** What a new pairing may do unless the operator widens it (new abilities stay off). */
export const DEFAULT_ALLOWED: RemoteCommand[] = ['next', 'prev', 'blank'];

export interface Pairing {
  id: string;
  name: string;
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

/** Read persisted pairings (call once at startup). */
export function initRemoteStore(opts: { file: string | null; persist: boolean }): void {
  secretsFile = opts.file;
  persist = opts.persist;
  pairings.clear();
  if (!secretsFile || !persist) return;
  const data = readJson<Partial<SecretsFile>>(secretsFile, { version: 1, remotes: [] });
  for (const raw of Array.isArray(data.remotes) ? data.remotes : []) {
    if (!raw || typeof raw.id !== 'string' || !/^[0-9a-f]{64}$/.test(String(raw.tokenHash)))
      continue;
    pairings.set(raw.id, {
      id: raw.id,
      name: String(raw.name ?? 'Пульт').slice(0, 40),
      tokenHash: raw.tokenHash,
      allowed: sanitizeAllowed(raw.allowed),
      createdAt: Number(raw.createdAt) || Date.now(),
      lastSeen: typeof raw.lastSeen === 'number' ? raw.lastSeen : null,
    });
  }
}

/** Turn persistence on/off at runtime (server setting changed). Off also wipes the file. */
export function setRemotePersistence(on: boolean): void {
  persist = on;
  save();
}

function save(): void {
  if (!secretsFile) return;
  const remotes = persist ? [...pairings.values()] : [];
  writeJson(secretsFile, { version: 1, remotes } satisfies SecretsFile, { secret: true });
}

/** lastSeen changes on every press — batch those writes. */
let saveTimer: NodeJS.Timeout | null = null;
function saveSoon(): void {
  if (!persist || !secretsFile || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    save();
  }, 5000);
  saveTimer.unref?.();
}

export function touchPairing(p: Pairing): void {
  p.lastSeen = Date.now();
  saveSoon();
}

/** Create a pairing; the returned `token` is the only time it exists in plain form. */
export function createPairing(name: string, allowed?: unknown): Pairing & { token: string } {
  const token = newToken();
  const p: Pairing = {
    id: randomUUID(),
    name: name.trim().slice(0, 40) || `Пульт ${pairings.size + 1}`,
    tokenHash: hashToken(token),
    allowed: sanitizeAllowed(allowed),
    createdAt: Date.now(),
    lastSeen: null,
  };
  pairings.set(p.id, p);
  save();
  return { ...p, token };
}

/** Issue a new token for an existing pairing (the old one stops working at once). */
export function reissuePairing(id: string): (Pairing & { token: string }) | null {
  const p = pairings.get(id);
  if (!p) return null;
  const token = newToken();
  p.tokenHash = hashToken(token);
  save();
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
  const h = Buffer.from(hashToken(token), 'hex');
  let found: Pairing | null = null;
  for (const p of pairings.values()) {
    if (timingSafeEqual(h, Buffer.from(p.tokenHash, 'hex'))) found = p;
  }
  return found;
}

/**
 * Change what a pairing may do (1.5.0 — new abilities are off by default, so the operator
 * turns them on for a remote that already exists). An empty list is allowed: the phone
 * stays paired but can only watch.
 */
export function setPairingAllowed(id: string, allowed: unknown): Pairing | null {
  const p = pairings.get(id);
  if (!p || !Array.isArray(allowed)) return null;
  p.allowed = sanitizeAllowed(allowed);
  save();
  return p;
}

export function revokePairing(id: string): boolean {
  const ok = pairings.delete(id);
  if (ok) save();
  return ok;
}

export function getPairing(id: string): Pairing | undefined {
  return pairings.get(id);
}

/** Public view for the control UI — never includes the token or its hash. */
export function listPairings(online: (id: string) => boolean) {
  return [...pairings.values()].map((p) => ({
    id: p.id,
    name: p.name,
    allowed: p.allowed,
    createdAt: p.createdAt,
    lastSeen: p.lastSeen,
    online: online(p.id),
  }));
}

/** A passage chosen on a phone (1.5.1): translations, book, chapter, verses. */
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

export function isRemoteCommand(c: unknown): c is RemoteCommand {
  return REMOTE_COMMANDS.includes(c as RemoteCommand);
}
