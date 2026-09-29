import type { SegmentInfo } from '../../api';
import type { EngineInfo, EngineKind, ReopenResult } from '../engine/protocol';
import { BENCH_CASES } from './workload';
import { tr } from '../../i18n';

/** The engine benchmark's report: what run.ts measures, and its CSV / JSON exports. */

export type BenchEngine = 'server' | EngineKind;

/** Getters: each read is in the interface language of the moment (0.11.9). */
export const ENGINE_NAME: Record<BenchEngine, string> = {
  get server() {
    return tr('Сервер (SQLite)');
  },
  get sqlite() {
    return tr('SQLite у браузері');
  },
  get pglite() {
    return tr('PostgreSQL у браузері');
  },
};

export interface CaseStats {
  firstMs: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  count: number;
  capped: boolean;
  /** sorted result identities, for comparing engines (kept out of the export) */
  keys: string;
  error?: string;
}

export interface EngineRun {
  engine: BenchEngine;
  version: string;
  /** worker start + WASM init (+ initdb for Postgres); null for the server */
  bootMs: number | null;
  loadMs: number | null;
  segments: { abbr: string; ms: number }[];
  dbBytes: number | null;
  wasmBytes: number | null;
  assets: EngineInfo['assets'];
  snapshot: ReopenResult | null;
  cases: Record<string, CaseStats | null>;
  /** the server holds the whole library, not just the chosen segments */
  note?: string;
  error?: string;
}

export interface BenchReport {
  createdAt: string;
  app: string;
  userAgent: string;
  cores: number;
  iterations: number;
  segments: Pick<SegmentInfo, 'file' | 'kind' | 'abbr' | 'bytes' | 'rawBytes' | 'items'>[];
  engines: EngineRun[];
}

/** Median / p95 (nearest rank) / min of timed runs. */
export function timingStats(times: number[]): { medianMs: number; p95Ms: number; minMs: number } {
  const t = [...times].sort((a, b) => a - b);
  const rank = (p: number) => t[Math.min(t.length - 1, Math.max(0, Math.ceil(p * t.length) - 1))];
  return { medianMs: rank(0.5), p95Ms: rank(0.95), minMs: t[0] };
}

/**
 * Same results as the baseline engine? '=' identical; '≈' both hit the 300-result cap
 * and ranked a different top-300 (bm25 vs ts_rank); '≠' a real difference.
 */
export function parity(a: CaseStats | null | undefined, base: CaseStats | null | undefined) {
  if (!a || !base || a.error || base.error) return null;
  if (a.keys === base.keys) return { mark: '=', hint: tr('ті самі результати') };
  if (a.capped && base.capped)
    return { mark: '≈', hint: tr('обидва ≥ 300 результатів: інше ранжування, інші перші 300') };
  return { mark: '≠', hint: tr('інші результати') };
}

/** The report as CSV (one row per metric, one column per engine) — for a thesis table. */
export function reportCsv(r: BenchReport): string {
  const cols = r.engines.map((e) => ENGINE_NAME[e.engine]);
  const rows: (string | number)[][] = [[tr('метрика'), ...cols]];
  const num = (v: number | null | undefined, digits = 1) =>
    v == null || Number.isNaN(v) ? '' : Number(v.toFixed(digits));
  const mb = (v: number | null | undefined) => (v == null ? '' : Number((v / 1048576).toFixed(1)));
  const each = (f: (e: EngineRun) => string | number) => r.engines.map(f);
  rows.push([tr('версія'), ...each((e) => e.version)]);
  rows.push([tr('запуск (мс)'), ...each((e) => num(e.bootMs, 0))]);
  rows.push([tr('завантаження сегментів (мс)'), ...each((e) => num(e.loadMs, 0))]);
  rows.push([tr('розмір бази (МБ)'), ...each((e) => mb(e.dbBytes))]);
  rows.push([tr('WASM-пам’ять (МБ)'), ...each((e) => mb(e.wasmBytes))]);
  rows.push([tr('знімок: збереження (мс)'), ...each((e) => num(e.snapshot?.dumpMs, 0))]);
  rows.push([tr('знімок: розмір (МБ)'), ...each((e) => mb(e.snapshot?.dumpBytes))]);
  rows.push([tr('знімок: відкриття (мс)'), ...each((e) => num(e.snapshot?.reopenMs, 0))]);
  for (const c of BENCH_CASES) {
    const label = tr(c.label);
    rows.push([
      tr('{case}: медіана (мс)', { case: label }),
      ...each((e) => num(e.cases[c.id]?.medianMs)),
    ]);
    rows.push([tr('{case}: p95 (мс)', { case: label }), ...each((e) => num(e.cases[c.id]?.p95Ms))]);
    rows.push([
      tr('{case}: результатів', { case: label }),
      ...each((e) => e.cases[c.id]?.count ?? ''),
    ]);
  }
  const cell = (v: string | number) =>
    typeof v === 'number' ? String(v) : /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return rows.map((row) => row.map(cell).join(',')).join('\n');
}

/** JSON export without the bulky result identities. */
export function reportJson(r: BenchReport): string {
  return JSON.stringify(r, (key, value) => (key === 'keys' ? undefined : value), 2);
}
