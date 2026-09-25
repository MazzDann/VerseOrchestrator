import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Speaker remotes: phones paired by the operator (QR) that may send a SCOPED set of
 * commands to the control window. Pairings live in memory only — a server restart
 * revokes them all, which is the safe default for a live-event tool.
 */

/** Commands a remote may send. Settings, library rebuild etc. are never remote-able. */
export const REMOTE_COMMANDS = ['next', 'prev', 'blank', 'black'] as const;
export type RemoteCommand = (typeof REMOTE_COMMANDS)[number];

/** What a new pairing may do unless the operator widens it. */
export const DEFAULT_ALLOWED: RemoteCommand[] = ['next', 'prev', 'blank'];

export interface Pairing {
  id: string;
  name: string;
  token: string;
  allowed: RemoteCommand[];
  createdAt: number;
  lastSeen: number | null;
}

const pairings = new Map<string, Pairing>();

export function createPairing(name: string, allowed?: unknown): Pairing {
  const p: Pairing = {
    id: randomUUID(),
    name: name.trim().slice(0, 40) || `Пульт ${pairings.size + 1}`,
    token: randomBytes(18).toString('base64url'),
    allowed: sanitizeAllowed(allowed),
    createdAt: Date.now(),
    lastSeen: null,
  };
  pairings.set(p.id, p);
  return p;
}

export function sanitizeAllowed(raw: unknown): RemoteCommand[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ALLOWED];
  const ok = raw.filter((c): c is RemoteCommand => REMOTE_COMMANDS.includes(c as RemoteCommand));
  return [...new Set(ok)];
}

/** Constant-time token lookup (don't leak which prefix matched). */
export function findByToken(token: unknown): Pairing | null {
  if (typeof token !== 'string' || token.length < 10) return null;
  const a = Buffer.from(token);
  for (const p of pairings.values()) {
    const b = Buffer.from(p.token);
    if (a.length === b.length && timingSafeEqual(a, b)) return p;
  }
  return null;
}

export function revokePairing(id: string): boolean {
  return pairings.delete(id);
}

export function getPairing(id: string): Pairing | undefined {
  return pairings.get(id);
}

/** Public view for the control UI — never includes the token after creation. */
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

export function isRemoteCommand(c: unknown): c is RemoteCommand {
  return REMOTE_COMMANDS.includes(c as RemoteCommand);
}
