import { isHeic } from '@vo/shared';
import { tr } from '../i18n';
import { phoneGif } from './gif';
import { heicToJpeg } from './heic';

// isHeic moved to @vo/shared (1.14.0-beta.2): the albums read it on the server too
export { isHeic };

/** A file the browser couldn't decode: is it an iPhone's HEIC photo (its type, name or bytes)? */
async function heicFile(file: File): Promise<boolean> {
  if (/^image\/hei[cf]/.test(file.type) || /\.(heic|heif|hif)$/i.test(file.name)) return true;
  try {
    return isHeic(new Uint8Array(await file.slice(0, 64).arrayBuffer()));
  } catch {
    return false;
  }
}

/** Read an image file: its data URL and the decoded image (rejects when the browser can't). */
async function readImage(file: File): Promise<{ dataUrl: string; img: HTMLImageElement }> {
  try {
    return await decodeFile(file);
  } catch (e) {
    // an iPhone's HEIC photo the browser can't open (Chrome, Edge, Firefox): made into a JPEG in a
    // background worker (1.14.0-beta.2, lib/heic.ts) — before, it was refused in words (1.7.0)
    if (!(await heicFile(file))) throw e;
    let jpeg: Blob;
    try {
      jpeg = (await heicToJpeg(file)).blob;
    } catch (err) {
      throw new Error(heicReason((err as Error).message));
    }
    const name = file.name.replace(/\.(heic|heif|hif)$/i, '') + '.jpg';
    return decodeFile(new File([jpeg], name, { type: 'image/jpeg' }));
  }
}

/** Why an HEIC photo didn't convert, in words. */
function heicReason(key: string): string {
  if (key === 'heic-cancelled') return tr('Перетворення HEIC скасовано');
  if (key === 'heic-timeout')
    return tr('Фото HEIC перетворювалося задовго — спробуйте ще раз або збережіть його як JPEG');
  return tr('Не вдалося перетворити фото HEIC: збережіть його як JPEG і додайте ще раз');
}

/** A file's data URL and the decoded image; rejects when the browser can't decode it. */
async function decodeFile(file: File): Promise<{ dataUrl: string; img: HTMLImageElement }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(tr('Не вдалося прочитати зображення')));
    el.src = dataUrl;
  });
  return { dataUrl, img };
}

/** The image redrawn with its longer side `side` px — smoothed well (the default aliased). */
function drawn(img: HTMLImageElement, side: number): HTMLCanvasElement | null {
  const scale = side / Math.max(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Read an image File and return a downscaled JPEG data URL (the slide's background). Keeps
 * localStorage (where appearance is persisted) from blowing past its ~5MB quota.
 */
export async function fileToDownscaledDataUrl(file: File, maxDim = 1920): Promise<string> {
  const { dataUrl, img } = await readImage(file);
  const long = Math.max(img.naturalWidth, img.naturalHeight);
  if (long <= maxDim && dataUrl.length < 1_500_000) return dataUrl;
  const canvas = drawn(img, Math.min(long, maxDim));
  return canvas ? canvas.toDataURL('image/jpeg', 0.85) : dataUrl;
}

/**
 * The logo's longer side (1.4.1): it fills up to 80 % of the slide's width, and a Retina or
 * HiDPI output draws two device pixels per CSS pixel — at 800 px (1.4.0) it went soft there.
 */
export const LOGO_MAX_SIDE = 1600;
/**
 * The most a logo may take, in characters of its data URL (~300 KB of image). It lives in the
 * settings (localStorage) next to the background: an 800 px photo saved as PNG (1.4.0) took up
 * to 1.3 M characters, and in Safari's 5 MB the write could fail.
 */
export const LOGO_MAX_CHARS = 400_000;
/** …shrunk no further than this to fit (a photo that still doesn't is kept at this size). */
export const LOGO_MIN_SIDE = 400;

export interface LogoEncoder {
  /** the image with its longer side `side` px, as a data URL of `type` */
  encode(side: number, type: 'image/png' | 'image/jpeg'): string;
}

/**
 * How a logo is stored (1.4.1). A file that already fits (its longer side and its size) stays
 * as it is. Otherwise it is redrawn at most `LOGO_MAX_SIDE` px long: as PNG when it has
 * transparency or when a PNG fits (flat artwork keeps crisp edges), as JPEG when a PNG doesn't
 * (a photo: several times smaller); still too big — smaller, a quarter at a time.
 */
export function encodeLogo(
  longSide: number,
  original: string,
  transparent: boolean,
  enc: LogoEncoder,
): string {
  if (longSide <= LOGO_MAX_SIDE && original.length <= LOGO_MAX_CHARS) return original;
  let side = Math.min(longSide, LOGO_MAX_SIDE);
  let png = true; // an opaque image stays JPEG once a PNG of it didn't fit
  for (;;) {
    let url = png ? enc.encode(side, 'image/png') : '';
    if (!transparent && (!png || url.length > LOGO_MAX_CHARS)) {
      png = false;
      url = enc.encode(side, 'image/jpeg');
    }
    if (url.length <= LOGO_MAX_CHARS || side <= LOGO_MIN_SIDE) return url;
    side = Math.max(LOGO_MIN_SIDE, Math.round(side * 0.75));
  }
}

/** Any pixel not fully opaque? (A canvas that can't be read counts as transparent: PNG.) */
function hasTransparency(canvas: HTMLCanvasElement): boolean {
  try {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
    return false;
  } catch {
    return true;
  }
}

/** Read a logo file (Налаштування вигляду → Заставка) and return it as stored: `encodeLogo`. */
export async function fileToLogoDataUrl(file: File): Promise<string> {
  const { dataUrl, img } = await readImage(file);
  const long = Math.max(img.naturalWidth, img.naturalHeight);
  if (long <= LOGO_MAX_SIDE && dataUrl.length <= LOGO_MAX_CHARS) return dataUrl;
  const canvases = new Map<number, HTMLCanvasElement | null>();
  const canvasAt = (side: number) => {
    if (!canvases.has(side)) canvases.set(side, drawn(img, side));
    return canvases.get(side) ?? null;
  };
  const first = canvasAt(Math.min(long, LOGO_MAX_SIDE));
  if (!first) return dataUrl; // no canvas here: as it is
  // a JPEG has no transparency; anything else is looked at
  const transparent = file.type !== 'image/jpeg' && hasTransparency(first);
  return encodeLogo(long, dataUrl, transparent, {
    encode: (side, type) => {
      const c = canvasAt(side) ?? first;
      return type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
    },
  });
}

/** A picture for the screen (1.5.0): its longer side at most 4K — larger only costs loading. */
export const PICTURE_MAX_SIDE = 3840;
/** …and its small copy for the phones and the thumbnails. */
export const PICTURE_SMALL_SIDE = 1280;
/** A file that is already a fine picture goes as it is (a GIF keeps its frames). */
const PICTURE_AS_IS_BYTES = 15 * 1024 * 1024;
const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
/** …and a GIF keeps its frames up to the server's own limit (server/src/images.ts). */
const GIF_AS_IS_BYTES = 40 * 1024 * 1024;

/** …and for the phones: a file this small is its own small copy (a re-drawn PNG grew 3×). */
const SMALL_AS_IS_BYTES = 2 * 1024 * 1024;

/**
 * Read an image file for «Зображення» (1.5.0): the file for the screen (itself when it is a PNG,
 * JPEG, WebP or GIF of at most 3840 px and 15 MB, else redrawn — PNG with transparency, JPEG
 * without) and a small copy of at most 1280 px for the phones and the thumbnails (itself when
 * it is that small already, else redrawn the same way). The server keeps both
 * (server/src/images.ts).
 */
export async function fileToPicture(
  file: File,
): Promise<{ name: string; full: string; small: string; w: number; h: number }> {
  const { dataUrl, img } = await readImage(file);
  const [w0, h0] = [img.naturalWidth, img.naturalHeight];
  const long = Math.max(w0, h0);
  const known = PICTURE_TYPES.includes(file.type);
  // a GIF as it is up to what the server takes (40 MB): redrawn, an animation would be its first
  // frame (review of #46); a larger one still goes — as that still frame, not refused
  const fullAsIs =
    (file.type === 'image/gif' && file.size <= GIF_AS_IS_BYTES) ||
    (known && long <= PICTURE_MAX_SIDE && file.size <= PICTURE_AS_IS_BYTES);
  const smallAsIs = known && long <= PICTURE_SMALL_SIDE && file.size <= SMALL_AS_IS_BYTES;
  // an animated GIF the phones would get still (over 2 MB or 1280 px): a small animated copy of
  // its own where the browser can make one (1.7.4, lib/gif.ts) — else its first frame, as before
  const smallGif = file.type === 'image/gif' && !smallAsIs ? await phoneGif(file) : null;
  const fullCanvas = fullAsIs ? null : drawn(img, Math.min(long, PICTURE_MAX_SIDE));
  const smallCanvas = smallAsIs || smallGif ? null : drawn(img, Math.min(long, PICTURE_SMALL_SIDE));
  if ((!fullAsIs && !fullCanvas) || (!smallAsIs && !smallGif && !smallCanvas))
    throw new Error(tr('Не вдалося прочитати зображення'));
  const probe = smallCanvas ?? fullCanvas;
  const transparent = file.type !== 'image/jpeg' && (!probe || hasTransparency(probe));
  const encode = (c: HTMLCanvasElement, q: number) =>
    transparent ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q);
  return {
    name: file.name,
    full: fullCanvas ? encode(fullCanvas, 0.9) : dataUrl,
    small: smallGif ?? (smallCanvas ? encode(smallCanvas, 0.85) : dataUrl),
    w: fullCanvas ? fullCanvas.width : w0,
    h: fullCanvas ? fullCanvas.height : h0,
  };
}
