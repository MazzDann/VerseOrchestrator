import { api, type SegmentInfo } from '../../api';
import { segmentBytes } from '../engine/cache';
import { createEngine } from '../engine';
import {
  ENGINE_NAME,
  timingStats,
  type BenchEngine,
  type BenchReport,
  type CaseStats,
  type EngineRun,
} from './report';
import { BENCH_CASES, summarize, type BenchContext, type BenchLibrary } from './workload';
import { tr, trn } from '../../i18n';

/**
 * The engine benchmark (thesis evidence for the hybrid DB): the same segments and the
 * same queries on
 *   - the server — better-sqlite3 over the full library, reached over HTTP (what the app
 *     does in «Сервер» mode, so HTTP + JSON are part of the cost);
 *   - SQLite compiled to WASM, and PostgreSQL compiled to WASM (PGlite) — each a fresh,
 *     throwaway worker (no snapshot read or written), measured one after another so
 *     they don't compete for the CPU.
 * Per query: the first (cold) run, one warm-up, then N timed runs → median / p95 / min.
 */

type Progress = (message: string, fraction: number) => void;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

/** The server's library over HTTP — the same calls the app makes in «Сервер» mode. */
function serverLibrary(): BenchLibrary {
  const q = encodeURIComponent;
  const lib = {
    getTranslations: () => getJson('/api/translations'),
    getVerses: (t: number, b: number, c: number) =>
      getJson(`/api/translations/${t}/books/${b}/chapters/${c}/verses`),
    search: (query: string, ids: number[]) =>
      getJson(`/api/search?q=${q(query)}&translations=${ids.join(',')}`),
    strongRefs: (num: string, o: { translationId?: number } = {}) =>
      getJson(
        `/api/strong/${q(num)}/refs${o.translationId != null ? `?translation=${o.translationId}` : ''}`,
      ),
    lookupStrong: (num: string, book?: number) =>
      getJson(`/api/strong/${q(num)}${book != null ? `?book=${book}` : ''}`),
    getCrossrefs: (b: number, c: number, v: number) =>
      getJson(`/api/crossrefs?book=${b}&chapter=${c}&verse=${v}`),
  };
  return lib as unknown as BenchLibrary;
}

async function measure(fn: () => Promise<unknown>, iterations: number): Promise<CaseStats> {
  let t = performance.now();
  const result = await fn();
  const firstMs = performance.now() - t;
  await fn(); // warm-up
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  return { firstMs, ...timingStats(times), ...summarize(result) };
}

async function runCases(
  lib: BenchLibrary,
  ctx: BenchContext,
  iterations: number,
  progress: (label: string) => void,
): Promise<EngineRun['cases']> {
  const out: EngineRun['cases'] = {};
  for (const c of BENCH_CASES) {
    const fn = c.make(lib, ctx);
    if (!fn) {
      out[c.id] = null;
      continue;
    }
    progress(c.label);
    try {
      out[c.id] = await measure(fn, iterations);
    } catch (err) {
      out[c.id] = {
        firstMs: NaN,
        medianMs: NaN,
        p95Ms: NaN,
        minMs: NaN,
        count: 0,
        capped: false,
        keys: '',
        error: (err as Error).message,
      };
    }
  }
  return out;
}

export async function runBench(opts: {
  engines: BenchEngine[];
  segments: SegmentInfo[];
  iterations: number;
  onProgress: Progress;
}): Promise<BenchReport> {
  const { engines, segments, iterations, onProgress } = opts;
  const translations = segments.filter((s) => s.kind === 'translation');
  const ctx: BenchContext = {
    uk: translations.find((s) => s.language.startsWith('uk'))?.id,
    en: translations.find((s) => s.language.startsWith('en'))?.id,
    translations: translations.map((s) => s.id!).filter((id) => id != null),
    hasDictionary: segments.some((s) => s.kind === 'dictionary'),
    hasStudy: segments.some((s) => s.kind === 'study'),
  };
  const steps = engines.length * (BENCH_CASES.length + segments.length + 2);
  let step = 0;
  const tick = (message: string) => onProgress(message, Math.min(1, ++step / steps));

  // Segment bytes first (from the cache when possible) — the network isn't what's measured.
  onProgress(tr('Сегменти…'), 0);
  const bytes: ArrayBuffer[] = [];
  for (const s of segments) {
    bytes.push((await segmentBytes(s, () => api.segmentBytes(s.file))).bytes);
  }

  const runs: EngineRun[] = [];
  for (const engine of engines) {
    const name = ENGINE_NAME[engine];
    const run: EngineRun = {
      engine,
      version: '',
      bootMs: null,
      loadMs: null,
      segments: [],
      dbBytes: null,
      wasmBytes: null,
      assets: [],
      snapshot: null,
      cases: {},
    };
    runs.push(run);
    try {
      if (engine === 'server') {
        tick(tr('{engine}: бібліотека', { engine: name }));
        const info = await getJson<{
          version: string;
          dbBytes: number;
          translations: number;
        }>('/api/library/info');
        run.version = info.version;
        run.dbBytes = info.dbBytes;
        run.note = trn(
          info.translations,
          'уся бібліотека: {n} переклад|уся бібліотека: {n} переклади|уся бібліотека: {n} перекладів',
        );
        run.cases = await runCases(serverLibrary(), ctx, iterations, (l) =>
          tick(`${name}: ${tr(l)}`),
        );
        continue;
      }
      const e = createEngine(engine, { persist: false });
      try {
        tick(tr('{engine}: запуск', { engine: name }));
        let t = performance.now();
        await e.info();
        run.bootMs = performance.now() - t;
        let total = 0;
        for (const [i, s] of segments.entries()) {
          tick(`${name}: ${s.abbr}`);
          t = performance.now();
          await e.add(s.file, bytes[i].slice(0)); // a copy: the worker takes ownership
          const ms = performance.now() - t;
          total += ms;
          run.segments.push({ abbr: s.abbr, ms });
        }
        run.loadMs = total;
        const info = await e.info();
        Object.assign(run, {
          version: info.version,
          dbBytes: info.dbBytes,
          wasmBytes: info.wasmBytes,
          assets: info.assets,
        });
        run.cases = await runCases(e.library(), ctx, iterations, (l) => tick(`${name}: ${tr(l)}`));
        tick(tr('{engine}: знімок', { engine: name }));
        run.snapshot = await e.reopen();
      } finally {
        e.terminate();
      }
    } catch (err) {
      run.error = (err as Error).message;
    }
  }

  return {
    createdAt: new Date().toISOString(),
    app: __APP_VERSION__,
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency ?? 0,
    iterations,
    segments: segments.map(({ file, kind, abbr, bytes, rawBytes, items }) => ({
      file,
      kind,
      abbr,
      bytes,
      rawBytes,
      items,
    })),
    engines: runs,
  };
}
