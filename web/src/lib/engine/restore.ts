import { api, SegmentManifestSchema, type SegmentInfo } from '../../api';
import { effectiveSource, useDataSource } from '../../dataSourceStore';
import type { MyBibleKind } from '@vo/shared';
import { localEngine } from './index';
import { fmtNumber, N_, Nn_, tr, trn } from '../../i18n';
import type { EngineKind, SegmentCounts, SegmentUnit } from './protocol';
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

/** A segment that can't come back: a dropped file no longer cached, or not in the manifest. */
class SegmentGone extends Error {}

/**
 * Bring the given segments into the browser engine: cached bytes when the hash is in the
 * cache (no network), otherwise download → verify → cache. Dropped files come back from
 * the cache only (they were never on the server). With `skipGone`, segments that can't
 * come back are skipped (and returned) instead of stopping the rest.
 */
export async function loadSegments(
  keys: string[],
  onProgress?: Progress,
  opts: { skipGone?: boolean } = {},
): Promise<string[]> {
  const loaded = new Set((await localEngine.status()).map((s) => s.key));
  let manifest: Manifest | null = null;
  const gone: string[] = [];
  for (const key of keys) {
    if (loaded.has(key)) {
      onProgress?.(key, 'done');
      continue;
    }
    try {
      let bytes: ArrayBuffer;
      const drop = parseDropKey(key);
      if (drop) {
        const cached = await cachedBytes(drop.sha);
        if (!cached) {
          throw new SegmentGone(
            tr('Файл «{name}» більше не в кеші браузера — перетягніть його ще раз', {
              name: drop.name,
            }),
          );
        }
        onProgress?.(key, 'cache');
        bytes = cached;
      } else {
        manifest ??= await getManifest();
        const info = manifest.segments.find((s) => s.file === key);
        if (!info) {
          throw new SegmentGone(
            tr('Сегмента {key} немає в маніфесті (бібліотеку перезібрано?)', { key }),
          );
        }
        onProgress?.(key, 'download');
        const r = await segmentBytes(info, () => api.segmentBytes(key));
        if (r.fromCache) onProgress?.(key, 'cache');
        bytes = r.bytes;
      }
      onProgress?.(key, 'merge');
      const r = await localEngine.add(key, bytes);
      onProgress?.(key, 'done', tr('{items}, {ms} мс', { items: segmentItems(r), ms: r.ms }));
    } catch (err) {
      if (!(opts.skipGone && err instanceof SegmentGone)) throw err;
      gone.push(key);
    }
  }
  return gone;
}

const UNIT_FORMS: Record<SegmentUnit, string> = {
  verses: Nn_('{n} вірш|{n} вірші|{n} віршів'),
  entries: Nn_('{n} стаття|{n} статті|{n} статей'),
  notes: Nn_('{n} коментар|{n} коментарі|{n} коментарів'),
  refs: Nn_('{n} посилання|{n} посилання|{n} посилань'),
  songs: Nn_('{n} пісня|{n} пісні|{n} пісень'),
};

/** «31 102 вірші», «14 250 статей» — what a segment holds, in words. */
export function segmentItems(c: Pick<SegmentCounts, 'items' | 'unit'>): string {
  return trn(c.items, UNIT_FORMS[c.unit]);
}

const KIND_LABEL: Record<MyBibleKind, string> = {
  bible: N_('Біблія'),
  dictionary: N_('словник'),
  commentaries: N_('коментарі'),
  crossreferences: N_('перехресні посилання'),
};

export interface Dropped {
  key: string;
  /** e.g. «UKRK — Біблія, 31 102 вірші (перетворено за 1,2 с)» */
  summary: string;
}

/**
 * Add a dropped file: a raw MyBible module (.SQLite3) is converted into a segment first
 * (in the worker); a segment (.vodb / .vodb.gz) goes in as is. What's cached is the
 * SEGMENT — a reload merges it directly, no second conversion. Returns its key.
 */
export async function addDroppedFile(
  file: File,
  onStage?: (stage: 'convert' | 'merge') => void,
): Promise<Dropped> {
  onStage?.('convert');
  const { bytes, converted, ms } = await localEngine.convert(file.name, await file.arrayBuffer());
  const sha = await cacheDropped(bytes);
  // The same file under another name: its rows are already in (same ids) — reuse the key.
  const same = sha && (await localEngine.status()).find((s) => parseDropKey(s.key)?.sha === sha);
  const key = same ? same.key : sha ? dropKey(sha, file.name) : `file:${file.name}`;
  onStage?.('merge');
  const r = await localEngine.add(key, bytes);
  const what = segmentItems(r);
  const summary = converted
    ? tr('{abbr} — {kind}, {items} (перетворено за {s} с)', {
        abbr: converted.abbr,
        kind: tr(KIND_LABEL[converted.kind]),
        items: what,
        s: fmtNumber(ms / 1000, { maximumFractionDigits: 1 }),
      })
    : `${file.name} — ${what}`;
  return { key, summary };
}

/**
 * Run the browser library on another database engine: a fresh engine of that kind
 * replaces the current one, and whatever the old one held is loaded into it (from the
 * cache — no network). Returns how long the reload took.
 */
export async function switchEngine(kind: EngineKind, onProgress?: Progress): Promise<number> {
  const had = (await localEngine.status()).length > 0;
  useDataSource.getState().setEngine(kind);
  localEngine.switchTo(kind);
  if (!had) return 0;
  const t0 = performance.now();
  const { segments } = useDataSource.getState();
  const load = loadSegments(
    segments.filter((k) => !k.startsWith('file:')),
    onProgress,
    { skipGone: true },
  );
  localEngine.setReady(load.then(() => undefined));
  const gone = await load;
  if (gone.length) {
    const now = useDataSource.getState();
    now.setSegments(now.segments.filter((k) => !gone.includes(k)));
  }
  return performance.now() - t0;
}

/** On app start in «у браузері» mode: bring back the remembered segments. */
export function restoreLocalSegments(): void {
  const { segments } = useDataSource.getState();
  if (effectiveSource() !== 'local' || segments.length === 0) return;
  void requestPersistence();
  // `file:` keys (dropped without a cache) can't come back — skip them. Neither can a
  // dropped file whose cache was cleared, or a segment a rebuild removed: those are
  // forgotten, and everything else still loads.
  localEngine.setReady(
    loadSegments(
      segments.filter((k) => !k.startsWith('file:')),
      undefined,
      { skipGone: true },
    ).then((gone) => {
      if (gone.length === 0) return;
      console.warn('[library] segments that can no longer be restored:', gone);
      const now = useDataSource.getState();
      now.setSegments(now.segments.filter((k) => !gone.includes(k)));
    }),
  );
}
