import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { readJson, writeJson } from './jsonFile.js';
import { MAX_SMALL_BYTES, sniff } from './images.js';
import {
  elsewhere,
  extOf,
  isDenied,
  kindOf,
  locate,
  natural,
  realPaths,
  samePath,
} from './albums.js';

/**
 * Video on screen (1.8.12-beta.3, F1005-14): video files on this computer, picked one by one and
 * read where they are — no copies (the author's call): `data/videos.json` keeps their paths only,
 * so it is not in a backup (a video another system added is kept as it is, never read — albums.ts
 * `elsewhere`). A file is served to the output windows only (this machine: «Показ»,
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
    // another system's path is kept, never read (Mac check of 1.9.0, albums.ts `elsewhere`)
    (path.isAbsolute(v.path) || elsewhere(v.path)) &&
    typeof v.added === 'string'
  );
};

export function readVideos(dataDir: string): Video[] {
  const raw = readJson<{ videos?: unknown }>(videosFile(dataDir), { videos: [] });
  return Array.isArray(raw.videos) ? raw.videos.filter(isVideo) : [];
}
const writeVideos = (dataDir: string, videos: Video[]) =>
  writeJson(videosFile(dataDir), { videos });

export interface VideoFile {
  file: string;
  type: string;
  kind: VideoKind;
  size: number;
  mtimeMs: number;
}

/**
 * A video file now: its type by its first bytes, its size and last change; 'denied' when the
 * system won't open it (albums.ts isDenied — Mac check of 1.9.0: macOS privacy was «not found»),
 * null when gone or not a video.
 */
async function readVideo(file: string): Promise<VideoFile | 'denied' | null> {
  // a file of another computer is not here — and its path must never reach the disk
  if (elsewhere(file)) return null;
  let fh: fsp.FileHandle | undefined;
  try {
    fh = await fsp.open(file, 'r');
    const st = await fh.stat();
    if (!st.isFile()) return null;
    const head = Buffer.alloc(64);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    const kind = sniffVideo(head.subarray(0, bytesRead));
    return kind ? { file, type: VIDEO_TYPE[kind], kind, size: st.size, mtimeMs: st.mtimeMs } : null;
  } catch (e) {
    return isDenied(e) ? 'denied' : null;
  } finally {
    await fh?.close();
  }
}

/** A video file to serve now; null when gone, refused or not a video. */
export async function videoFile(file: string): Promise<VideoFile | null> {
  const now = await readVideo(file);
  return now === 'denied' ? null : now;
}

export type VideoRefusal = 'path' | 'missing' | 'type' | 'denied';

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
  const found = typeof input.path === 'string' ? await locate(input.path) : null;
  if (!found) return { refused: 'path' };
  const { at: file, kind } = found;
  if (kind === 'denied') return { refused: 'denied' };
  if (kind !== 'file') return { refused: 'missing' };
  const read = await readVideo(file);
  if (read === 'denied') return { refused: 'denied' };
  if (!read) return { refused: 'type' };
  const reals = await realPaths([file, ...readVideos(dataDir).map((v) => v.path)]);
  // read and written with nothing awaited between: two adds at once can't lose one
  const videos = readVideos(dataDir);
  const known = videos.find((v) => samePath(v.path, file, reals));
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

/** Rename a video (1.14.0-beta.1): the app's name only — the file keeps its own. */
export function renameVideo(dataDir: string, id: string, name: string): Video | null {
  const videos = readVideos(dataDir);
  const video = videos.find((v) => v.id === id);
  if (!video) return null;
  const renamed = { ...video, name };
  writeVideos(
    dataDir,
    videos.map((v) => (v.id === id ? renamed : v)),
  );
  return renamed;
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
  const read = await readVideo(video.path);
  const now = read === 'denied' ? null : read;
  const v = now ? versionOf(now) : null;
  const poster = v
    ? !!(await fsp.stat(path.join(posterDir(dataDir), posterName(video.id, v))).catch(() => null))
    : false;
  return {
    id: video.id,
    name: video.name,
    path: video.path,
    added: video.added,
    /**
     * can't be used here: not there, no longer a video — or refused (`denied` says why). A
     * refused file stays `missing` too, so every guard that keeps a missing video off the screen
     * (the running order, «далі» after a video) keeps this one off as well
     */
    missing: !now,
    /** why it's `missing`: the system won't open the file (macOS privacy, rights) — the words */
    denied: read === 'denied',
    /** added on another computer (another system's path): not here, never read */
    elsewhere: elsewhere(video.path),
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
