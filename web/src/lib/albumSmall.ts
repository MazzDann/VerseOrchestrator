/**
 * Small copies of album photos for the phones (1.8.12-beta.2): beta.1 sent them the folder's file
 * (5.36 MB for a 12 MP photo). The control window draws a copy of at most `SMALL_SIDE` px in a
 * worker (albumSmall.worker.ts) and the server keeps it (server/src/albums.ts `putSmall`); the
 * phones' address serves the photo itself until it is there.
 */

/** As «Зображення»'s small copies (lib/image.ts PICTURE_SMALL_SIDE). */
export const SMALL_SIDE = 1280;
export const SMALL_QUALITY = 0.85;

export interface SmallCopy {
  blob: Blob;
  w: number;
  h: number;
  /** the photo's bytes */
  from: number;
  ms: number;
}

/** Workers that draw with OffscreenCanvas (Chrome, Edge, Firefox, Safari 16.4+). */
export const canDrawSmall = () =>
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof createImageBitmap !== 'undefined';

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, (r: SmallCopy | Error) => void>();

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
  w.onerror = () => {
    // a worker that broke: every job waiting fails, the next one starts a new worker
    for (const [id, done] of waiting) {
      waiting.delete(id);
      done(new Error('worker failed'));
    }
    worker = null;
  };
  worker = w;
  return w;
}

/** Draw the small copy of the photo at `src`. */
export function drawSmall(src: string): Promise<SmallCopy> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    waiting.set(id, (r) => (r instanceof Error ? reject(r) : resolve(r)));
    drawer().postMessage({ id, src, side: SMALL_SIDE, quality: SMALL_QUALITY });
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
