import { N_ } from '../i18n/index.js';

/**
 * «Пошук за змістом» (1.15.0-beta.2, users' ask F1005-08): the two models the operator chooses
 * between (the author's call 2026-10-11 — «обидві на вибір»). Neither ships with the app: each is
 * downloaded on a click, from Hugging Face at a pinned revision, every file checked by its SHA-256.
 *
 * Measured on the PC (i3-10100F, the NT of UBIO'62 = 7958 verses, 20 queries in the operator's
 * words, int8 ONNX on onnxruntime-node, 8 threads): «Точна» found 17 / 20 in its top ten, 12 first
 * (MRR 0.71 at 256 dims), 42 verses/s; «Швидка» 15 / 20, 11 first (MRR 0.60), 195 verses/s.
 */
export type EmbedModelId = 'fast' | 'precise';
export const EMBED_MODEL_IDS: readonly EmbedModelId[] = ['fast', 'precise'];

export interface ModelFile {
  /** the name it is kept under in data/models/<id>/ */
  name: 'model.onnx' | 'tokenizer.json' | 'tokenizer_config.json';
  /** its path in the repository */
  path: string;
  size: number;
  sha256: string;
}

export interface EmbedModel {
  id: EmbedModelId;
  /** what the settings call it (an interface key) */
  label: string;
  /** the model's own name, and its licence */
  name: string;
  licence: string;
  repo: string;
  revision: string;
  files: ModelFile[];
  /** mean over the tokens (`last_hidden_state`), or the model's own `sentence_embedding` */
  pooling: 'mean' | 'sentence';
  queryPrefix: string;
  passagePrefix: string;
  /** the width kept (Matryoshka models lose little when cut) */
  dims: number;
  /** a verse longer than this is cut (the longest verses run ≈ 110 tokens) */
  maxTokens: number;
  /**
   * How «~ …» weighs its places (library/meaning.ts, 1.16.0-beta.5): the query words' share in a
   * verse's closeness, and how far below the best a place still shows — each model its own,
   * measured on HOM with 44 queries.
   */
  ranking: { wordsWeight: number; cut: number };
}

export const EMBED_MODELS: Record<EmbedModelId, EmbedModel> = {
  fast: {
    id: 'fast',
    label: N_('Швидка'),
    name: 'paraphrase-multilingual-MiniLM-L12-v2',
    licence: 'Apache-2.0',
    repo: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    revision: '2c4055b12046f11709e9df2c122e59ffbdc2f900',
    files: [
      {
        name: 'model.onnx',
        path: 'onnx/model_quantized.onnx',
        size: 118_308_126,
        sha256: '66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc',
      },
      {
        name: 'tokenizer.json',
        path: 'tokenizer.json',
        size: 17_082_913,
        sha256: 'b60b6b43406a48bf3638526314f3d232d97058bc93472ff2de930d43686fa441',
      },
      {
        name: 'tokenizer_config.json',
        path: 'tokenizer_config.json',
        size: 496,
        sha256: '3f5961b9ac86288cccdb97f32fb848d6187c78e1603958c53f3ea1f296b7d8a2',
      },
    ],
    pooling: 'mean',
    queryPrefix: '',
    passagePrefix: '',
    dims: 384,
    maxTokens: 128,
    // MRR@10 0.33 → 0.55 with the words at 0.25; hits sat ≤ 0.20 below the best (p90)
    ranking: { wordsWeight: 0.25, cut: 0.2 },
  },
  precise: {
    id: 'precise',
    label: N_('Точна'),
    name: 'snowflake-arctic-embed-m-v2.0',
    licence: 'Apache-2.0',
    repo: 'Snowflake/snowflake-arctic-embed-m-v2.0',
    revision: '95c2741480856aa9666782eb4afe11959938017f',
    files: [
      {
        name: 'model.onnx',
        path: 'onnx/model_quantized.onnx',
        size: 310_916_060,
        sha256: '03d923bb1850ebdccb068e2f3abd8aa43fe81c50d07d037ef103fe3d0fb78e3b',
      },
      {
        name: 'tokenizer.json',
        path: 'tokenizer.json',
        size: 17_083_009,
        sha256: 'f1cc44ad7faaeec47241864835473fd5403f2da94673f3f764a77ebcb0a803ec',
      },
      {
        name: 'tokenizer_config.json',
        path: 'tokenizer_config.json',
        size: 1340,
        sha256: '6f00514620aff01ba8b7291b2394e98daca5be264cb743805232d9ae27494b2a',
      },
    ],
    pooling: 'sentence',
    queryPrefix: 'query: ',
    passagePrefix: '',
    dims: 256,
    maxTokens: 128,
    // it reads words and names well itself: 0.25 pulled it down to 0.53, 0.10 gives 0.58 (0.52
    // with the vectors alone); its scores lie closer — hits ≤ 0.17 below the best (p90)
    ranking: { wordsWeight: 0.1, cut: 0.17 },
  },
};

export const isEmbedModelId = (v: unknown): v is EmbedModelId =>
  typeof v === 'string' && (EMBED_MODEL_IDS as readonly string[]).includes(v);

/** Where a model's file is downloaded from — its pinned revision. */
export const modelFileUrl = (m: EmbedModel, f: ModelFile): string =>
  `https://huggingface.co/${m.repo}/resolve/${m.revision}/${f.path}`;

/** All of a model's files, in bytes. */
export const modelBytes = (m: EmbedModel): number => m.files.reduce((n, f) => n + f.size, 0);
