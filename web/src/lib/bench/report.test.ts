import { describe, expect, it } from 'vitest';
import {
  parity,
  reportCsv,
  reportJson,
  timingStats,
  type BenchReport,
  type CaseStats,
} from './report';
import { BENCH_CASES, RESULT_CAP, summarize } from './workload';

const hit = (verse: number, translationId = 17) => ({
  translationId,
  bookNumber: 500,
  chapter: 3,
  verse,
  text: '',
});

const stats = (over: Partial<CaseStats> = {}): CaseStats => ({
  firstMs: 20,
  medianMs: 1.23,
  p95Ms: 2.5,
  minMs: 1,
  count: 2,
  capped: false,
  keys: 'a|b',
  ...over,
});

describe('engine benchmark report', () => {
  it('median / p95 by nearest rank', () => {
    const times = Array.from({ length: 20 }, (_, i) => 20 - i); // 20..1, unsorted
    expect(timingStats(times)).toEqual({ medianMs: 10, p95Ms: 19, minMs: 1 });
    expect(timingStats([5])).toEqual({ medianMs: 5, p95Ms: 5, minMs: 5 });
  });

  it('reduces any library answer to count + order-free identities', () => {
    // search response: engines may order hits differently — identities are sorted
    const a = summarize({ kind: 'text', results: [hit(17), hit(16)] });
    const b = summarize({ kind: 'text', results: [hit(16), hit(17)] });
    expect(a).toEqual(b);
    expect(a.count).toBe(2);
    // concordance counts its total, not the page
    expect(summarize({ strong: 26, total: 106, results: [hit(1)] }).count).toBe(106);
    // verse lists, cross-references, dictionary entries, translations
    expect(summarize([hit(1), hit(2)]).keys).toBe('17:500:3:1|17:500:3:2');
    expect(summarize([{ bookNumber: 450, chapter: 5, verseStart: 8, verseEnd: 8 }]).keys).toBe(
      '450:5:8-8',
    );
    expect(summarize([{ topic: 'G26' }]).keys).toBe('G26');
    expect(summarize([{ abbr: 'UKRK' }]).keys).toBe('UKRK');
    expect(
      summarize({ results: Array.from({ length: RESULT_CAP }, (_, i) => hit(i)) }).capped,
    ).toBe(true);
  });

  it('marks agreement: same / both capped / different', () => {
    expect(parity(stats(), stats())?.mark).toBe('=');
    expect(
      parity(stats({ keys: 'x', capped: true }), stats({ keys: 'y', capped: true }))?.mark,
    ).toBe('≈');
    expect(parity(stats({ keys: 'x' }), stats({ keys: 'y' }))?.mark).toBe('≠');
    expect(parity(null, stats())).toBeNull();
    expect(parity(stats({ error: 'boom' }), stats())).toBeNull();
  });

  it('exports CSV (one column per engine) and JSON without result identities', () => {
    const cases = Object.fromEntries(BENCH_CASES.map((c) => [c.id, stats()]));
    const report: BenchReport = {
      createdAt: '2026-09-27T00:00:00.000Z',
      app: '0.3.10',
      userAgent: 'test',
      cores: 8,
      iterations: 20,
      segments: [
        {
          file: 't-17.vodb.gz',
          kind: 'translation',
          abbr: 'UKRK',
          bytes: 1,
          rawBytes: 2,
          items: 3,
        },
      ],
      engines: [
        {
          engine: 'sqlite',
          version: 'SQLite 3.53.4',
          bootMs: 151.4,
          loadMs: 1138,
          segments: [],
          dbBytes: 36.3 * 1048576,
          wasmBytes: null,
          assets: [],
          snapshot: { dumpMs: 33, dumpBytes: 1048576, reopenMs: 4.2 },
          cases,
        },
        {
          engine: 'pglite',
          version: 'PostgreSQL 18.3, "PGlite"',
          bootMs: null,
          loadMs: null,
          segments: [],
          dbBytes: null,
          wasmBytes: null,
          assets: [],
          snapshot: null,
          cases: { ...cases, crossrefs: null },
          error: 'x',
        },
      ],
    };
    const lines = reportCsv(report).split('\n');
    expect(lines[0]).toBe('метрика,SQLite у браузері,PostgreSQL у браузері');
    expect(lines[1]).toBe('версія,SQLite 3.53.4,"PostgreSQL 18.3, ""PGlite"""');
    expect(lines).toContain('запуск (мс),151,');
    expect(lines).toContain('розмір бази (МБ),36.3,');
    expect(lines).toContain('Перехресні посилання Ів 3:16: медіана (мс),1.2,');
    expect(lines).toHaveLength(9 + BENCH_CASES.length * 3);
    const json = JSON.parse(reportJson(report));
    expect(json.engines[0].cases.chapter).not.toHaveProperty('keys');
    expect(json.engines[0].cases.chapter.medianMs).toBe(1.23);
  });
});
