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

/** Virtual adapters by their Windows (and Linux) names that say what they are. */
const VIRTUAL = /(vethernet|virtualbox|vmware|hyper-v|wsl|docker|loopback|default switch)/i;
/**
 * Virtual and tunnel interfaces by their Unix unit names — the whole name, with its number.
 * macOS names nothing «virtual» (Mac check of 1.9.0: UTM's and Internet Sharing's bridge100,
 * Parallels' vnic0/vnic1 went to phones before en0): bridge (also the Thunderbolt Bridge),
 * vmnet (VMware Fusion), vnic (Parallels), utun (VPNs, iCloud Private Relay), ipsec (the
 * built-in VPN), awdl/llw (AirDrop), anpi, ap (Wi-Fi hotspot), gif, stf, feth. Linux: virbr
 * (libvirt), br-<id> (Docker networks — a plain br0 often carries the real LAN, so not it),
 * veth, and the VPNs tun/tap/wg.
 */
const VIRTUAL_UNIT =
  /^(?:(?:bridge|vmnet|vnic|utun|ipsec|awdl|llw|anpi|ap|gif|stf|feth|virbr|tun|tap|wg)\d+|br-[0-9a-f]+|veth\w+)$/;
/** A Mac's own Wi-Fi/Ethernet (en0, en5 …); Windows and Linux never name an interface so. */
const MAC_REAL = /^en\d+$/;

/**
 * This machine's LAN IPv4 addresses, the one a phone can most likely reach first: a real
 * Wi-Fi/Ethernet address before virtual adapters (Hyper-V/WSL/VirtualBox/Docker on Windows,
 * VMs/VPNs/Internet Sharing on a Mac), which are commonly enumerated first and aren't
 * reachable from phones. Virtual ones go last rather than away: with Internet Sharing over
 * Wi-Fi the Mac's bridge is the only address its phones have. Shared by the phone QR
 * (`/api/host`) and the launcher's printout (0.7.0).
 */
export function lanIps(interfaces = os.networkInterfaces()): string[] {
  // Rank by private-range likelihood: 192.168.x (home Wi-Fi) > 10.x > 172.16–31.x.
  const rangeRank = (ip: string): number => {
    if (ip.startsWith('192.168.')) return 0;
    if (ip.startsWith('10.')) return 1;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
    return 3;
  };
  const candidates: { ip: string; rank: number }[] = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue; // link-local (no DHCP)
      const virtual = VIRTUAL.test(name) || VIRTUAL_UNIT.test(name);
      candidates.push({
        ip: a.address,
        // among equals a Mac's en<N> first; every other name moves alike, so order holds
        rank: rangeRank(a.address) + (virtual ? 10 : 0) + (MAC_REAL.test(name) ? 0 : 0.5),
      });
    }
  }
  return candidates.sort((x, y) => x.rank - y.rank).map((c) => c.ip);
}
