/// <reference lib="webworker" />

/**
 * An album photo's small copy for the phones (1.8.12-beta.2, lib/albumSmall.ts), drawn off the
 * control window's thread: the photo is read from the server, drawn at most `side` px on black
 * (as a transparent picture stands on the slide) and encoded as a JPEG.
 */
interface Job {
  id: number;
  src: string;
  side: number;
  quality: number;
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, src, side, quality } = e.data;
  try {
    const started = performance.now();
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const file = await res.blob();
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const canvas = new OffscreenCanvas(w, h);
    const g = canvas.getContext('2d');
    if (!g) throw new Error('no 2d context');
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    postMessage({ id, blob, w, h, from: file.size, ms: performance.now() - started });
  } catch (err) {
    postMessage({ id, error: (err as Error).message || String(err) });
  }
};
