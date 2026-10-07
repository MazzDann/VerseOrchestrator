import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson } from './jsonFile.js';
import { CONTENT_TYPE, MAX_SMALL_BYTES, sniff } from './images.js';

/**
 * Albums (1.8.12, F1005-13): folders of photos on this computer, shown in turn. The server
 * reads a folder where it is — no copies in data/images, so a photo dropped into the folder
 * is there the next time the album is listed (the author's call). `data/albums.json` keeps only
 * the folders' paths; the paths are this machine's, so it is not in a backup. It travels with the
 * app folder though (a flash drive, a copy of the folder): an album another system added is kept
 * as it is and never read (`elsewhere`).
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
  /** the system won't open the folder (isDenied): it is there, nothing in it is served */
  denied?: boolean;
}

const albumsFile = (dataDir: string) => path.join(dataDir, ALBUMS_FILE);

/**
 * A path another system wrote: `D:\Фото` or `\\NAS\photos` read on a Mac, `/Volumes/Фото` on
 * Windows. Mac check of 1.9.0: albums.json and videos.json came with the app folder from Windows,
 * the Mac dropped those entries as broken and its next add wrote the file without them — lost
 * for good. Such an entry is kept and written back as it is, shown as one from another computer,
 * and never read: on a Mac `D:\Фото` is a name in the working folder. This system's paths are
 * the ones path.resolve gives — on Windows a drive's or a share's, elsewhere from the root.
 */
export function elsewhere(p: string, platform: NodeJS.Platform = process.platform): boolean {
  const here =
    platform === 'win32' ? /^(?:[a-z]:[\\/]|[\\/]{2}[^\\/])/i.test(p) : path.posix.isAbsolute(p);
  return !here && (path.win32.isAbsolute(p) || path.posix.isAbsolute(p));
}

const isAlbum = (x: unknown): x is Album => {
  const a = x as Partial<Album> | null;
  return (
    !!a &&
    typeof a.id === 'string' &&
    /^[0-9a-f-]{36}$/.test(a.id) &&
    typeof a.name === 'string' &&
    typeof a.path === 'string' &&
    (path.isAbsolute(a.path) || elsewhere(a.path)) &&
    typeof a.added === 'string'
  );
};

export function readAlbums(dataDir: string): Album[] {
  const raw = readJson<{ albums?: unknown }>(albumsFile(dataDir), { albums: [] });
  return Array.isArray(raw.albums) ? raw.albums.filter(isAlbum) : [];
}
const writeAlbums = (dataDir: string, albums: Album[]) =>
  writeJson(albumsFile(dataDir), { albums });

const pathKey = (p: string) => {
  const n = path.resolve(p).normalize('NFC');
  return process.platform === 'win32' ? n.toLowerCase() : n;
};

/**
 * Two spellings of one folder or file: NFC, and on Windows without case; given their real paths
 * (`realPaths`), also another case on a Mac's disk (APFS, exFAT) or a way through a link
 * (`/Volumes/Macintosh HD/…` is `/…`) — Mac check of 1.9.0: each made a second album of one
 * folder. A path of another computer is never one of this computer's.
 */
export const samePath = (a: string, b: string, reals?: ReadonlyMap<string, string>) => {
  if (elsewhere(a) || elsewhere(b)) return false;
  if (pathKey(a) === pathKey(b)) return true;
  const [ra, rb] = [reals?.get(a), reals?.get(b)];
  return !!ra && !!rb && pathKey(ra) === pathKey(rb);
};

export const isFolder = (p: string) =>
  fsp.stat(p).then(
    (st) => st.isDirectory(),
    () => false,
  );

/**
 * The system refused, the thing is there (Mac check of 1.9.0): macOS keeps Desktop, Documents,
 * Downloads and removable or network disks from a program it hasn't allowed (EPERM); plain
 * rights give EACCES. Told apart from «gone», which asks to plug a drive in.
 */
export const isDenied = (e: unknown) => {
  const code = (e as NodeJS.ErrnoException | null)?.code;
  return code === 'EPERM' || code === 'EACCES';
};

export type PathKind = 'folder' | 'file' | 'denied' | null;

/** What is at `p`: a folder, a file, something the system won't show (isDenied), or nothing. */
export const pathKind = (p: string): Promise<PathKind> =>
  fsp.stat(p).then(
    (st) => (st.isDirectory() ? 'folder' : st.isFile() ? 'file' : null),
    (e: unknown) => (isDenied(e) ? 'denied' : null),
  );

/**
 * A folder stat sees but the system won't list: chmod 000 on the folder itself, or macOS privacy
 * on ~/Desktop, ~/Documents, ~/Downloads — stat answers there, readdir gives EPERM (review).
 */
const listingDenied = (dir: string) =>
  fsp.readdir(dir).then(
    () => false,
    (e: unknown) => isDenied(e),
  );

/** `p`, or `fallback` once `ms` pass first (a disconnected drive can take seconds to answer). */
const within = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((done) => setTimeout(() => done(fallback), ms).unref())]);

/**
 * The real paths of this computer's `paths` — links followed, in the case the disk keeps (a
 * Mac's realpath gives it, on APFS and on exFAT alike) — for samePath. Asked on adds only; one
 * that doesn't answer in time (a sleeping share) is compared by its spelling.
 */
export async function realPaths(paths: string[]): Promise<Map<string, string>> {
  const mine = [...new Set(paths)].filter((p) => !elsewhere(p));
  const real = (p: string) => fsp.realpath(p).catch(() => null);
  const reals = await Promise.all(mine.map((p) => within(real(p), PROBE_MS, null)));
  const known = new Map<string, string>();
  mine.forEach((p, i) => {
    const real = reals[i];
    if (real) known.set(p, real);
  });
  return known;
}

/** A folder's name to show; a drive's root has none, so its path. */
export const folderName = (p: string) => path.basename(p).normalize('NFC') || p;

export const badPath = (raw: string) => !raw || raw.includes('\0') || !path.isAbsolute(raw);

/** The escapes Terminal and zsh put in a path: «My\ Photos», «\(2024\)». */
const SHELL_ESCAPE = /\\([ !"#$&'()*;<>?[\\\]^`{|}~])/g;

/**
 * A path as it is pasted into the folder picker (Mac check of 1.9.0: each of these was refused):
 * «~/Pictures/Свято», a file:// URL (percent-encoded), a path in quotes (Windows' «Копіювати як
 * шлях», a Terminal drag & drop), a shell-escaped «My\ Photos» — posix only: on Windows the
 * backslash is the separator. Done here, not in the page: `~` is this computer's home and the
 * separator this system's — and every way in (browse, addAlbum, addVideo) takes it alike, through
 * locate: only a path that names nothing as it is. Anything else is left: badPath judges it.
 */
export function pastedPath(
  raw: string,
  platform: NodeJS.Platform = process.platform,
  home: string = os.homedir(),
): string {
  // posix: a last «\ » is the name's own space (Terminal escapes it, then adds a space after)
  let p = raw.replace(platform === 'win32' ? /^\s+|\s+$/g : /^\s+|(?<!\\)\s+$/g, '');
  const quoted = /^(['"])(.*)\1$/s.exec(p);
  if (quoted) p = quoted[2];
  if (/^file:/i.test(p)) {
    try {
      return fileURLToPath(p, { windows: platform === 'win32' });
    } catch {
      return p; // another computer's (file://NAS/… on a Mac) or badly encoded: refused as it is
    }
  }
  if (p === '~' || p.startsWith('~/') || (platform === 'win32' && p.startsWith('~\\')))
    p = home + p.slice(1);
  // inside quotes a backslash is the name's own (as the shell reads it)
  return platform === 'win32' || quoted ? p : p.replace(SHELL_ESCAPE, '$1');
}

/**
 * Where a path from the page leads, and what is there: the path as it is when it names something
 * here — the picker's own paths (a listed folder, «Додати цю папку», a video's row) are names as
 * they are, a folder «Свято » or «a\ b» too (review: read as pasted they were trimmed or
 * unescaped into nothing) — else as pasted (pastedPath). Null when badPath refuses both.
 */
export async function locate(raw: string): Promise<{ at: string; kind: PathKind } | null> {
  const asIs = badPath(raw) ? null : path.resolve(raw);
  const kind = asIs ? await pathKind(asIs) : null;
  if (asIs && (kind === 'folder' || kind === 'file')) return { at: asIs, kind };
  const pasted = pastedPath(raw);
  if (pasted !== raw && !badPath(pasted)) {
    const at = path.resolve(pasted);
    const found = await pathKind(at);
    if (found || !asIs) return { at, kind: found };
  }
  return asIs ? { at: asIs, kind } : null;
}

export type AlbumRefusal = 'path' | 'missing' | 'denied';

/** Add a folder as an album; the same folder again gives the album it already is. */
export async function addAlbum(
  dataDir: string,
  input: { path?: unknown; name?: unknown },
  now = new Date(),
): Promise<Album | { refused: AlbumRefusal }> {
  const found = typeof input.path === 'string' ? await locate(input.path) : null;
  if (!found) return { refused: 'path' };
  const { at: folder, kind } = found;
  if (kind === 'denied' || (kind === 'folder' && (await listingDenied(folder))))
    return { refused: 'denied' };
  if (kind !== 'folder') return { refused: 'missing' };
  const reals = await realPaths([folder, ...readAlbums(dataDir).map((a) => a.path)]);
  // read and written with nothing awaited between: two adds at once can't lose one
  const albums = readAlbums(dataDir);
  const known = albums.find((a) => samePath(a.path, folder, reals));
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

export const extOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();
/**
 * «IMG_2» before «IMG_10», case and accents aside — as a file manager orders them; Ukrainian
 * order (Cyrillic first) on every machine, so the PC and the Mac step an album alike.
 */
export const natural = new Intl.Collator('uk', { numeric: true, sensitivity: 'base' });

type EntryKind = 'file' | 'folder' | 'link' | null;

/**
 * What a folder entry is. Windows reports every reparse point as a link — a OneDrive photo or
 * folder kept online too, not only a real link — so those are asked again: a real link or a
 * junction stays a link, a OneDrive one is the file or folder it stands for (review of step 1).
 */
export async function kindOf(dir: string, e: fs.Dirent): Promise<EntryKind> {
  if (e.isFile()) return 'file';
  if (e.isDirectory()) return 'folder';
  if (!e.isSymbolicLink()) return null;
  if (process.platform !== 'win32') return 'link';
  const st = await fsp.lstat(path.join(dir, e.name)).catch(() => null);
  if (!st || st.isSymbolicLink()) return 'link';
  return st.isFile() ? 'file' : st.isDirectory() ? 'folder' : null;
}

/**
 * The photos right in a folder, in name order; null when the folder is gone, none and `denied`
 * when the system won't open it (isDenied). Only plain files with a picture's extension: no
 * subfolders, no hidden files (a Mac's `._NAME` companions), no links — a link could lead out of
 * the folder.
 */
export async function listPhotos(folder: string, withStats = false): Promise<Listing | null> {
  // a folder of another computer is not here — and its path must never reach the disk
  if (elsewhere(folder)) return null;
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(folder, { withFileTypes: true });
  } catch (e) {
    // Mac check of 1.9.0: a folder macOS keeps from the app was «not found — plug the drive in»
    return isDenied(e) ? { photos: [], heic: 0, truncated: false, denied: true } : null;
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
  /** the file a pasted path named: its folder is shown («Додати відео…» marks it) */
  file?: string;
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
 * photos it holds. A pasted path (pastedPath) to a file shows its folder. Null when the path is
 * not an absolute path to a folder or a file here; `denied` when the system won't open it.
 */
export async function browse(raw: unknown): Promise<BrowseResult | null> {
  if (raw === undefined || raw === '')
    return { path: null, parent: null, folders: await browseRoots(), photos: 0, heic: 0 };
  if (typeof raw !== 'string') return null;
  const found = await locate(raw);
  if (!found?.kind) return null;
  const { at, kind } = found;
  const dir = kind === 'file' ? path.dirname(at) : at;
  const up = path.dirname(dir);
  const parent = up === dir ? null : up;
  const refused = { path: dir, parent, folders: [], photos: 0, heic: 0, denied: true };
  if (kind === 'denied') return refused;
  try {
    await fsp.readdir(dir);
  } catch (e) {
    return isDenied(e) ? refused : null;
  }
  const [folders, listing] = await Promise.all([subfolders(dir), listPhotos(dir)]);
  return {
    path: dir,
    parent,
    ...(kind === 'file' ? { file: at } : {}),
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
    /**
     * can't be used here: gone, another computer's — or refused (`denied` says why). A refused
     * folder stays `missing` too, so every guard that keeps a missing album off the screen (the
     * running order's preview, an album started from it) keeps this one off as well
     */
    missing: listing === null || !!listing.denied,
    /** why it's `missing`: the system won't open the folder (macOS privacy, rights) — the words */
    denied: !!listing?.denied,
    /** added on another computer (another system's path): not here, never read */
    elsewhere: elsewhere(album.path),
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
