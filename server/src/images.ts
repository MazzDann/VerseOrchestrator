import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from './jsonFile.js';

/**
 * Pictures on screen (1.5.0): the operator's images, kept by the server in data/images/ so the
 * control window, the output windows and the phones load them by address, and a running order
 * or a saved program refers to them by id (a picture in the settings or a slide would fill the
 * browser's storage). Each picture is two files the browser made: the one for the screen (its
 * own file when it fits, else redrawn to at most 3840 px) and a small one (1280 px) for the
 * phones and the thumbnails. Only PNG, JPEG, WebP and GIF — told by their first bytes, never by
 * a name: an SVG served from this origin could run script.
 */

export const IMAGES_DIR = 'images';
const INDEX = 'index.json';
const TRASH = '.trash';
/** deleted pictures kept for «Скасувати» (and by hand) */
const TRASH_KEEP = 20;
export const MAX_FULL_BYTES = 40 * 1024 * 1024;
export const MAX_SMALL_BYTES = 4 * 1024 * 1024;

export type ImageExt = 'jpg' | 'png' | 'webp' | 'gif';

export interface StoredImage {
  id: string;
  /** the file's name as the operator knows it, without its extension */
  name: string;
  ext: ImageExt;
  smallExt: ImageExt;
  /** the screen file's pixels */
  w: number;
  h: number;
  /** the screen file's bytes */
  size: number;
  /** ISO time it was added */
  added: string;
}

export const imagesDir = (dataDir: string) => path.join(dataDir, IMAGES_DIR);

/** What a file is, by its first bytes — the only types served. */
export function sniff(b: Uint8Array): ImageExt | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 6 && String.fromCharCode(...b.subarray(0, 4)) === 'GIF8') return 'gif';
  if (
    b.length >= 12 &&
    String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.subarray(8, 12)) === 'WEBP'
  )
    return 'webp';
  return null;
}

/** The bytes of a base64 data URL (`data:<type>;base64,…`), or null. */
export function fromDataUrl(url: unknown): Buffer | null {
  if (typeof url !== 'string') return null;
  const m = /^data:[\w/+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
  return m ? Buffer.from(m[1], 'base64') : null;
}

/** A name to show: the file's name without its folder and extension, at most 120 characters. */
export function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const base = s.split(/[\\/]/).pop() ?? '';
  const name = base
    .replace(/\.[^.]{1,5}$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFC');
  return name.slice(0, 120) || 'image';
}

const fileOf = (img: Pick<StoredImage, 'id' | 'ext'>) => `${img.id}.${img.ext}`;
const smallOf = (img: Pick<StoredImage, 'id' | 'smallExt'>) => `${img.id}.small.${img.smallExt}`;

/** Only names this module writes: `<uuid>.<ext>` or `<uuid>.small.<ext>`. */
const FILE_NAME = /^[0-9a-f-]{36}(\.small)?\.(jpg|png|webp|gif)$/;
export const isImageFile = (name: string) => FILE_NAME.test(name);

function readIndex(dir: string): StoredImage[] {
  const raw = readJson<{ images?: unknown }>(path.join(dir, INDEX), { images: [] });
  return Array.isArray(raw.images) ? (raw.images as StoredImage[]) : [];
}
const writeIndex = (dir: string, images: StoredImage[]) =>
  writeJson(path.join(dir, INDEX), { images });

/** The pictures whose files are there, newest first. */
export function listImages(dir: string): StoredImage[] {
  return readIndex(dir)
    .filter((i) => i && typeof i.id === 'string' && fs.existsSync(path.join(dir, fileOf(i))))
    .sort((a, b) => b.added.localeCompare(a.added));
}

export interface NewImage {
  name: unknown;
  full: unknown;
  small: unknown;
  w: unknown;
  h: unknown;
}

/** Why a picture was refused — keys of the server's messages (index.ts turns them into words). */
export type ImageRefusal = 'type' | 'size' | 'shape';

/** Keep a picture the browser sent. A refusal says why; nothing is written then. */
export function addImage(
  dir: string,
  input: NewImage,
  now = new Date(),
): StoredImage | { refused: ImageRefusal } {
  const full = fromDataUrl(input.full);
  const small = fromDataUrl(input.small);
  const w = Number(input.w);
  const h = Number(input.h);
  if (!full || !small || !(w > 0 && w <= 20000) || !(h > 0 && h <= 20000))
    return { refused: 'shape' };
  const ext = sniff(full);
  const smallExt = sniff(small);
  if (!ext || !smallExt) return { refused: 'type' };
  if (full.length > MAX_FULL_BYTES || small.length > MAX_SMALL_BYTES) return { refused: 'size' };
  const img: StoredImage = {
    id: crypto.randomUUID(),
    name: cleanName(input.name),
    ext,
    smallExt,
    w: Math.round(w),
    h: Math.round(h),
    size: full.length,
    added: now.toISOString(),
  };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileOf(img)), full);
  fs.writeFileSync(path.join(dir, smallOf(img)), small);
  writeIndex(dir, [img, ...readIndex(dir).filter((i) => i.id !== img.id)]);
  return img;
}

/**
 * Move a picture aside, into `.trash/`, so «Скасувати» can bring it back; the oldest there go
 * once there are more than twenty. A running order that still shows it gets a black slide.
 */
export function trashImage(
  dir: string,
  id: string,
): { trashed: string; image: StoredImage } | null {
  const all = readIndex(dir);
  const img = all.find((i) => i.id === id);
  if (!img || !fs.existsSync(path.join(dir, fileOf(img)))) return null;
  const trash = path.join(dir, TRASH);
  fs.mkdirSync(trash, { recursive: true });
  const trashed = `${Date.now()}-${img.id}`;
  fs.renameSync(path.join(dir, fileOf(img)), path.join(trash, `${trashed}.${img.ext}`));
  if (fs.existsSync(path.join(dir, smallOf(img))))
    fs.renameSync(
      path.join(dir, smallOf(img)),
      path.join(trash, `${trashed}.small.${img.smallExt}`),
    );
  writeJson(path.join(trash, `${trashed}.json`), img);
  writeIndex(
    dir,
    all.filter((i) => i.id !== id),
  );
  const kept = fs
    .readdirSync(trash)
    .filter((f) => f.endsWith('.json'))
    .sort();
  for (const old of kept.slice(0, Math.max(0, kept.length - TRASH_KEEP))) {
    const stem = old.slice(0, -'.json'.length);
    for (const f of fs.readdirSync(trash))
      if (f.startsWith(`${stem}.`)) fs.rmSync(path.join(trash, f), { force: true });
  }
  return { trashed, image: img };
}

/** «Скасувати» for a deleted picture: back with its id, so a running order finds it again. */
export function restoreImage(dir: string, trashed: string): StoredImage | null {
  if (!/^\d+-[0-9a-f-]{36}$/.test(trashed)) return null;
  const trash = path.join(dir, TRASH);
  const meta = readJson<StoredImage | null>(path.join(trash, `${trashed}.json`), null);
  if (!meta || !fs.existsSync(path.join(trash, `${trashed}.${meta.ext}`))) return null;
  fs.renameSync(path.join(trash, `${trashed}.${meta.ext}`), path.join(dir, fileOf(meta)));
  const small = path.join(trash, `${trashed}.small.${meta.smallExt}`);
  if (fs.existsSync(small)) fs.renameSync(small, path.join(dir, smallOf(meta)));
  fs.rmSync(path.join(trash, `${trashed}.json`), { force: true });
  writeIndex(dir, [meta, ...readIndex(dir).filter((i) => i.id !== meta.id)]);
  return meta;
}

/** The content type a picture file is served with. */
export const CONTENT_TYPE: Record<ImageExt, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** A picture as the pages get it: what to show and the addresses of its two files. */
export const imageEntry = (img: StoredImage) => ({
  id: img.id,
  name: img.name,
  w: img.w,
  h: img.h,
  size: img.size,
  added: img.added,
  src: `/api/images/file/${fileOf(img)}`,
  small: `/api/images/file/${smallOf(img)}`,
});
