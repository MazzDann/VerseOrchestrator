import { Tokenizer } from '@huggingface/tokenizers';
import type { TokenizerLike } from './vectors.js';

/**
 * The tokenizer of a model (its tokenizer.json + tokenizer_config.json) — apart from @vo/shared's
 * index (`@vo/shared/embed`), so the interface doesn't carry it until a query by meaning needs it.
 */
export function loadTokenizer(json: unknown, config: unknown): TokenizerLike {
  return new Tokenizer(json as object, config as object);
}

export * from './models.js';
export * from './vectors.js';
