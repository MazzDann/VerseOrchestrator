/// <reference lib="webworker" />
/**
 * HEIC → JPEG off the page (1.14.0-beta.2, the author's ask: «щоб heic на фоні в паралельному
 * потоці підвантажувався»; Q15: the decoder ships in every release). The browser's own decoder
 * first (Safari 17+ reads HEIC); else libheif (LGPL, a 2 MB module loaded at the first HEIC only).
 * The picture comes out at most `max` px on its longer side, as JPEG of `quality`.
 */

interface HeifImage {
  get_width(): number;
  get_height(): number;
  display(data: ImageData, done: (d: ImageData | null) => void): void;
  free?: () => void;
}
interface LibHeif {
  HeifDecoder: new () => { decode(b: Uint8Array): HeifImage[]; free?: () => void };
}

let lib: Promise<LibHeif> | null = null;
const libheif = () =>
  (lib ??= import('libheif-js/libheif-wasm/libheif-bundle.mjs').then(
    (m) => m.default() as Promise<LibHeif>,
  ));

async function decode(bytes: ArrayBuffer): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(new Blob([bytes]));
  } catch {
    /* not this browser's: libheif */
  }
  const heif = await libheif();
  const decoder = new heif.HeifDecoder();
  const images = decoder.decode(new Uint8Array(bytes));
  try {
    const image = images[0];
    if (!image) throw new Error('no image');
    const data = new ImageData(image.get_width(), image.get_height());
    await new Promise<void>((ok, fail) =>
      image.display(data, (d) => (d ? ok() : fail(new Error('decode')))),
    );
    return await createImageBitmap(data);
  } finally {
    for (const i of images) i.free?.();
    decoder.free?.();
  }
}

self.onmessage = async (
  e: MessageEvent<{ id: number; bytes: ArrayBuffer; max: number; quality: number }>,
) => {
  const { id, bytes, max, quality } = e.data;
  try {
    const bitmap = await decode(bytes);
    try {
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      postMessage({ id, ok: true, blob, w, h });
    } finally {
      bitmap.close();
    }
  } catch (err) {
    postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) });
  }
};
