import { create } from 'zustand';
import { isEmbedModelId, type EmbedModelId } from '@vo/shared';
import { useServer } from '../../serverStore';

/**
 * A query's vector for the browser's engines (1.15.0-beta.2): from the server when it is there and
 * its model is one the loaded vectors were made with (it holds the model in memory: 5–17 ms); else
 * the model in a worker here (embed.worker.ts) — downloaded once, the first time.
 */

/** The model the worker downloads — the search panel says how far. */
export const useEmbedProgress = create<{
  progress: { model: EmbedModelId; got: number; total: number } | null;
}>(() => ({ progress: null }));

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: Int8Array) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./embed.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent) => {
    const d = e.data as {
      id?: number;
      ok?: boolean;
      vec?: Int8Array;
      error?: string;
      progress?: { model: EmbedModelId; got: number; total: number } | null;
    };
    if ('progress' in d) useEmbedProgress.setState({ progress: d.progress ?? null });
    if (d.id == null) return;
    const p = pending.get(d.id);
    pending.delete(d.id);
    if (d.ok && d.vec) p?.resolve(d.vec);
    else p?.reject(new Error(d.error ?? 'embed'));
  };
  w.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'embed'));
    pending.clear();
    worker = null;
  };
  worker = w;
  return w;
}

function embedHere(model: EmbedModelId, text: string): Promise<Int8Array> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, model, text });
  });
}

export async function embedQuery(
  text: string,
  models: string[],
): Promise<{ model: string; vec: Int8Array } | null> {
  const usable = models.filter(isEmbedModelId);
  if (!usable.length) return null;
  if (useServer.getState().available !== false) {
    try {
      const res = await fetch(`/api/embed?q=${encodeURIComponent(text)}`);
      if (res.ok) {
        const j = (await res.json()) as { model: string; vec: number[] };
        if (usable.includes(j.model as EmbedModelId))
          return { model: j.model, vec: Int8Array.from(j.vec) };
      }
    } catch {
      // no server: the model here
    }
  }
  const model = usable.includes('fast') ? 'fast' : usable[0];
  return { model, vec: await embedHere(model, text) };
}
