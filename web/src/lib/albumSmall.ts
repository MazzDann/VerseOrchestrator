/**
 * Small copies of album photos for the phones (1.8.12-beta.2): beta.1 sent them the folder's file
 * (5.36 MB for a 12 MP photo). The control window draws a copy of at most `SMALL_SIDE` px in a
 * worker (albumSmall.worker.ts) and the server keeps it (server/src/albums.ts `putSmall`); the
 * phones' address serves the photo itself until it is there.
 */

/** As «Зображення»'s small copies (lib/image.ts PICTURE_SMALL_SIDE). */
export const SMALL_SIDE = 1280;
export const SMALL_QUALITY = 0.85;
/** a photo that takes longer (a share gone quiet, a decode stuck) is left to the phones as it is */
export const SMALL_TIMEOUT_MS = 30_000;

export interface SmallCopy {
  blob: Blob;
  w: number;
  h: number;
  /** the photo's bytes */
  from: number;
  ms: number;
}

let worker: Worker | null = null;
/** the worker could not start or broke: no more copies in this window (the phones get the photo) */
let broken = false;
let nextId = 0;
const waiting = new Map<number, (r: SmallCopy | Error) => void>();

/** Workers that draw with OffscreenCanvas (Chrome, Edge, Firefox, Safari 16.4+), and ours works. */
export const canDrawSmall = () =>
  !broken &&
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof createImageBitmap !== 'undefined';

/** Every job still waiting fails; the worker goes (a new one starts unless it is broken). */
function dropWorker(why: string, isBroken: boolean) {
  worker?.terminate();
  worker = null;
  if (isBroken) broken = true;
  for (const [id, done] of waiting) {
    waiting.delete(id);
    done(new Error(why));
  }
}

function drawer(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./albumSmall.worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<{ id: number; error?: string } & Partial<SmallCopy>>) => {
    const done = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    if (!done) return;
    if (e.data.error || !e.data.blob) done(new Error(e.data.error ?? 'no copy'));
    else done(e.data as SmallCopy);
  };
  // a module worker that can't load (an old browser) or crashed: none again in this window
  w.onerror = () => dropWorker('worker failed', true);
  worker = w;
  return w;
}

/** Draw the small copy of the photo at `src`. */
export function drawSmall(src: string): Promise<SmallCopy> {
  return new Promise((resolve, reject) => {
    if (!canDrawSmall()) return reject(new Error('no worker'));
    const id = ++nextId;
    const timer = window.setTimeout(() => {
      if (waiting.has(id)) dropWorker('timed out', false);
    }, SMALL_TIMEOUT_MS);
    waiting.set(id, (r) => {
      window.clearTimeout(timer);
      if (r instanceof Error) reject(r);
      else resolve(r);
    });
    try {
      drawer().postMessage({ id, src, side: SMALL_SIDE, quality: SMALL_QUALITY });
    } catch (e) {
      dropWorker((e as Error).message || 'no worker', true);
    }
  });
}

/**
 * The order to draw an album's missing copies in: the photo on screen and the next two first
 * (the phones ask for them now), then the rest from the start.
 */
export function smallOrder(count: number, current: number | null, missing: (i: number) => boolean) {
  const first = current == null ? [] : [current, current + 1, current + 2];
  const all = [...first, ...Array.from({ length: count }, (_, i) => i)];
  return [...new Set(all)].filter((i) => i >= 0 && i < count && missing(i));
}
