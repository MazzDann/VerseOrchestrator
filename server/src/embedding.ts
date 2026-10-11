import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import {
  createEmbedder,
  EMBED_MODELS,
  loadTokenizer,
  type Embedder,
  type EmbedModelId,
} from '@vo/shared/embed';
import { modelDir, modelInstalled } from './models.js';

/**
 * A model of data/models/ running on this computer's processor (onnxruntime-node, 1.15.0-beta.2).
 * Measured on the PC (i3-10100F, 4 cores / 8 threads): «Швидка» 195 verses/s, «Точна» 42 on 8
 * threads; a query 5 / 17 ms.
 */
export async function openEmbedder(
  dataDir: string,
  id: EmbedModelId,
  threads: number,
): Promise<Embedder & { release: () => Promise<void> }> {
  const dir = modelDir(dataDir, id);
  const session = await ort.InferenceSession.create(path.join(dir, 'model.onnx'), {
    executionProviders: ['cpu'],
    intraOpNumThreads: threads,
  });
  const [json, config] = await Promise.all([
    fsp.readFile(path.join(dir, 'tokenizer.json'), 'utf8'),
    fsp.readFile(path.join(dir, 'tokenizer_config.json'), 'utf8'),
  ]);
  const e = createEmbedder({
    model: EMBED_MODELS[id],
    session: session as never,
    tensor: (data, dims) => new ort.Tensor('int64', data, dims),
    tokenizer: loadTokenizer(JSON.parse(json), JSON.parse(config)),
  });
  return { ...e, release: () => session.release() };
}

/** Half the processor: the show goes on while vectors are made. */
export const jobThreads = () => Math.max(1, Math.floor(os.availableParallelism() / 2));

/** Ten idle minutes and the query model leaves memory (Точна holds ≈ 0.5 GB). */
const IDLE_MS = 10 * 60 * 1000;

/**
 * The model for queries («~ …» from any window, phone, remote): the chosen one, opened at the
 * first query and let go after a while without any.
 */
export function createQueryEmbedder(dataDir: string, chosen: () => EmbedModelId | null) {
  let open: { id: EmbedModelId; e: Promise<Embedder & { release: () => Promise<void> }> } | null =
    null;
  let timer: NodeJS.Timeout | null = null;
  const release = async () => {
    const o = open;
    open = null;
    if (timer) clearTimeout(timer);
    timer = null;
    if (o) await (await o.e.catch(() => null))?.release().catch(() => undefined);
  };
  return {
    async embed(text: string): Promise<{ model: EmbedModelId; vec: Int8Array } | null> {
      const id = chosen();
      if (!id || !modelInstalled(dataDir, id)) return null;
      // taken at once, before any await: two queries at the same moment share one session
      if (open?.id !== id) {
        void release();
        open = { id, e: openEmbedder(dataDir, id, 2) };
      }
      const mine = open;
      try {
        const e = await mine.e;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void release(), IDLE_MS);
        timer.unref();
        const [vec] = await e.embed([text], 'query');
        return { model: id, vec };
      } catch (err) {
        console.warn(`[embed] ${id}: ${(err as Error).message}`);
        // a session that failed to open is dropped (one that a newer choice replaced is not)
        if (open === mine) await release();
        return null;
      }
    },
    release,
  };
}
