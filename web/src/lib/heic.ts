/**
 * HEIC photos made into JPEG in a background worker (1.14.0-beta.2, lib/heic.worker.ts): one worker,
 * a queue; a photo that takes over a minute stops it (and what waited — they fail in words);
 * «Скасувати» stops it too; it goes after half a minute with nothing to do. `vo:heic` measures.
 */

/** A converted photo: the JPEG and its pixels. */
export interface Converted {
  blob: Blob;
  w: number;
  h: number;
}

const TIMEOUT_MS = 60_000;
const IDLE_MS = 30_000;

let worker: Worker | null = null;
let idle = 0;
let next = 1;
const waiting = new Map<
  number,
  { resolve: (c: Converted) => void; reject: (e: Error) => void; timer: number }
>();

const stop = (why: string) => {
  worker?.terminate();
  worker = null;
  window.clearTimeout(idle);
  for (const w of waiting.values()) {
    window.clearTimeout(w.timer);
    w.reject(new Error(why));
  }
  waiting.clear();
};

function start(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./heic.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (
    e: MessageEvent<{
      id: number;
      ok: boolean;
      blob?: Blob;
      w?: number;
      h?: number;
      error?: string;
    }>,
  ) => {
    const job = waiting.get(e.data.id);
    if (!job) return;
    waiting.delete(e.data.id);
    window.clearTimeout(job.timer);
    if (e.data.ok && e.data.blob) job.resolve({ blob: e.data.blob, w: e.data.w!, h: e.data.h! });
    else job.reject(new Error('heic-decode'));
    if (waiting.size === 0) idle = window.setTimeout(() => stop('heic-idle'), IDLE_MS);
  };
  w.onerror = () => stop('heic-worker');
  worker = w;
  return w;
}

/** An HEIC photo as a JPEG at most `max` px on its longer side. Rejects with a reason key. */
export function heicToJpeg(file: Blob, max = 3840, quality = 0.9): Promise<Converted> {
  return file.arrayBuffer().then(
    (bytes) =>
      new Promise<Converted>((resolve, reject) => {
        const id = next++;
        const t0 = performance.now();
        window.clearTimeout(idle);
        const timer = window.setTimeout(() => stop('heic-timeout'), TIMEOUT_MS);
        waiting.set(id, {
          resolve: (c) => {
            performance.measure('vo:heic', { start: t0, end: performance.now() });
            resolve(c);
          },
          reject,
          timer,
        });
        start().postMessage({ id, bytes, max, quality }, [bytes]);
      }),
  );
}

/** «Скасувати»: the photos still converting stop (each fails as cancelled). */
export function cancelHeic(): void {
  stop('heic-cancelled');
}
