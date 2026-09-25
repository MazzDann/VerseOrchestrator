import os from 'node:os';
import type { IncomingMessage } from 'node:http';

/** This machine's own addresses (loopback + every interface), so a control window
 * opened via the LAN IP on the operator's own machine still counts as local. */
export function isOwnAddress(addr: string): boolean {
  const ip = addr.replace(/^::ffff:/, '');
  if (ip === '::1' || ip.startsWith('127.')) return true;
  return Object.values(os.networkInterfaces()).some((list) =>
    (list ?? []).some((a) => a.address === ip),
  );
}

/**
 * The real client address of an HTTP request or WebSocket upgrade. Behind the Vite
 * proxy (`xfwd: true`) the socket is always loopback, so use the LAST X-Forwarded-For
 * hop — the one the proxy appended itself (earlier hops are client-supplied and can be
 * forged). Since this server only listens on loopback, a direct connection is already
 * local.
 */
export function clientAddress(req: IncomingMessage): string {
  const socketAddr = req.socket.remoteAddress ?? '';
  const raw = req.headers['x-forwarded-for'];
  const fwd = Array.isArray(raw) ? raw.join(',') : raw;
  if (fwd && isOwnAddress(socketAddr)) {
    const hops = fwd
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return hops[hops.length - 1] ?? socketAddr;
  }
  return socketAddr;
}

/** True when the request comes from the operator's own machine. */
export const isLocalRequest = (req: IncomingMessage) => isOwnAddress(clientAddress(req));
