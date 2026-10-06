import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { readJson, writeJson } from './jsonFile.js';
import { MAX_SMALL_BYTES, sniff } from './images.js';
import { badPath, extOf, kindOf, natural, samePath } from './albums.js';

/**
 * Video on screen (1.8.12-beta.3, F1005-14): video files on this computer, picked one by one and
 * read where they are — no copies (the author's call): `data/videos.json` keeps their paths only,
 * so it is not in a backup. A file is served to the output windows only (this machine: «Показ»,
 * «Сцена», the control window's sound and previews), never to the hall — the phones get a frame
 * of it (a poster the control window draws) or a line of words. Typed by its first bytes.
 */

export const VIDEOS_FILE = 'videos.json';
/** What the picker offers: the containers browsers play (H.264 / VP9 / AV1 inside). */
export const VIDEO_EXTS: readonly string[] = ['mp4', 'm4v', 'mov', 'webm', 'mkv'];
/** Video files browsers can't play: counted in a folder, so the picker can say why they are not there. */
const OTHER_VIDEO_EXTS: readonly string[] = [
  'avi',
  'wmv',
  'flv',
  'mpg',
  'mpeg',
  '3gp',
  'mts',
  'm2ts',
  'vob',
];
export const POSTER_DIR = 'video-cache';

export interface Video {
  id: string;
  /** the file's name without its extension, unless the operator gave another */
  name: string;
  path: string;
  added: string;
}

export type VideoKind = 'mp4' | 'mov' | 'webm' | 'mkv';
/**
 * How each is served: a QuickTime file holds what an MP4 does (H.264 / AAC) and browsers play it
 * as one; Matroska as WebM (Chrome and Firefox play its VP9 / AV1 / Opus).
 */
export const VIDEO_TYPE: Record<VideoKind, string> = {
  mp4: 'video/mp4',
  mov: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/webm',
};

/** Still pictures that use the same box as MP4 (HEIC, AVIF): never a video. */
const IMAGE_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'mif1',
  'msf1',
  'avif',
  'avis',
]);

/** What a video file is, by its first bytes; null for anything else. */
export function sniffVideo(b: Uint8Array): VideoKind | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 12 && ascii(4, 8) === 'ftyp') {
    const major = ascii(8, 12);
    if (IMAGE_BRANDS.has(major)) return null;
    return major === 'qt  ' ? 'mov' : 'mp4';
  }
  // QuickTime without ftyp: a moov / mdat / wide atom first
  if (b.length >= 8 && ['moov', 'mdat', 'wide', 'free'].includes(ascii(4, 8))) return 'mov';
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    const head = ascii(0, Math.min(b.length, 64));
    return head.includes('webm') ? 'webm' : head.includes('matroska') ? 'mkv' : null;
  }
  return null;
}

const videosFile = (dataDir: string) => path.join(dataDir, VIDEOS_FILE);

const isVideo = (x: unknown): x is Video => {
  const v = x as Partial<Video> | null;
  return (
    !!v &&
    typeof v.id === 'string' &&
    /^[0-9a-f-]{36}$/.test(v.id) &&
    typeof v.name === 'string' &&
    typeof v.path === 'string' &&
    path.isAbsolute(v.path) &&
    typeof v.added === 'string'
  );
};

export function readVideos(dataDir: string): Video[] {
  const raw = readJson<{ videos?: unknown }>(videosFile(dataDir), { videos: [] });
  return Array.isArray(raw.videos) ? raw.videos.filter(isVideo) : [];
}
const writeVideos = (dataDir: string, videos: Video[]) =>
  writeJson(videosFile(dataDir), { videos });

/** A video file now: its type by its first bytes, its size and last change; null when gone or not a video. */
export async function videoFile(
  file: string,
): Promise<{ file: string; type: string; kind: VideoKind; size: number; mtimeMs: number } | null> {
  let fh: fsp.FileHandle | undefined;
  try {
    fh = await fsp.open(file, 'r');
    const st = await fh.stat();
    if (!st.isFile()) return null;
    const head = Buffer.alloc(64);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    const kind = sniffVideo(head.subarray(0, bytesRead));
    return kind ? { file, type: VIDEO_TYPE[kind], kind, size: st.size, mtimeMs: st.mtimeMs } : null;
  } catch {
    return null;
  } finally {
    await fh?.close();
  }
}

export type VideoRefusal = 'path' | 'missing' | 'type';

const nameOf = (file: string) =>
  path
    .basename(file)
    .replace(/\.[^.]{1,5}$/, '')
    .normalize('NFC')
    .slice(0, 120) || 'video';

/** Add a video file; the same file again gives the video it already is. */
export async function addVideo(
  dataDir: string,
  input: { path?: unknown; name?: unknown },
  now = new Date(),
): Promise<Video | { refused: VideoRefusal }> {
  const raw = typeof input.path === 'string' ? input.path.trim() : '';
  if (badPath(raw)) return { refused: 'path' };
  const file = path.resolve(raw);
  const st = await fsp.stat(file).catch(() => null);
  if (!st?.isFile()) return { refused: 'missing' };
  if (!(await videoFile(file))) return { refused: 'type' };
  // read and written with nothing awaited between: two adds at once can't lose one
  const videos = readVideos(dataDir);
  const known = videos.find((v) => samePath(v.path, file));
  if (known) return known;
  const given = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim() : '';
  const video: Video = {
    id: crypto.randomUUID(),
    name: (given || nameOf(file)).normalize('NFC').slice(0, 120),
    path: file,
    added: now.toISOString(),
  };
  writeVideos(dataDir, [...videos, video]);
  return video;
}

/** Forget a video (the file stays as it is) and its poster. */
export async function removeVideo(dataDir: string, id: string): Promise<Video | null> {
  const videos = readVideos(dataDir);
  const gone = videos.find((v) => v.id === id);
  if (!gone) return null;
  writeVideos(
    dataDir,
    videos.filter((v) => v.id !== id),
  );
  await dropPosters(dataDir, id);
  return gone;
}

/** A file's version: what a poster is a frame of. */
export const versionOf = (st: { size: number; mtimeMs: number }) =>
  `${st.size}-${Math.trunc(st.mtimeMs)}`;
const posterDir = (dataDir: string) => path.join(dataDir, POSTER_DIR);
const posterName = (id: string, version: string) => `${id}-${version}.jpg`;

/** The poster of this version of the video's file, if the control window drew one. */
export async function posterFile(dataDir: string, video: Video): Promise<string | null> {
  const now = await videoFile(video.path);
  if (!now) return null;
  const file = path.join(posterDir(dataDir), posterName(video.id, versionOf(now)));
  return (await fsp.stat(file).catch(() => null)) ? file : null;
}

export type PosterRefusal = 'video' | 'changed' | 'type' | 'size';

/** Keep a poster (a JPEG of at most 4 MB) drawn of the file's version `version`; older ones go. */
export async function putPoster(
  dataDir: string,
  video: Video,
  version: string,
  bytes: Buffer,
): Promise<{ bytes: number } | { refused: PosterRefusal }> {
  const now = await videoFile(video.path);
  if (!now) return { refused: 'video' };
  if (versionOf(now) !== version) return { refused: 'changed' };
  if (bytes.length > MAX_SMALL_BYTES) return { refused: 'size' };
  if (sniff(bytes) !== 'jpg') return { refused: 'type' };
  const dir = posterDir(dataDir);
  await fsp.mkdir(dir, { recursive: true });
  const to = path.join(dir, posterName(video.id, version));
  const tmp = `${to}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(tmp, bytes);
  await fsp.rename(tmp, to);
  await dropPosters(dataDir, video.id, path.basename(to));
  return { bytes: bytes.length };
}

/** A video's posters, all of them or all but `keep`. */
async function dropPosters(dataDir: string, id: string, keep?: string) {
  const dir = posterDir(dataDir);
  for (const f of await fsp.readdir(dir).catch(() => [] as string[]))
    if (f.startsWith(`${id}-`) && f !== keep) await fsp.rm(path.join(dir, f), { force: true });
}

/** A video as the pages get it. */
export async function videoEntry(dataDir: string, video: Video) {
  const now = await videoFile(video.path);
  const v = now ? versionOf(now) : null;
  const poster = v
    ? !!(await fsp.stat(path.join(posterDir(dataDir), posterName(video.id, v))).catch(() => null))
    : false;
  return {
    id: video.id,
    name: video.name,
    path: video.path,
    added: video.added,
    /** the file is not there (or no longer a video) */
    missing: !now,
    size: now?.size ?? 0,
    ...(v ? { v } : {}),
    src: `/api/videos/${video.id}/file`,
    poster: `/api/videos/${video.id}/poster`,
    /** a poster of this version is there (else the control window draws one) */
    hasPoster: poster,
  };
}

/** The video files right in a folder (the picker's «Додати відео…»), and how many it can't play. */
export async function listVideoFiles(
  dir: string,
): Promise<{ videos: { name: string; path: string; size: number }[]; unplayable: number }> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return { videos: [], unplayable: 0 };
  }
  const found: { name: string; path: string }[] = [];
  let unplayable = 0;
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const ext = extOf(e.name);
    const playable = VIDEO_EXTS.includes(ext);
    if (!playable && !OTHER_VIDEO_EXTS.includes(ext)) continue;
    if ((await kindOf(dir, e)) !== 'file') continue;
    if (playable) found.push({ name: e.name.normalize('NFC'), path: path.join(dir, e.name) });
    else unplayable++;
  }
  found.sort((a, b) => natural.compare(a.name, b.name));
  const sizes = await Promise.all(
    found.map((f) =>
      fsp.stat(f.path).then(
        (s) => s.size,
        () => 0,
      ),
    ),
  );
  return { videos: found.map((f, i) => ({ ...f, size: sizes[i] })), unplayable };
}
