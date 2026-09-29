import type { SegmentInfo } from '../../api';
import { tr } from '../../i18n';

/**
 * Browser-side cache of library segments, CONTENT-ADDRESSED by SHA-256 (the manifest's
 * hash): a cached segment needs no network at all, a changed one gets a new key. Uses
 * Cache Storage (persistent, quota-managed, every modern browser); bytes are verified
 * against the expected hash before they're trusted. Also keeps the last manifest, so
 * the local library comes back even when the server is unreachable (offline).
 *
 * Cache Storage and crypto.subtle exist only in a SECURE context (localhost / HTTPS).
 * A control window opened over plain http on a LAN IP has neither — then everything
 * here degrades to "no cache" and segments are simply downloaded.
 */

const CACHE_NAME = 'vo-segments-v1';
const MANIFEST_KEY = '/__vo/segments/manifest.json';
const segmentKey = (sha256: string) => `/__vo/segments/${sha256}`;

export const cacheAvailable = (): boolean =>
  typeof caches !== 'undefined' && typeof crypto !== 'undefined' && !!crypto.subtle;

async function open(): Promise<Cache | null> {
  if (!cacheAvailable()) return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null; // storage blocked (private mode, policy)
  }
}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Ask the browser not to evict our cache under storage pressure (best-effort). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/**
 * The bytes of a segment: from the cache when its hash is there, else from `download`
 * (verified against `sha256`, then cached). Returns a fresh buffer the caller may transfer.
 */
export async function segmentBytes(
  info: Pick<SegmentInfo, 'sha256' | 'file'>,
  download: () => Promise<ArrayBuffer>,
): Promise<{ bytes: ArrayBuffer; fromCache: boolean }> {
  const cache = await open();
  const key = segmentKey(info.sha256);
  const hit = await cache?.match(key);
  if (hit) return { bytes: await hit.arrayBuffer(), fromCache: true };

  const bytes = await download();
  if (cacheAvailable()) {
    const actual = await sha256Hex(bytes);
    if (actual !== info.sha256) {
      throw new Error(
        tr('Сегмент {file} пошкоджено при завантаженні (контрольна сума не збігається)', {
          file: info.file,
        }),
      );
    }
  }
  // Store a copy: the returned buffer is transferred to the worker (and detached).
  await cache?.put(key, new Response(bytes.slice(0))).catch(() => undefined);
  return { bytes, fromCache: false };
}

/** Cache a dropped file by its own hash; returns the hash (its restore key). */
export async function cacheDropped(bytes: ArrayBuffer): Promise<string | null> {
  const cache = await open();
  if (!cache) return null;
  const sha = await sha256Hex(bytes);
  await cache.put(segmentKey(sha), new Response(bytes.slice(0))).catch(() => undefined);
  return sha;
}

export async function cachedBytes(sha256: string): Promise<ArrayBuffer | null> {
  const hit = await (await open())?.match(segmentKey(sha256));
  return hit ? hit.arrayBuffer() : null;
}

export async function saveManifest(manifest: unknown): Promise<void> {
  const cache = await open();
  await cache
    ?.put(
      MANIFEST_KEY,
      new Response(JSON.stringify(manifest), { headers: { 'Content-Type': 'application/json' } }),
    )
    .catch(() => undefined);
}

export async function lastManifest(): Promise<unknown | null> {
  const hit = await (await open())?.match(MANIFEST_KEY);
  return hit ? hit.json() : null;
}

/** What the cache holds: segment count and bytes. */
export async function cacheUsage(): Promise<{ segments: number; bytes: number } | null> {
  const cache = await open();
  if (!cache) return null;
  let segments = 0;
  let bytes = 0;
  for (const req of await cache.keys()) {
    if (req.url.endsWith('/manifest.json')) continue;
    const res = await cache.match(req);
    const len =
      Number(res?.headers.get('content-length') ?? 0) || (await res?.clone().blob())?.size || 0;
    segments += 1;
    bytes += len;
  }
  return { segments, bytes };
}

export async function clearCache(): Promise<void> {
  if (!cacheAvailable()) return;
  await caches.delete(CACHE_NAME).catch(() => undefined);
}
