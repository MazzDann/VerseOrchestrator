import Database from 'better-sqlite3';
import type { Embedder } from '@vo/shared/embed';

/**
 * «Перевірити, скільки ядер найкраще»: the chosen model makes the same verses on 1, 2, 3 … cores in
 * turn (each in its own low-priority child, embedding.ts), and the fewest cores that make them at
 * least 95 % as fast as the fastest are taken — the same speed, more room for the show. On a Mac with
 * efficiency cores more is slower past the fast ones (an M4: 3 → 284 v/s, 10 → 161), elsewhere more
 * helps less and less (the PC's i3: 4 → 110, 8 → 154).
 */
export interface CoresTestState {
  phase: 'idle' | 'running' | 'done' | 'failed' | 'stopped';
  /** cores being measured now */
  current: number | null;
  /** how many counts the test measures in all */
  total: number;
  results: { threads: number; rate: number }[];
  best: number | null;
  error: string | null;
}

/** 1 … max when there are few; past 12, every second count and then every fourth. */
export function coreCounts(max: number): number[] {
  const out: number[] = [];
  for (let n = 1; n <= max; n += n < 12 ? 1 : n < 24 ? 2 : 4) out.push(n);
  if (out[out.length - 1] !== max) out.push(max);
  return out;
}

/** The fewest cores within 5 % of the fastest. */
export function pickBest(results: { threads: number; rate: number }[]): number | null {
  if (!results.length) return null;
  const top = Math.max(...results.map((r) => r.rate));
  return [...results].sort((a, b) => a.threads - b.threads).find((r) => r.rate >= top * 0.95)!
    .threads;
}

const BATCH = 32;

export function createCoresTest(d: {
  open: (threads: number) => Promise<Embedder & { release: () => Promise<void> }>;
  /** the verses to make, shortest first like the job */
  sample: () => string[];
  onChange: () => void;
  onBest: (threads: number) => void;
  now?: () => number;
}) {
  const now = d.now ?? (() => performance.now());
  let s: CoresTestState = {
    phase: 'idle',
    current: null,
    total: 0,
    results: [],
    best: null,
    error: null,
  };
  let stopping = false;
  const set = (p: Partial<CoresTestState>) => {
    s = { ...s, ...p };
    d.onChange();
  };
  async function run(counts: number[]) {
    const texts = d.sample();
    try {
      if (texts.length < BATCH) throw new Error('too few verses');
      for (const n of counts) {
        if (stopping) return set({ phase: 'stopped', current: null });
        set({ current: n });
        const e = await d.open(n);
        try {
          await e.embed(texts.slice(0, BATCH), 'passage'); // warm-up, not counted
          const t0 = now();
          for (let k = 0; k < texts.length && !stopping; k += BATCH)
            await e.embed(texts.slice(k, k + BATCH), 'passage');
          if (stopping) return set({ phase: 'stopped', current: null });
          const rate = Math.round(texts.length / ((now() - t0) / 1000 || 1));
          set({ results: [...s.results, { threads: n, rate }] });
        } finally {
          await e.release().catch(() => undefined);
        }
      }
      const best = pickBest(s.results);
      if (best !== null) d.onBest(best);
      set({ phase: 'done', current: null, best });
    } catch (e) {
      set({ phase: 'failed', current: null, error: (e as Error).message });
    }
  }
  return {
    state: () => s,
    running: () => s.phase === 'running',
    start(max: number) {
      if (s.phase === 'running') return;
      stopping = false;
      const counts = coreCounts(max);
      s = {
        phase: 'running',
        current: null,
        total: counts.length,
        results: [],
        best: null,
        error: null,
      };
      d.onChange();
      void run(counts);
    },
    stop() {
      if (s.phase === 'running') stopping = true;
    },
  };
}

/** 320 verses spread over the whole library (every 89th row), shortest first like the job. */
export function sampleVerses(libraryPath: string): string[] {
  const db = new Database(libraryPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db
      .prepare("SELECT text FROM verses WHERE text <> '' AND id % 89 = 0 LIMIT 320")
      .all() as { text: string }[];
    return rows.map((r) => r.text).sort((a, b) => a.length - b.length);
  } finally {
    db.close();
  }
}
