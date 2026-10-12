import Database from 'better-sqlite3';
import type { Embedder, EmbedModelId } from '@vo/shared/embed';

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
  open: (
    model: EmbedModelId,
    threads: number,
  ) => Promise<Embedder & { release: () => Promise<void> }>;
  /** the verses to make, shortest first like the job */
  sample: () => string[];
  onChange: () => void;
  /** the fewest cores within 5 % of the fastest, for this model and limit */
  onBest: (model: EmbedModelId, cap: number, best: { threads: number; rate: number }) => void;
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
  async function run(model: EmbedModelId, counts: number[]): Promise<number | null> {
    const cap = counts[counts.length - 1];
    try {
      const texts = d.sample();
      if (texts.length < BATCH) throw new Error('too few verses');
      for (const n of counts) {
        if (stopping) break;
        set({ current: n });
        const e = await d.open(model, n);
        try {
          await e.embed(texts.slice(0, BATCH), 'passage'); // warm-up, not counted
          const t0 = now();
          for (let k = 0; k < texts.length && !stopping; k += BATCH)
            await e.embed(texts.slice(k, k + BATCH), 'passage');
          if (stopping) break;
          const rate = Math.round(texts.length / ((now() - t0) / 1000 || 1));
          set({ results: [...s.results, { threads: n, rate }] });
        } finally {
          await e.release().catch(() => undefined);
        }
      }
      if (stopping) {
        set({ phase: 'stopped', current: null });
        return null;
      }
      const best = pickBest(s.results);
      if (best !== null) d.onBest(model, cap, s.results.find((r) => r.threads === best)!);
      set({ phase: 'done', current: null, best });
      return best;
    } catch (e) {
      set({ phase: 'failed', current: null, error: (e as Error).message });
      return null;
    } finally {
      stopping = false;
    }
  }
  let pending: Promise<number | null> | null = null;
  return {
    state: () => s,
    running: () => s.phase === 'running',
    /** measures 1 … cap cores (or joins a measure under way): the best count, null if stopped or failed */
    measure(model: EmbedModelId, cap: number): Promise<number | null> {
      if (s.phase === 'running' && pending) return pending;
      stopping = false;
      const counts = coreCounts(cap);
      s = {
        phase: 'running',
        current: null,
        total: counts.length,
        results: [],
        best: null,
        error: null,
      };
      d.onChange();
      pending = run(model, counts);
      return pending;
    },
    /** whether a stop was asked (the job that waits for a measure ends as stopped, not failed) */
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
