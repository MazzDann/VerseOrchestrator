/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import {
  createEmbedder,
  EMBED_MODELS,
  loadTokenizer,
  modelFileUrl,
  type Embedder,
  type EmbedModelId,
  type ModelFile,
} from '@vo/shared/embed';

/**
 * «Пошук за змістом» with no server (1.15.0-beta.2): the model runs here, in its own worker, on
 * onnxruntime-web (WASM, from the app itself). Its files come from Hugging Face at the pinned
 * revision once and stay in Cache Storage; each is checked by its SHA-256 where the page may do it
 * (a secure context — crypto.subtle).
 */

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
// threads need a cross-origin-isolated page; one is enough for a query
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency) : 1;

const CACHE = 'vo-models-v1';
const open = new Map<EmbedModelId, Promise<Embedder>>();

type Req = { id: number; model: EmbedModelId; text: string };

async function file(
  m: (typeof EMBED_MODELS)[EmbedModelId],
  f: ModelFile,
  onBytes: (n: number) => void,
) {
  const url = modelFileUrl(m, f);
  const cache = 'caches' in self ? await caches.open(CACHE).catch(() => null) : null;
  const hit = await cache?.match(url);
  if (hit) {
    onBytes(f.size);
    return hit.arrayBuffer();
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const buf = new Uint8Array(f.size);
  let at = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (at + value.length > buf.length) throw new Error('size');
    buf.set(value, at);
    at += value.length;
    onBytes(value.length);
  }
  if (at !== f.size) throw new Error('size');
  if (crypto.subtle) {
    const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (hex !== f.sha256) throw new Error('sha256');
  }
  await cache?.put(url, new Response(buf)).catch(() => undefined);
  return buf.buffer;
}

function load(id: EmbedModelId): Promise<Embedder> {
  let p = open.get(id);
  if (!p) {
    p = (async () => {
      const m = EMBED_MODELS[id];
      const total = m.files.reduce((n, f) => n + f.size, 0);
      let got = 0;
      const tick = (n: number) => {
        got += n;
        self.postMessage({ progress: { model: id, got, total } });
      };
      const bytes = new Map<string, ArrayBuffer>();
      for (const f of m.files) bytes.set(f.name, await file(m, f, tick));
      const text = (name: string) => new TextDecoder().decode(bytes.get(name));
      const session = await ort.InferenceSession.create(new Uint8Array(bytes.get('model.onnx')!), {
        executionProviders: ['wasm'],
      });
      self.postMessage({ progress: null });
      return createEmbedder({
        model: m,
        session: session as never,
        tensor: (data, dims) => new ort.Tensor('int64', data, dims),
        tokenizer: loadTokenizer(
          JSON.parse(text('tokenizer.json')),
          JSON.parse(text('tokenizer_config.json')),
        ),
      });
    })();
    p.catch(() => open.delete(id));
    open.set(id, p);
  }
  return p;
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, model, text } = e.data;
  try {
    const [vec] = await (await load(model)).embed([text], 'query');
    self.postMessage({ id, ok: true, vec }, [vec.buffer]);
  } catch (err) {
    self.postMessage({ progress: null });
    self.postMessage({ id, ok: false, error: (err as Error).message });
  }
};
