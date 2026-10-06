import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson } from './jsonFile.js';
import { CONTENT_TYPE, MAX_SMALL_BYTES, sniff } from './images.js';

/**
 * Albums (1.8.12, F1005-13): folders of photos on this computer, shown in turn. The server
 * reads a folder where it is — no copies in data/images, so a photo dropped into the folder
 * is there the next time the album is listed (the author's call). `data/albums.json` keeps only
 * the folders' paths; the paths are this machine's, so it is not in a backup.
 *
 * A photo is served only by a name its folder's listing gave, typed by its first bytes (like
 * images.ts): the listing holds files with a picture's extension right in the folder — no
 * subfolders, hidden files or links, so no name reaches a file outside it. Every folder is
 * read off the event loop: a slow drive or a share that went away never holds the hub.
 */

export const ALBUMS_FILE = 'albums.json';
/** What a folder's listing shows: the types browsers draw. */
export const PHOTO_EXTS: readonly string[] = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'];
/** iPhone photos browsers can't draw — counted, so the album can say why they are not there */
const HEIC_EXTS: readonly string[] = ['heic', 'heif'];
/** a folder's listing stops here (the album says so) */
export const MAX_PHOTOS = 5000;
/** how long a listing answers the file requests (a grid of thumbnails asks for many at once) */
const LISTING_TTL_MS = 2000;
/** a drive that doesn't answer within this is left out of the folder picker's starting points */
const PROBE_MS = 1500;

export interface Album {
  id: string;
  /** what the operator calls it: the folder's name unless they gave another */
  name: string;
  /** the folder, as the operator picked it */
  path: string;
  /** ISO time it was added */
  added: string;
}

export interface AlbumPhoto {
  /** the file's name in NFC (a Mac hands names back decomposed): what the pages ask for */
  name: string;
  /** the name on the disk */
  file: string;
  /** bytes and last change, when the listing asked (`listPhotos(…, true)`): the photo's version */
  size?: number;
  mtime?: number;
}

/**
 * Small copies for the phones (1.8.12-beta.2): the control window draws a photo at most 1280 px
 * and sends it; they are kept in `data/album-cache/<album id>/` (not in a backup — made again
 * from the folder) named by a hash of the photo's name and its version (bytes + last change): a
 * photo replaced by another — even one with an older date — has no copy until one is drawn of it.
 * A photo this small, or a GIF (its frames), is its own small copy; until a copy is there the
 * phones get the photo itself.
 */
export const SMALL_DIR = 'album-cache';
export const SMALL_AS_IS_BYTES = 512 * 1024;
const smallDir = (dataDir: string, albumId: string) => path.join(dataDir, SMALL_DIR, albumId);
/** A photo's version: what a small copy is a copy of. */
export const versionOf = (st: { size: number; mtimeMs: number }) =>
  `${st.size}-${Math.trunc(st.mtimeMs)}`;
const smallBase = (name: string) =>
  crypto.createHash('sha1').update(name.normalize('NFC')).digest('hex');
const smallName = (name: string, version: string) => `${smallBase(name)}-${version}.jpg`;
/** Needs no copy of its own: small already, or a GIF that would lose its frames. */
export const smallAsIs = (name: string, size: number) =>
  size <= SMALL_AS_IS_BYTES || extOf(name) === 'gif';

export interface Listing {
  photos: AlbumPhoto[];
  /** HEIC / HEIF files left out */
  heic: number;
  /** more than MAX_PHOTOS pictures: the rest are left out */
  truncated: boolean;
}

const albumsFile = (dataDir: string) => path.join(dataDir, ALBUMS_FILE);

const isAlbum = (x: unknown): x is Album => {
  const a = x as Partial<Album> | null;
  return (
    !!a &&
    typeof a.id === 'string' &&
    /^[0-9a-f-]{36}$/.test(a.id) &&
    typeof a.name === 'string' &&
    typeof a.path === 'string' &&
    path.isAbsolute(a.path) &&
    typeof a.added === 'string'
  );
};

export function readAlbums(dataDir: string): Album[] {
  const raw = readJson<{ albums?: unknown }>(albumsFile(dataDir), { albums: [] });
  return Array.isArray(raw.albums) ? raw.albums.filter(isAlbum) : [];
}
const writeAlbums = (dataDir: string, albums: Album[]) =>
  writeJson(albumsFile(dataDir), { albums });

/** Two spellings of one folder: NFC, and on Windows without case. */
const samePath = (a: string, b: string) => {
  const key = (p: string) => {
    const n = path.resolve(p).normalize('NFC');
    return process.platform === 'win32' ? n.toLowerCase() : n;
  };
  return key(a) === key(b);
};

const isFolder = (p: string) =>
  fsp.stat(p).then(
    (st) => st.isDirectory(),
    () => false,
  );

/** `p`, or `fallback` once `ms` pass first (a disconnected drive can take seconds to answer). */
const within = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((done) => setTimeout(() => done(fallback), ms).unref())]);

/** A folder's name to show; a drive's root has none, so its path. */
const folderName = (p: string) => path.basename(p).normalize('NFC') || p;

const badPath = (raw: string) => !raw || raw.includes('\0') || !path.isAbsolute(raw);

export type AlbumRefusal = 'path' | 'missing';

/** Add a folder as an album; the same folder again gives the album it already is. */
export async function addAlbum(
  dataDir: string,
  input: { path?: unknown; name?: unknown },
  now = new Date(),
): Promise<Album | { refused: AlbumRefusal }> {
  const raw = typeof input.path === 'string' ? input.path.trim() : '';
  if (badPath(raw)) return { refused: 'path' };
  const folder = path.resolve(raw);
  if (!(await isFolder(folder))) return { refused: 'missing' };
  // read and written with nothing awaited between: two adds at once can't lose one
  const albums = readAlbums(dataDir);
  const known = albums.find((a) => samePath(a.path, folder));
  if (known) return known;
  const given = typeof input.name === 'string' ? input.name.replace(/\s+/g, ' ').trim() : '';
  const album: Album = {
    id: crypto.randomUUID(),
    name: (given || folderName(folder)).normalize('NFC').slice(0, 120),
    path: folder,
    added: now.toISOString(),
  };
  writeAlbums(dataDir, [...albums, album]);
  return album;
}

/** Forget an album (the folder stays as it is). */
export function removeAlbum(dataDir: string, id: string): Album | null {
  const albums = readAlbums(dataDir);
  const gone = albums.find((a) => a.id === id);
  if (!gone) return null;
  writeAlbums(
    dataDir,
    albums.filter((a) => a.id !== id),
  );
  listings.delete(gone.path);
  return gone;
}

const extOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();
/**
 * «IMG_2» before «IMG_10», case and accents aside — as a file manager orders them; Ukrainian
 * order (Cyrillic first) on every machine, so the PC and the Mac step an album alike.
 */
const natural = new Intl.Collator('uk', { numeric: true, sensitivity: 'base' });

type EntryKind = 'file' | 'folder' | 'link' | null;

/**
 * What a folder entry is. Windows reports every reparse point as a link — a OneDrive photo or
 * folder kept online too, not only a real link — so those are asked again: a real link or a
 * junction stays a link, a OneDrive one is the file or folder it stands for (review of step 1).
 */
async function kindOf(dir: string, e: fs.Dirent): Promise<EntryKind> {
  if (e.isFile()) return 'file';
  if (e.isDirectory()) return 'folder';
  if (!e.isSymbolicLink()) return null;
  if (process.platform !== 'win32') return 'link';
  const st = await fsp.lstat(path.join(dir, e.name)).catch(() => null);
  if (!st || st.isSymbolicLink()) return 'link';
  return st.isFile() ? 'file' : st.isDirectory() ? 'folder' : null;
}

/**
 * The photos right in a folder, in name order; null when the folder is gone. Only plain files
 * with a picture's extension: no subfolders, no hidden files (a Mac's `._NAME` companions), no
 * links — a link could lead out of the folder.
 */
export async function listPhotos(folder: string, withStats = false): Promise<Listing | null> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(folder, { withFileTypes: true });
  } catch {
    return null;
  }
  const found: { name: string; file: string }[] = [];
  let heic = 0;
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const ext = extOf(e.name);
    const photo = PHOTO_EXTS.includes(ext) && e.name.length > ext.length + 1;
    if (!photo && !HEIC_EXTS.includes(ext)) continue;
    if ((await kindOf(folder, e)) !== 'file') continue;
    if (photo) found.push({ name: e.name.normalize('NFC'), file: e.name });
    else heic++;
  }
  found.sort((a, b) => natural.compare(a.name, b.name) || (a.name < b.name ? -1 : 1));
  const kept = found.slice(0, MAX_PHOTOS);
  // sizes and times only for the album's own page (which copies are missing): a count, the
  // file requests' checks and a folder of 5 000 on a share would pay 5 000 stats each (review)
  const stats = withStats
    ? await Promise.all(kept.map((p) => fsp.stat(path.join(folder, p.file)).catch(() => null)))
    : null;
  return {
    photos: stats
      ? kept.flatMap((p, i) => {
          const st = stats[i];
          return st ? [{ ...p, size: st.size, mtime: st.mtimeMs }] : [];
        })
      : kept,
    heic,
    truncated: found.length > MAX_PHOTOS,
  };
}

const listings = new Map<string, { at: number; listing: Promise<Listing | null> }>();

/**
 * A folder's listing, read again after two seconds — one read for the many requests a grid of
 * thumbnails makes at once.
 */
export function cachedListing(folder: string, clock = Date.now): Promise<Listing | null> {
  const kept = listings.get(folder);
  if (kept && clock() - kept.at < LISTING_TTL_MS) return kept.listing;
  const listing = listPhotos(folder);
  // kept while it is read and two seconds after: a slow folder is never read twice at once
  const entry = { at: Number.POSITIVE_INFINITY, listing };
  listings.set(folder, entry);
  void listing.finally(() => {
    entry.at = clock();
  });
  return listing;
}

export type PhotoExt = keyof typeof CONTENT_TYPE | 'avif' | 'bmp';
export const PHOTO_TYPE: Record<PhotoExt, string> = {
  ...CONTENT_TYPE,
  avif: 'image/avif',
  bmp: 'image/bmp',
};

/** What a photo is, by its first bytes: images.ts's four, AVIF and BMP — nothing else is served. */
export function sniffPhoto(b: Uint8Array): PhotoExt | null {
  const known = sniff(b);
  if (known) return known;
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 16 && ascii(4, 8) === 'ftyp') {
    // the major brand and the compatible ones: AVIF says so (HEIC never lists avif)
    const size = Math.min(b.length, ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0);
    for (let at = 8; at + 4 <= size; at += 4) {
      if (at === 12) continue; // the minor version
      const brand = ascii(at, at + 4);
      if (brand === 'avif' || brand === 'avis') return 'avif';
    }
    return null;
  }
  // BMP: «BM», then a DIB header of a size Windows writes
  if (b.length >= 18 && b[0] === 0x42 && b[1] === 0x4d) {
    const dib = b[14] | (b[15] << 8) | (b[16] << 16) | (b[17] << 24);
    if ([12, 40, 52, 56, 64, 108, 124].includes(dib)) return 'bmp';
  }
  return null;
}

/** The small copies an album has (their file names). */
export async function smallCopies(dataDir: string, albumId: string): Promise<Set<string>> {
  return new Set(await fsp.readdir(smallDir(dataDir, albumId)).catch(() => [] as string[]));
}

/**
 * What to send a phone for a photo (the `small` address): its small copy when there is one of
 * this version of the photo, else the photo itself (photoFile's checks either way).
 */
export async function smallFile(
  dataDir: string,
  album: Album,
  name: string,
): Promise<{ file: string; type: string } | null> {
  const photo = await photoFile(album.path, name);
  if (!photo || smallAsIs(name, photo.size)) return photo;
  const copy = path.join(smallDir(dataDir, album.id), smallName(name, versionOf(photo)));
  return (await fsp.stat(copy).catch(() => null)) ? { file: copy, type: 'image/jpeg' } : photo;
}

export type SmallRefusal = 'photo' | 'changed' | 'type' | 'size';

/**
 * Keep a small copy the control window drew (a JPEG of at most 4 MB) of a photo the listing
 * holds — of the version it read (`version`, from the album's page): a photo changed meanwhile
 * gets no copy of the old one. Older copies of the photo go.
 */
export async function putSmall(
  dataDir: string,
  album: Album,
  name: string,
  version: string,
  bytes: Buffer,
): Promise<{ bytes: number } | { refused: SmallRefusal }> {
  const photo = await photoFile(album.path, name);
  if (!photo) return { refused: 'photo' };
  if (versionOf(photo) !== version) return { refused: 'changed' };
  if (bytes.length > MAX_SMALL_BYTES) return { refused: 'size' };
  if (sniff(bytes) !== 'jpg') return { refused: 'type' };
  const dir = smallDir(dataDir, album.id);
  await fsp.mkdir(dir, { recursive: true });
  const base = smallBase(name);
  const to = path.join(dir, smallName(name, version));
  const tmp = `${to}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(tmp, bytes);
  await fsp.rename(tmp, to);
  for (const old of await fsp.readdir(dir).catch(() => [] as string[]))
    if (old.startsWith(`${base}-`) && old.endsWith('.jpg') && path.join(dir, old) !== to)
      await fsp.rm(path.join(dir, old), { force: true });
  return { bytes: bytes.length };
}

/** An album's small copies go with it (the folder stays as it is). */
export const dropSmalls = (dataDir: string, albumId: string) =>
  fsp.rm(smallDir(dataDir, albumId), { recursive: true, force: true });

/**
 * The file to send for a photo of a folder: only a name its listing holds, a plain file still
 * inside the folder when the links are followed, of a type its first bytes say. Null otherwise.
 */
export async function photoFile(
  folder: string,
  name: string,
): Promise<{ file: string; type: string; size: number; mtimeMs: number } | null> {
  const listing = await cachedListing(folder);
  const nfc = name.normalize('NFC');
  const photo = listing?.photos.find((p) => p.name === nfc);
  if (!photo) return null;
  const file = path.join(folder, photo.file);
  let fh: fsp.FileHandle | undefined;
  try {
    if ((await fsp.lstat(file)).isSymbolicLink()) return null;
    const [root, real] = await Promise.all([fsp.realpath(folder), fsp.realpath(file)]);
    if (path.dirname(real) !== root) return null;
    fh = await fsp.open(real, 'r');
    const st = await fh.stat();
    if (!st.isFile()) return null;
    const head = Buffer.alloc(64);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    const ext = sniffPhoto(head.subarray(0, bytesRead));
    return ext ? { file: real, type: PHOTO_TYPE[ext], size: st.size, mtimeMs: st.mtimeMs } : null;
  } catch {
    return null;
  } finally {
    await fh?.close();
  }
}

/** A folder offered by the folder picker; `kind` says what to call a starting point. */
export interface BrowseEntry {
  name: string;
  path: string;
  kind?: 'home' | 'pictures' | 'drive';
}

export interface BrowseResult {
  /** the folder shown; null = the starting points */
  path: string | null;
  /** one level up; null at a drive's root (the starting points are next) */
  parent: string | null;
  folders: BrowseEntry[];
  /** photos right in this folder (an album of it would show them) */
  photos: number;
  heic: number;
  /** the system refused to show this folder */
  denied?: boolean;
}

const SKIP_FOLDERS = /^(\$|\.|System Volume Information$|lost\+found$)/i;

/** Where the folder picker starts: home, Pictures, then the drives / volumes. */
export async function browseRoots(home = os.homedir()): Promise<BrowseEntry[]> {
  const pictures = [path.join(home, 'Pictures'), path.join(home, 'OneDrive', 'Pictures')];
  let drives: string[];
  if (process.platform === 'win32') {
    // A: and B: are floppies: asking for them can stall
    drives = [...'CDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => `${c}:\\`);
  } else {
    const user = os.userInfo().username;
    const mounts = ['/Volumes', `/media/${user}`, `/run/media/${user}`, '/mnt'];
    const subs = await Promise.all(mounts.map((m) => within(subfolders(m, true), PROBE_MS, [])));
    const found = subs.flat().map((s) => s.path);
    drives = [...new Set([...(process.platform === 'darwin' ? [] : ['/']), ...found])];
  }
  // every probe at once, each with its own limit: a disconnected network drive costs 1.5 s at most
  const probe = (list: string[]) =>
    Promise.all(list.map((p) => within(isFolder(p), PROBE_MS, false)));
  const [pics, there] = await Promise.all([probe(pictures), probe(drives)]);
  return [
    { name: folderName(home), path: home, kind: 'home' as const },
    ...pictures
      .filter((_, i) => pics[i])
      .map((p) => ({ name: folderName(p), path: p, kind: 'pictures' as const })),
    ...drives
      .filter((_, i) => there[i])
      .map((d) => ({ name: folderName(d), path: d, kind: 'drive' as const })),
  ];
}

/** The folders right in `dir`, in name order. Links only where volumes live (/Volumes). */
async function subfolders(dir: string, links = false): Promise<BrowseEntry[]> {
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const kept: BrowseEntry[] = [];
  for (const e of entries) {
    if (SKIP_FOLDERS.test(e.name)) continue;
    const kind = await kindOf(dir, e);
    const p = path.join(dir, e.name);
    if (kind === 'folder' || (links && kind === 'link' && (await isFolder(p))))
      kept.push({ name: e.name.normalize('NFC'), path: p });
  }
  return kept.sort((a, b) => natural.compare(a.name, b.name));
}

/**
 * The folder picker (local only): the starting points, or a folder's subfolders and how many
 * photos it holds. Null when the path is not an absolute path to a folder.
 */
export async function browse(raw: unknown): Promise<BrowseResult | null> {
  if (raw === undefined || raw === '')
    return { path: null, parent: null, folders: await browseRoots(), photos: 0, heic: 0 };
  if (typeof raw !== 'string' || badPath(raw)) return null;
  const dir = path.resolve(raw);
  if (!(await isFolder(dir))) return null;
  const up = path.dirname(dir);
  const parent = up === dir ? null : up;
  try {
    await fsp.readdir(dir);
  } catch {
    return { path: dir, parent, folders: [], photos: 0, heic: 0, denied: true };
  }
  const [folders, listing] = await Promise.all([subfolders(dir), listPhotos(dir)]);
  return {
    path: dir,
    parent,
    folders,
    photos: listing ? listing.photos.length : 0,
    heic: listing?.heic ?? 0,
  };
}

/**
 * An album as the pages get it; with `photos` when its listing was asked for (and, given the
 * small copies there are, which photos still need one).
 */
export function albumEntry(
  album: Album,
  listing: Listing | null,
  withPhotos = false,
  copies: Set<string> = new Set(),
) {
  const src = (name: string) => `/api/albums/${album.id}/file/${encodeURIComponent(name)}`;
  const small = (name: string) => `/api/albums/${album.id}/small/${encodeURIComponent(name)}`;
  return {
    id: album.id,
    name: album.name,
    path: album.path,
    added: album.added,
    missing: listing === null,
    count: listing?.photos.length ?? 0,
    heic: listing?.heic ?? 0,
    truncated: listing?.truncated ?? false,
    ...(withPhotos
      ? {
          photos: (listing?.photos ?? []).map((p) => {
            const v =
              p.size != null && p.mtime != null
                ? versionOf({ size: p.size, mtimeMs: p.mtime })
                : null;
            return {
              name: p.name,
              src: src(p.name),
              small: small(p.name),
              // the version the copy is drawn of (sent back with it); asked without stats: none
              ...(v ? { v } : {}),
              needsSmall: !!v && !smallAsIs(p.name, p.size!) && !copies.has(smallName(p.name, v)),
            };
          }),
        }
      : {}),
  };
}
