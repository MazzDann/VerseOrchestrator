import type { EmbedModel } from './models.js';

/**
 * Text → a vector, and a scan over stored vectors (1.15.0-beta.2). The ONNX runtime is the
 * caller's: onnxruntime-node on the server, onnxruntime-web in the browser — the same model, the
 * same tokenizer, the same numbers.
 *
 * Vectors are kept as int8 (×127 of a unit vector): measured, no query found or lost against
 * float32 (20 / 20 the same), a quarter of the room.
 */

export interface OrtTensorLike {
  readonly data: unknown;
  readonly dims: readonly number[];
}

export interface OrtSessionLike {
  readonly inputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensorLike>>;
}

/** `new ort.Tensor('int64', data, dims)` of the caller's runtime. */
export type MakeTensor = (data: BigInt64Array, dims: number[]) => unknown;

export interface TokenizerLike {
  encode(text: string): { ids: number[] };
}

/** A unit vector cut to `dims`, as int8. */
export function quantize(v: ArrayLike<number>, dims: number): Int8Array {
  const n = Math.min(dims, v.length);
  let norm = 0;
  for (let i = 0; i < n; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Int8Array(n);
  for (let i = 0; i < n; i++)
    out[i] = Math.max(-127, Math.min(127, Math.round((v[i] / norm) * 127)));
  return out;
}

/** Cosine of two int8 unit vectors (≈, within the rounding). */
export function similarity(a: Int8Array, b: Int8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s / (127 * 127);
}

export function createEmbedder(o: {
  model: EmbedModel;
  session: OrtSessionLike;
  tensor: MakeTensor;
  tokenizer: TokenizerLike;
}) {
  const m = o.model;
  async function run(texts: string[]): Promise<Int8Array[]> {
    const enc = texts.map((t) => {
      const ids = o.tokenizer.encode(t).ids;
      // too long: cut, keeping the closing token
      return ids.length > m.maxTokens
        ? [...ids.slice(0, m.maxTokens - 1), ids[ids.length - 1]]
        : ids;
    });
    const len = Math.max(1, ...enc.map((e) => e.length));
    const ids = new BigInt64Array(texts.length * len);
    const mask = new BigInt64Array(texts.length * len);
    enc.forEach((e, i) =>
      e.forEach((id, j) => {
        ids[i * len + j] = BigInt(id);
        mask[i * len + j] = 1n;
      }),
    );
    const feeds: Record<string, unknown> = {
      input_ids: o.tensor(ids, [texts.length, len]),
      attention_mask: o.tensor(mask, [texts.length, len]),
    };
    if (o.session.inputNames.includes('token_type_ids'))
      feeds.token_type_ids = o.tensor(new BigInt64Array(texts.length * len), [texts.length, len]);
    const out = await o.session.run(feeds);
    if (m.pooling === 'sentence' && out.sentence_embedding) {
      const t = out.sentence_embedding;
      const d = t.dims[1];
      const data = t.data as Float32Array;
      return texts.map((_, i) => quantize(data.subarray(i * d, (i + 1) * d), m.dims));
    }
    const t = out.last_hidden_state ?? out.token_embeddings;
    const d = t.dims[2];
    const h = t.data as Float32Array;
    return texts.map((_, i) => {
      const v = new Float32Array(d);
      let c = 0;
      for (let j = 0; j < len; j++) {
        if (!mask[i * len + j]) continue;
        c++;
        const at = (i * len + j) * d;
        for (let k = 0; k < d; k++) v[k] += h[at + k];
      }
      for (let k = 0; k < d; k++) v[k] /= c || 1;
      return quantize(v, m.dims);
    });
  }
  return {
    model: m,
    /** int8 vectors of the model's width, one per text, in order */
    embed(texts: string[], as: 'query' | 'passage'): Promise<Int8Array[]> {
      const prefix = as === 'query' ? m.queryPrefix : m.passagePrefix;
      return run(texts.map((t) => prefix + t));
    },
  };
}

export type Embedder = ReturnType<typeof createEmbedder>;

/**
 * One chapter's vectors as stored (`chapter_vectors`): its verse numbers as int16 (little-endian)
 * and its vectors one after another. A row per chapter, not per verse — measured on better-sqlite3,
 * 31 102 verses: a row per verse read + scanned 81 ms, a row per chapter 37 ms.
 */
export interface ChapterVectors {
  book: number;
  chapter: number;
  verses: Uint8Array;
  vecs: Uint8Array;
}

export function packChapter(
  verses: number[],
  vecs: Int8Array[],
): { verses: Uint8Array; vecs: Uint8Array } {
  const nums = new Uint8Array(verses.length * 2);
  const dv = new DataView(nums.buffer);
  verses.forEach((v, i) => dv.setInt16(i * 2, v, true));
  const d = vecs[0]?.length ?? 0;
  const all = new Int8Array(vecs.length * d);
  vecs.forEach((v, i) => all.set(v, i * d));
  return { verses: nums, vecs: new Uint8Array(all.buffer) };
}

export interface Scored {
  book: number;
  chapter: number;
  verse: number;
  /** cosine, ≈ */
  score: number;
}

/** The `k` places of these chapters nearest to `q`, the best first. */
export function nearest(rows: Iterable<ChapterVectors>, q: Int8Array, k: number): Scored[] {
  const d = q.length;
  const top: Scored[] = [];
  let floor = -Infinity;
  for (const r of rows) {
    const x = new Int8Array(r.vecs.buffer, r.vecs.byteOffset, r.vecs.byteLength);
    const nums = new DataView(r.verses.buffer, r.verses.byteOffset, r.verses.byteLength);
    const n = Math.min(x.length / d, nums.byteLength / 2);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const at = i * d;
      for (let j = 0; j < d; j++) s += x[at + j] * q[j];
      if (s <= floor) continue;
      const item = {
        book: r.book,
        chapter: r.chapter,
        verse: nums.getInt16(i * 2, true),
        score: s,
      };
      let lo = 0;
      let hi = top.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (top[mid].score >= s) lo = mid + 1;
        else hi = mid;
      }
      top.splice(lo, 0, item);
      if (top.length > k) top.pop();
      if (top.length === k) floor = top[k - 1].score;
    }
  }
  for (const t of top) t.score /= 127 * 127;
  return top;
}
