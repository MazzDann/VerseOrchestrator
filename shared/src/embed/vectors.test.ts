import { describe, expect, it } from 'vitest';
import { EMBED_MODELS, isEmbedModelId, modelBytes, modelFileUrl } from './models';
import { createEmbedder, nearest, packChapter, quantize, similarity } from './vectors';

describe('vectors', () => {
  it('quantizes a vector to a unit int8 one, cut to its width', () => {
    const q = quantize([3, 4, 100], 2);
    expect(Array.from(q)).toEqual([76, 102]); // 0.6 · 127, 0.8 · 127
    expect(similarity(q, q)).toBeCloseTo(1, 2);
    expect(Array.from(quantize([0, 0], 2))).toEqual([0, 0]);
  });

  it('finds the nearest places across chapters, the best first, k of them', () => {
    const v = (a: number, b: number) => quantize([a, b], 2);
    const c1 = packChapter([1, 2, 3], [v(1, 0), v(0, 1), v(1, 1)]);
    const c2 = packChapter([7], [v(-1, 0)]);
    const rows = [
      { book: 10, chapter: 1, ...c1 },
      { book: 20, chapter: 5, ...c2 },
    ];
    const top = nearest(rows, v(1, 0.1), 2);
    expect(top.map((t) => `${t.book}:${t.chapter}:${t.verse}`)).toEqual(['10:1:1', '10:1:3']);
    expect(top[0].score).toBeGreaterThan(0.99);
    expect(nearest(rows, v(-1, 0), 1)[0]).toMatchObject({ book: 20, chapter: 5, verse: 7 });
    // a Buffer at an odd offset (better-sqlite3 hands out pooled ones)
    const pool = new Uint8Array(c1.verses.length + 1);
    pool.set(c1.verses, 1);
    const odd = { book: 1, chapter: 1, verses: pool.subarray(1), vecs: c1.vecs };
    expect(nearest([odd], v(0, 1), 1)[0].verse).toBe(2);
  });

  it('embeds with the model own pooling and prefixes, a long text cut', async () => {
    const seen: number[][] = [];
    const tokenizer = { encode: (t: string) => ({ ids: [...t].map((c) => c.charCodeAt(0)) }) };
    const tensor = (data: BigInt64Array, dims: number[]) => ({ data, dims });
    // mean: last_hidden_state [b, len, 2] = (token id, 1) per token
    const meanSession = {
      inputNames: ['input_ids', 'attention_mask', 'token_type_ids'],
      run: async (feeds: Record<string, unknown>) => {
        const ids = feeds.input_ids as { data: BigInt64Array; dims: number[] };
        const [b, len] = ids.dims;
        seen.push(Array.from(ids.data, Number));
        const h = new Float32Array(b * len * 2);
        for (let i = 0; i < b * len; i++) {
          h[i * 2] = Number(ids.data[i]);
          h[i * 2 + 1] = 1;
        }
        expect(feeds.token_type_ids).toBeDefined();
        return { last_hidden_state: { data: h, dims: [b, len, 2] } };
      },
    };
    const fast = createEmbedder({
      model: { ...EMBED_MODELS.fast, dims: 2, maxTokens: 3 },
      session: meanSession,
      tensor,
      tokenizer,
    });
    const [a, short] = await fast.embed(['abcd', 'a'], 'query');
    expect(seen[0]).toEqual([97, 98, 100, 97, 0, 0]); // cut to 3, keeping the last token; padded
    expect(a.length).toBe(2);
    expect(short[0]).toBeGreaterThan(short[1]); // the padding left out of the mean
    // sentence: the model's own output; the query prefix put in front
    const precise = createEmbedder({
      model: { ...EMBED_MODELS.precise, dims: 2 },
      session: {
        inputNames: ['input_ids', 'attention_mask'],
        run: async (feeds) => {
          const ids = feeds.input_ids as { data: BigInt64Array; dims: number[] };
          seen.push(Array.from(ids.data, Number));
          return { sentence_embedding: { data: new Float32Array([0, 5, 7]), dims: [1, 3] } };
        },
      },
      tensor,
      tokenizer,
    });
    const [p] = await precise.embed(['x'], 'query');
    expect(String.fromCharCode(...seen[1])).toBe('query: x');
    expect(Array.from(p)).toEqual([0, 127]);
    await precise.embed(['x'], 'passage');
    expect(String.fromCharCode(...seen[2])).toBe('x');
  });

  it('pins every model file', () => {
    for (const m of Object.values(EMBED_MODELS)) {
      expect(m.files.map((f) => f.name).sort()).toEqual([
        'model.onnx',
        'tokenizer.json',
        'tokenizer_config.json',
      ]);
      for (const f of m.files) expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(modelFileUrl(m, m.files[0])).toContain(`/resolve/${m.revision}/`);
    }
    expect(modelBytes(EMBED_MODELS.fast)).toBe(135_391_535);
    expect(isEmbedModelId('fast')).toBe(true);
    expect(isEmbedModelId('slow')).toBe(false);
  });
});
