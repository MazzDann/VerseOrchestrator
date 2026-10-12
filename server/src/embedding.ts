import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEmbedder,
  EMBED_MODELS,
  loadTokenizer,
  type Embedder,
  type EmbedModelId,
} from '@vo/shared/embed';
import { modelDir, modelInstalled } from './models.js';

/**
 * onnxruntime-node, loaded on first use — never at the server's start: a system its native runtime
 * doesn't fit (an Intel Mac, an old Linux) still runs the app, and only a search by meaning says it
 * can't (1.15.0 — found in the update run: a top-level import would stop the whole server).
 */
let runtime: Promise<typeof import('onnxruntime-node')> | null = null;
export const loadRuntime = () => (runtime ??= import('onnxruntime-node'));

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
  const ort = await loadRuntime();
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

/** Apple Silicon's performance cores (sysctl hw.perflevel0), null elsewhere or unknown. */
function appleFastCores(): number | null {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') return null;
  const r = spawnSync('sysctl', ['-n', 'hw.perflevel0.logicalcpu'], {
    encoding: 'utf8',
    timeout: 2000,
  });
  const n = Number.parseInt(r.stdout ?? '', 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}
let fastCores: number | null | undefined;

/**
 * «Ядра процесора» for the vectors: `all` the processor has, at most `max` of them — one always left
 * to the show and the system — and `auto`, what «Авто» takes: half, or on Apple Silicon its fast cores
 * less one. Measured: the PC (i3-10100F, 4 cores / 8 threads) «Швидка» 110 v/s on 4, 154 on 8, «Точна»
 * 22 → 42; two or four sessions side by side gave nothing (111 / 81), nor did the GPU (GTX 1650,
 * DirectML, fp16: 131–135). A MacBook Air M4 (4 fast + 6 efficiency cores; 3 000 verses, «Швидка»):
 * 2 → 231, 3 → 284, 4 → 263, 5 → 242, 8 → 227, 10 → 161 v/s — the efficiency cores hold the rest back.
 */
export function cpuInfo(all = os.availableParallelism(), fast = (fastCores ??= appleFastCores())) {
  const max = Math.max(1, all - 1);
  const auto = Math.min(max, fast ? Math.max(2, fast - 1) : Math.max(1, Math.floor(all / 2)));
  return { all, max, auto, fast };
}

/** The cores a job takes: the chosen number within this computer's limit, or «Авто». */
export const jobThreads = (threads: number | null, cpu = cpuInfo()) =>
  Math.min(cpu.max, Math.max(1, threads ?? cpu.auto));

const TASKPOLICY = '/usr/sbin/taskpolicy';

/**
 * The job's model in a child process of the lowest priority (embedWorker.ts): the operating system
 * gives the show, the browser and everything else the processor first, so making vectors never
 * freezes the computer. The query model stays in the server (a query is a few milliseconds).
 */
export function openChildEmbedder(
  dataDir: string,
  id: EmbedModelId,
  threads: number,
): Promise<Embedder & { release: () => Promise<void> }> {
  const args = [...process.execArgv, fileURLToPath(new URL('./embedWorker.ts', import.meta.url))];
  // macOS barely heeds nice alone (an M4, 9 threads: a foreground task kept 47 % of its speed); the
  // «utility» QoS class makes the job give way (82 %) and costs it little when the Mac is idle
  const qos = process.platform === 'darwin' && fs.existsSync(TASKPOLICY);
  const child = spawn(
    qos ? TASKPOLICY : process.execPath,
    qos ? ['-c', 'utility', process.execPath, ...args] : args,
    // advanced: the vectors cross as Int8Arrays, not JSON
    {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      serialization: 'advanced',
      windowsHide: true,
    },
  );
  try {
    if (child.pid) os.setPriority(child.pid, os.constants.priority.PRIORITY_LOW);
  } catch {
    // not allowed here: the job still runs, at the usual priority
  }
  const waiting = new Map<number, { ok: (v: Int8Array[]) => void; fail: (e: Error) => void }>();
  let next = 0;
  let gone: Error | null = null;
  const failAll = (e: Error) => {
    gone ??= e;
    for (const w of waiting.values()) w.fail(gone);
    waiting.clear();
  };
  child.on('message', (m: WorkerReply) => {
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.error) w.fail(new Error(m.error));
    else w.ok(m.vectors ?? []);
  });
  // every error, not the first: a send after the channel closed comes as one too (review)
  child.on('error', (e) => failAll(e));
  child.once('exit', (code, signal) =>
    failAll(new Error(`embedWorker exited (${signal ?? code})`)),
  );
  const ask = (msg: WorkerAsk) =>
    new Promise<Int8Array[]>((ok, fail) => {
      if (gone) return fail(gone);
      waiting.set(msg.id, { ok, fail });
      child.send(msg);
    });
  // resolves once the child is gone: on Windows its model.onnx stays locked until then (review —
  // «Видалити модель» right after a stop)
  const release = () =>
    new Promise<void>((done) => {
      if (child.exitCode !== null || child.signalCode !== null) return done();
      const t = setTimeout(done, 5000);
      child.once('exit', () => {
        clearTimeout(t);
        done();
      });
      child.kill();
    });
  return ask({ id: next++, open: { dataDir, model: id, threads } }).then(
    () => ({
      model: EMBED_MODELS[id],
      embed: (texts: string[], as: 'query' | 'passage') => ask({ id: next++, texts, as }),
      release,
    }),
    async (e: Error) => {
      await release();
      throw e;
    },
  );
}

/** Messages to and from embedWorker.ts. */
export type WorkerAsk =
  | { id: number; open: { dataDir: string; model: EmbedModelId; threads: number } }
  | { id: number; texts: string[]; as: 'query' | 'passage' };
export interface WorkerReply {
  id: number;
  vectors?: Int8Array[];
  error?: string;
}

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
