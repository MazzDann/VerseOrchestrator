import { api, SegmentManifestSchema, type SegmentInfo } from '../../api';
import { useDataSource } from '../../dataSourceStore';
import { localEngine } from './index';
import {
  cacheDropped,
  cachedBytes,
  lastManifest,
  requestPersistence,
  saveManifest,
  segmentBytes,
} from './cache';

type Manifest = { segments: SegmentInfo[] };

/**
 * The segment manifest: from the server (and remembered), or — when the server can't be
 * reached — the last one seen, so a cached local library still opens offline.
 */
export async function getManifest(): Promise<Manifest & { offline: boolean }> {
  try {
    const m = await api.segments();
    await saveManifest(m);
    return { ...m, offline: false };
  } catch (err) {
    const cached = SegmentManifestSchema.safeParse(await lastManifest());
    if (cached.success) return { ...cached.data, offline: true };
    throw err;
  }
}

/** Key of a dropped file in the engine / the remembered list: `drop:<sha256>:<name>`. */
const dropKey = (sha: string, name: string) => `drop:${sha}:${name}`;
const parseDropKey = (key: string) => {
  const m = key.match(/^drop:([0-9a-f]{64}):(.*)$/);
  return m ? { sha: m[1], name: m[2] } : null;
};
export const segmentLabel = (key: string) => parseDropKey(key)?.name ?? key;

export type Progress = (
  key: string,
  state: 'cache' | 'download' | 'merge' | 'done',
  info?: string,
) => void;

/**
 * Bring the given segments into the browser engine: cached bytes when the hash is in the
 * cache (no network), otherwise download → verify → cache. Dropped files come back from
 * the cache only (they were never on the server).
 */
export async function loadSegments(keys: string[], onProgress?: Progress): Promise<void> {
  const loaded = new Set((await localEngine.status()).map((s) => s.key));
  let manifest: Manifest | null = null;
  for (const key of keys) {
    if (loaded.has(key)) {
      onProgress?.(key, 'done');
      continue;
    }
    let bytes: ArrayBuffer;
    const drop = parseDropKey(key);
    if (drop) {
      const cached = await cachedBytes(drop.sha);
      if (!cached)
        throw new Error(`Файл «${drop.name}» більше не в кеші браузера — перетягніть його ще раз`);
      onProgress?.(key, 'cache');
      bytes = cached;
    } else {
      manifest ??= await getManifest();
      const info = manifest.segments.find((s) => s.file === key);
      if (!info) throw new Error(`Сегмента ${key} немає в маніфесті (бібліотеку перезібрано?)`);
      onProgress?.(key, 'download');
      const r = await segmentBytes(info, () => api.segmentBytes(key));
      if (r.fromCache) onProgress?.(key, 'cache');
      bytes = r.bytes;
    }
    onProgress?.(key, 'merge');
    const r = await localEngine.add(key, bytes);
    onProgress?.(key, 'done', `${r.verses} віршів, ${r.ms} мс`);
  }
}

/** Merge a dropped segment file and cache it so it survives a reload. Returns its key. */
export async function addDroppedFile(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const sha = await cacheDropped(bytes);
  const key = sha ? dropKey(sha, file.name) : `file:${file.name}`;
  await localEngine.add(key, bytes);
  return key;
}

/** On app start in «у браузері» mode: bring back the remembered segments. */
export function restoreLocalSegments(): void {
  const { source, segments } = useDataSource.getState();
  if (source !== 'local' || segments.length === 0) return;
  void requestPersistence();
  // `file:` keys (dropped without a cache) can't come back — skip them.
  localEngine.setReady(loadSegments(segments.filter((k) => !k.startsWith('file:'))));
}
