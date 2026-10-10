/**
 * HEIC photos made into JPEG in a background worker (1.14.0-beta.2, lib/heic.worker.ts): one worker,
 * one photo at a time (each holds a 48 MB picture while it decodes); a photo that takes over a
 * minute stops the worker and what waited fails in words; «Скасувати» stops it too; it goes after
 * half a minute with nothing to do. `vo:heic` measures each.
 */

/** A converted photo: the JPEG and its pixels. */
export interface Converted {
  blob: Blob;
  w: number;
  h: number;
}

const TIMEOUT_MS = 60_000;
const IDLE_MS = 30_000;

interface Job {
  id: number;
  file: Blob;
  max: number;
  quality: number;
  resolve: (c: Converted) => void;
  reject: (e: Error) => void;
}

let worker: Worker | null = null;
let idle = 0;
let next = 1;
const queue: Job[] = [];
/** the photo the worker has now, its time running from when it was handed over (review) */
let busy: { job: Job; timer: number; t0: number } | null = null;

const stop = (why: string) => {
  worker?.terminate();
  worker = null;
  window.clearTimeout(idle);
  const failed = [...(busy ? [busy.job] : []), ...queue.splice(0)];
  if (busy) window.clearTimeout(busy.timer);
  busy = null;
  for (const j of failed) j.reject(new Error(why));
};

function start(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./heic.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (
    e: MessageEvent<{ id: number; ok: boolean; blob?: Blob; w?: number; h?: number }>,
  ) => {
    if (!busy || busy.job.id !== e.data.id) return;
    const { job, timer, t0 } = busy;
    busy = null;
    window.clearTimeout(timer);
    if (e.data.ok && e.data.blob) {
      performance.measure('vo:heic', { start: t0, end: performance.now() });
      job.resolve({ blob: e.data.blob, w: e.data.w!, h: e.data.h! });
    } else job.reject(new Error('heic-decode'));
    pump();
  };
  w.onerror = () => stop('heic-worker');
  worker = w;
  return w;
}

/** The next photo to the worker once the one before is done. */
function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) {
    window.clearTimeout(idle);
    idle = window.setTimeout(() => stop('heic-idle'), IDLE_MS);
    return;
  }
  window.clearTimeout(idle);
  const w = start();
  busy = {
    job,
    t0: performance.now(),
    timer: window.setTimeout(() => stop('heic-timeout'), TIMEOUT_MS),
  };
  void job.file.arrayBuffer().then(
    (bytes) => {
      if (busy?.job === job)
        w.postMessage({ id: job.id, bytes, max: job.max, quality: job.quality }, [bytes]);
    },
    () => {
      if (busy?.job !== job) return;
      window.clearTimeout(busy.timer);
      busy = null;
      job.reject(new Error('heic-decode'));
      pump();
    },
  );
}

/** An HEIC photo as a JPEG at most `max` px on its longer side. Rejects with a reason key. */
export function heicToJpeg(file: Blob, max = 3840, quality = 0.9): Promise<Converted> {
  return new Promise<Converted>((resolve, reject) => {
    queue.push({ id: next++, file, max, quality, resolve, reject });
    pump();
  });
}

/** «Скасувати»: the photos still converting stop (each fails as cancelled). */
export function cancelHeic(): void {
  stop('heic-cancelled');
}
