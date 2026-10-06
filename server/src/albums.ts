import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJson, writeJson } from './jsonFile.js';
import { CONTENT_TYPE, sniff } from './images.js';

/**
 * Albums (1.8.12, F1005-13): folders of photos on this computer, shown in turn. The server
 * reads a folder where it is — no copies in data/images, so a photo dropped into the folder
 * is there the next time the album is listed (the author's call). `data/albums.json` keeps only
 * the folders' paths; the paths are this machine's, so it is not in a backup.
 *
 * A photo is served only by a name its folder's listing gave, typed by its first bytes (like
 * images.ts): the listing holds files with a picture's extension right in the folder — no
 * subfolders, hidden files or links, so no name reaches a file outside it.
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
}

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

const isFolder = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/** A folder's name to show; a drive's root has none, so its path. */
const folderName = (p: string) => path.basename(p).normalize('NFC') || p;

export type AlbumRefusal = 'path' | 'missing';

/** Add a folder as an album; the same folder again gives the album it already is. */
export function addAlbum(
  dataDir: string,
  input: { path?: unknown; name?: unknown },
  now = new Date(),
): Album | { refused: AlbumRefusal } {
  const raw = typeof input.path === 'string' ? input.path.trim() : '';
  if (!raw || raw.includes('\0') || !path.isAbsolute(raw)) return { refused: 'path' };
  const folder = path.resolve(raw);
  if (!isFolder(folder)) return { refused: 'missing' };
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

/**
 * The photos right in a folder, in name order; null when the folder is gone. Only plain files
 * with a picture's extension: no subfolders, no hidden files (a Mac's `._NAME` companions), no
 * links — a link could lead out of the folder.
 */
export function listPhotos(folder: string): Listing | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(folder, { withFileTypes: true });
  } catch {
    return null;
  }
  const photos: AlbumPhoto[] = [];
  let heic = 0;
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith('.')) continue;
    const ext = extOf(e.name);
    if (HEIC_EXTS.includes(ext)) heic++;
    else if (PHOTO_EXTS.includes(ext) && e.name.length > ext.length + 1)
      photos.push({ name: e.name.normalize('NFC'), file: e.name });
  }
  photos.sort((a, b) => natural.compare(a.name, b.name) || (a.name < b.name ? -1 : 1));
  return {
    photos: photos.slice(0, MAX_PHOTOS),
    heic,
    truncated: photos.length > MAX_PHOTOS,
  };
}

const listings = new Map<string, { at: number; listing: Listing | null }>();

/** A folder's listing, read again after two seconds. */
export function cachedListing(folder: string, now = Date.now()): Listing | null {
  const kept = listings.get(folder);
  if (kept && now - kept.at < LISTING_TTL_MS) return kept.listing;
  const listing = listPhotos(folder);
  listings.set(folder, { at: now, listing });
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
    const size = Math.min(b.length, (b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]);
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

/**
 * The file to send for a photo of a folder: only a name its listing holds, a plain file still
 * inside the folder when the links are followed, of a type its first bytes say. Null otherwise.
 */
export function photoFile(folder: string, name: string): { file: string; type: string } | null {
  const listing = cachedListing(folder);
  const nfc = name.normalize('NFC');
  const photo = listing?.photos.find((p) => p.name === nfc);
  if (!photo) return null;
  const file = path.join(folder, photo.file);
  let fd: number | undefined;
  try {
    if (!fs.lstatSync(file).isFile()) return null;
    const root = fs.realpathSync(folder);
    const real = fs.realpathSync(file);
    if (path.dirname(real) !== root) return null;
    fd = fs.openSync(real, 'r');
    const head = Buffer.alloc(64);
    const read = fs.readSync(fd, head, 0, head.length, 0);
    const ext = sniffPhoto(head.subarray(0, read));
    return ext ? { file: real, type: PHOTO_TYPE[ext] } : null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
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
export function browseRoots(home = os.homedir()): BrowseEntry[] {
  const roots: BrowseEntry[] = [{ name: folderName(home), path: home, kind: 'home' }];
  for (const p of [path.join(home, 'Pictures'), path.join(home, 'OneDrive', 'Pictures')])
    if (isFolder(p)) roots.push({ name: folderName(p), path: p, kind: 'pictures' });
  const drives: string[] = [];
  if (process.platform === 'win32') {
    // A: and B: are floppies: asking for them can stall
    for (const c of 'CDEFGHIJKLMNOPQRSTUVWXYZ') if (isFolder(`${c}:\\`)) drives.push(`${c}:\\`);
  } else {
    const user = os.userInfo().username;
    const mounts = ['/Volumes', `/media/${user}`, `/run/media/${user}`, '/mnt'];
    if (process.platform !== 'darwin') drives.push('/');
    for (const m of mounts)
      for (const sub of subfolders(m, true)) if (!drives.includes(sub.path)) drives.push(sub.path);
  }
  for (const d of drives) roots.push({ name: folderName(d), path: d, kind: 'drive' });
  return roots;
}

/** The folders right in `dir`, in name order. Links only where volumes live (/Volumes). */
function subfolders(dir: string, links = false): BrowseEntry[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(
      (e) =>
        !SKIP_FOLDERS.test(e.name) &&
        (e.isDirectory() || (links && e.isSymbolicLink() && isFolder(path.join(dir, e.name)))),
    )
    .map((e) => ({ name: e.name.normalize('NFC'), path: path.join(dir, e.name) }))
    .sort((a, b) => natural.compare(a.name, b.name));
}

/**
 * The folder picker (local only): the starting points, or a folder's subfolders and how many
 * photos it holds. Null when the path is not an absolute path to a folder.
 */
export function browse(raw: unknown): BrowseResult | null {
  if (raw === undefined || raw === '')
    return { path: null, parent: null, folders: browseRoots(), photos: 0, heic: 0 };
  if (typeof raw !== 'string' || raw.includes('\0') || !path.isAbsolute(raw)) return null;
  const dir = path.resolve(raw);
  if (!isFolder(dir)) return null;
  const up = path.dirname(dir);
  const parent = up === dir ? null : up;
  try {
    fs.readdirSync(dir);
  } catch {
    return { path: dir, parent, folders: [], photos: 0, heic: 0, denied: true };
  }
  const listing = listPhotos(dir);
  return {
    path: dir,
    parent,
    folders: subfolders(dir),
    photos: listing ? listing.photos.length : 0,
    heic: listing?.heic ?? 0,
  };
}

/** An album as the pages get it; with `photos` when its listing was asked for. */
export function albumEntry(album: Album, listing: Listing | null, withPhotos = false) {
  const src = (name: string) => `/api/albums/${album.id}/file/${encodeURIComponent(name)}`;
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
      ? { photos: (listing?.photos ?? []).map((p) => ({ name: p.name, src: src(p.name) })) }
      : {}),
  };
}
