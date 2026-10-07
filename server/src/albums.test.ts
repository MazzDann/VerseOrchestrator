import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addAlbum,
  albumEntry,
  browse,
  cachedListing,
  dropSmalls,
  elsewhere,
  listPhotos,
  putSmall,
  smallCopies,
  smallFile,
  MAX_PHOTOS,
  photoFile,
  readAlbums,
  removeAlbum,
  samePath,
  sniffPhoto,
  type Album,
} from './albums';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const GIF = Buffer.from('GIF89a', 'latin1');
const box = (major: string, ...compatible: string[]) => {
  const brands = Buffer.from(major + '\0\0\0\0' + compatible.join(''), 'latin1');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + brands.length);
  return Buffer.concat([size, Buffer.from('ftyp'), brands, Buffer.alloc(16)]);
};
const AVIF = box('avif', 'mif1', 'miaf');
const AVIF_MINOR = box('mif1', 'avif');
const HEIC = box('heic', 'mif1', 'heic');
const BMP = Buffer.concat([Buffer.from('BM'), Buffer.alloc(12), Buffer.from([40, 0, 0, 0])]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-albums-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A folder of photos (and other things) next to a data folder. */
function folder(files: Record<string, Buffer>) {
  const root = tmp();
  const photos = path.join(root, 'Фото');
  fs.mkdirSync(photos);
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(photos, name), data);
  return { root, photos, data: path.join(root, 'data') };
}

const added = async (data: string, input: { path?: unknown; name?: unknown }) => {
  const a = await addAlbum(data, input);
  if ('refused' in a) throw new Error(`refused: ${a.refused}`);
  return a;
};
const names = async (dir: string) => (await listPhotos(dir))!.photos.map((p) => p.name);

/** A disk that doesn't tell «Фото» from «ФОТО» (a Mac's APFS by default, NTFS) — not Linux's. */
const caseBlind = fs.existsSync(os.tmpdir().toUpperCase());
/** A folder link: a junction needs no rights on Windows; a Mac's /var is itself a link. */
const linkType = process.platform === 'win32' ? 'junction' : 'dir';
/** A folder link can be made here — probed once, like caseBlind, so a test without one says so. */
const canLink = (() => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-albums-link-'));
  try {
    fs.mkdirSync(path.join(d, 'a'));
    fs.symlinkSync(path.join(d, 'a'), path.join(d, 'b'), linkType);
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
})();
/** A Mac's startup disk under /Volumes: a link to / (when it keeps its first name). */
const startupDisk = process.platform === 'darwin' && fs.existsSync('/Volumes/Macintosh HD');
/** Paths the other system wrote: a Windows drive and share here, a Mac's folders on Windows. */
const [FAR, SHARE] =
  process.platform === 'win32'
    ? ['/Volumes/Фото/Свято', '/Users/vo/Pictures']
    : ['D:\\Фото\\Свято', '\\\\NAS\\photos'];

describe('albums: folders of photos (1.8.12)', () => {
  it('tells AVIF and BMP by their first bytes, besides the four pictures — never HEIC or SVG', () => {
    expect(sniffPhoto(PNG)).toBe('png');
    expect(sniffPhoto(JPG)).toBe('jpg');
    expect(sniffPhoto(AVIF)).toBe('avif');
    expect(sniffPhoto(AVIF_MINOR)).toBe('avif');
    expect(sniffPhoto(BMP)).toBe('bmp');
    expect(sniffPhoto(HEIC)).toBeNull();
    expect(sniffPhoto(SVG)).toBeNull();
    expect(sniffPhoto(Buffer.from('BM hello, not a bitmap'))).toBeNull();
  });

  it('lists the photos right in a folder in name order: no subfolders, hidden files, other types', async () => {
    const { photos } = folder({
      'IMG_10.jpg': JPG,
      'IMG_2.JPG': JPG,
      'img_1.png': PNG,
      'Б.webp': PNG,
      'а.avif': AVIF,
      '._IMG_2.JPG': JPG, // a Mac's companion on a flash drive
      '.hidden.jpg': JPG,
      'notes.txt': Buffer.from('x'),
      'drawing.svg': SVG,
      'IMG_3.HEIC': HEIC,
      '.jpg': JPG,
    });
    fs.mkdirSync(path.join(photos, 'more.jpg'));
    const listing = (await listPhotos(photos))!;
    // Ukrainian order on every machine: Cyrillic first
    expect(listing.photos.map((p) => p.name)).toEqual([
      'а.avif',
      'Б.webp',
      'img_1.png',
      'IMG_2.JPG',
      'IMG_10.jpg',
    ]);
    expect(listing.heic).toBe(1);
    expect(listing.truncated).toBe(false);
  });

  it('names a photo in NFC, and finds the file a Mac named decomposed', async () => {
    const nfd = 'Свято й ялинка.jpg'.normalize('NFD');
    const { photos } = folder({ [nfd]: JPG });
    // the disk may keep either spelling (macOS / Windows); the pages always get NFC
    expect(await names(photos)).toEqual(['Свято й ялинка.jpg'.normalize('NFC')]);
    expect((await photoFile(photos, 'Свято й ялинка.jpg'.normalize('NFC')))?.type).toBe(
      'image/jpeg',
    );
  });

  it('serves only names in the listing, typed by their bytes, never a file outside the folder', async () => {
    const { root, photos } = folder({ 'a.jpg': JPG, 'fake.png': SVG, 'b.bmp': BMP });
    fs.writeFileSync(path.join(root, 'secret.jpg'), JPG);
    fs.mkdirSync(path.join(photos, 'sub'));
    fs.writeFileSync(path.join(photos, 'sub', 'c.jpg'), JPG);
    expect(await photoFile(photos, 'a.jpg')).toMatchObject({
      file: fs.realpathSync(path.join(photos, 'a.jpg')),
      type: 'image/jpeg',
    });
    expect((await photoFile(photos, 'b.bmp'))?.type).toBe('image/bmp');
    expect(await photoFile(photos, 'fake.png')).toBeNull(); // an SVG behind a picture's name
    for (const bad of [
      '../secret.jpg',
      '..\\secret.jpg',
      'sub/c.jpg',
      'sub\\c.jpg',
      path.join(root, 'secret.jpg'),
      'a.jpg\0',
      '',
      '.',
      '..',
    ])
      expect(await photoFile(photos, bad)).toBeNull();
  });

  it('leaves out a link that leads out of the folder', async () => {
    const { root, photos } = folder({ 'a.jpg': JPG });
    fs.writeFileSync(path.join(root, 'secret.jpg'), JPG);
    try {
      fs.symlinkSync(path.join(root, 'secret.jpg'), path.join(photos, 'link.jpg'));
    } catch {
      return; // Windows without developer mode can't make links: nothing to escape through
    }
    expect(await names(photos)).toEqual(['a.jpg']);
    expect(await photoFile(photos, 'link.jpg')).toBeNull();
  });

  // 5 001 files take 2 s alone on Windows, 4–7 s in the parallel full run: a timeout of its own.
  // Empty files — a listing goes by the name and never reads the bytes — are quicker to write.
  it('keeps the first five thousand photos and says there are more', async () => {
    const { photos } = folder({});
    for (let i = 0; i <= MAX_PHOTOS; i++) fs.writeFileSync(path.join(photos, `${i}.jpg`), '');
    const listing = (await listPhotos(photos))!;
    expect(listing.photos).toHaveLength(MAX_PHOTOS);
    expect(listing.photos.at(-1)!.name).toBe(`${MAX_PHOTOS - 1}.jpg`);
    expect(listing.truncated).toBe(true);
  }, 30_000);

  it('adds a folder once, names it after the folder, forgets it without touching the folder', async () => {
    const { photos, data } = folder({ 'a.jpg': JPG });
    const album = await added(data, { path: photos });
    expect(album.name).toBe('Фото');
    expect(await addAlbum(data, { path: photos + path.sep })).toEqual(album);
    if (process.platform === 'win32')
      expect(await addAlbum(data, { path: photos.toUpperCase() })).toEqual(album);
    expect(readAlbums(data)).toEqual([album]);
    const named = await added(data, { path: path.dirname(photos), name: '  Свято  2026 ' });
    expect(named.name).toBe('Свято 2026');
    // two folders added at once: both kept
    const [x, y] = [path.join(photos, 'x'), path.join(photos, 'y')];
    fs.mkdirSync(x);
    fs.mkdirSync(y);
    await Promise.all([added(data, { path: x }), added(data, { path: y })]);
    expect(readAlbums(data)).toHaveLength(4);
    expect(removeAlbum(data, album.id)?.id).toBe(album.id);
    expect(readAlbums(data).map((a) => a.id)).not.toContain(album.id);
    expect(fs.existsSync(path.join(photos, 'a.jpg'))).toBe(true);
    expect(removeAlbum(data, album.id)).toBeNull();
  });

  it('refuses what is not a folder on this computer', async () => {
    const { photos, data } = folder({ 'a.jpg': JPG });
    expect(await addAlbum(data, { path: 'Фото' })).toEqual({ refused: 'path' });
    expect(await addAlbum(data, { path: 3 })).toEqual({ refused: 'path' });
    expect(await addAlbum(data, { path: `${photos}\0` })).toEqual({ refused: 'path' });
    expect(await addAlbum(data, { path: path.join(photos, 'a.jpg') })).toEqual({
      refused: 'missing',
    });
    expect(await addAlbum(data, { path: path.join(photos, 'gone') })).toEqual({
      refused: 'missing',
    });
    expect(readAlbums(data)).toEqual([]);
  });

  it('drops entries of albums.json it could not have written', () => {
    const { data } = folder({});
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(
      path.join(data, 'albums.json'),
      JSON.stringify({
        albums: [
          { id: '../../x', name: 'a', path: '/x', added: '' },
          { id: '0'.repeat(36), name: 'b', path: 'relative', added: '' },
          { id: '0'.repeat(36), name: 'c', path: path.resolve('/x'), added: '' },
        ],
      }),
    );
    expect(readAlbums(data).map((a) => a.name)).toEqual(['c']);
  });

  it('tells a path another system wrote (Mac check of 1.9.0)', () => {
    expect(elsewhere('D:\\Фото\\Свято', 'darwin')).toBe(true);
    expect(elsewhere('\\\\NAS\\photos', 'linux')).toBe(true);
    expect(elsewhere('C:/Фото', 'darwin')).toBe(true);
    expect(elsewhere('/Volumes/Фото', 'darwin')).toBe(false);
    expect(elsewhere('/Volumes/Фото', 'win32')).toBe(true);
    expect(elsewhere('D:\\Фото', 'win32')).toBe(false);
    expect(elsewhere('d:/Фото', 'win32')).toBe(false);
    expect(elsewhere('\\\\NAS\\photos', 'win32')).toBe(false);
    // not a path anywhere: neither this system's nor another's (readAlbums drops it)
    for (const platform of ['darwin', 'win32'] as const) {
      expect(elsewhere('Фото', platform)).toBe(false);
      expect(elsewhere('', platform)).toBe(false);
    }
  });

  it('keeps albums another system added: written back as they are, never read, removable (Mac check of 1.9.0)', async () => {
    const { photos, data } = folder({ 'a.jpg': JPG });
    const theirs: Album[] = [
      { id: crypto.randomUUID(), name: 'Свято', path: FAR, added: '2026-10-01T10:00:00.000Z' },
      { id: crypto.randomUUID(), name: 'NAS', path: SHARE, added: '2026-10-01T10:01:00.000Z' },
    ];
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'albums.json'), JSON.stringify({ albums: theirs }));
    expect(readAlbums(data)).toEqual(theirs);
    // never the album a folder here already is — not even by the path this system makes of it
    // (on Windows `/Users/vo/Pictures` resolves to C:\Users\vo\Pictures, a folder there)
    for (const far of [FAR, SHARE]) {
      expect(samePath(far, path.resolve(far))).toBe(false);
      expect(samePath(far, far)).toBe(false);
    }
    // an add and a remove of this computer's albums write the file again: theirs stay — and the
    // add never asks the disk for their real paths
    const realpath = vi.spyOn(fsp, 'realpath');
    let asked: unknown[];
    let mine: Album;
    try {
      mine = await added(data, { path: photos });
      const other = await added(data, { path: path.dirname(photos) });
      expect(removeAlbum(data, other.id)?.id).toBe(other.id);
    } finally {
      asked = realpath.mock.calls.map(([p]) => p);
      realpath.mockRestore();
    }
    expect(asked).toContain(photos);
    expect(asked).not.toContain(FAR);
    expect(asked).not.toContain(SHARE);
    expect(readAlbums(data)).toEqual([...theirs, mine]);
    // shown as not here — and never asked of the disk (on a Mac `D:\Фото` is a relative name)
    const readdir = vi.spyOn(fsp, 'readdir');
    try {
      expect(await listPhotos(FAR)).toBeNull();
      expect(await photoFile(FAR, 'a.jpg')).toBeNull();
      expect(await smallFile(data, theirs[0], 'a.jpg')).toBeNull();
      expect(await putSmall(data, theirs[0], 'a.jpg', '8-1', JPG)).toEqual({ refused: 'photo' });
      expect(readdir).not.toHaveBeenCalled();
    } finally {
      readdir.mockRestore();
    }
    expect(albumEntry(theirs[0], await listPhotos(FAR))).toMatchObject({
      missing: true,
      elsewhere: true,
      count: 0,
    });
    expect(albumEntry(mine, await listPhotos(mine.path))).toMatchObject({
      missing: false,
      elsewhere: false,
      count: 1,
    });
    // the operator can still take one away
    expect(removeAlbum(data, theirs[0].id)?.path).toBe(FAR);
    expect(readAlbums(data)).toEqual([theirs[1], mine]);
  });

  it.skipIf(!canLink)(
    'a folder reached through a link is the album it already is (Mac check of 1.9.0)',
    async () => {
      const { root, photos, data } = folder({ 'a.jpg': JPG });
      const album = await added(data, { path: photos });
      const link = path.join(root, 'link');
      fs.symlinkSync(photos, link, linkType);
      expect(await addAlbum(data, { path: link })).toEqual(album);
      // a Mac's temporary folder is under /var, a link to /private/var
      expect(await addAlbum(data, { path: fs.realpathSync(photos) })).toEqual(album);
      expect(readAlbums(data)).toEqual([album]);
    },
  );

  it.skipIf(!startupDisk)(
    'a folder by way of the startup disk under /Volumes is the album it already is (Mac check of 1.9.0)',
    async () => {
      const { photos, data } = folder({ 'a.jpg': JPG });
      const album = await added(data, { path: photos });
      const hd = '/Volumes/Macintosh HD' + fs.realpathSync(photos);
      expect(await addAlbum(data, { path: hd })).toEqual(album);
      expect(readAlbums(data)).toEqual([album]);
    },
  );

  it.skipIf(!caseBlind)(
    'the same folder in another case is the album it already is (Mac check of 1.9.0)',
    async () => {
      const { root, photos, data } = folder({ 'a.jpg': JPG });
      const album = await added(data, { path: photos });
      expect(await addAlbum(data, { path: path.join(root, 'фото') })).toEqual(album);
      expect(await addAlbum(data, { path: path.join(root.toUpperCase(), 'ФОТО') })).toEqual(album);
      expect(readAlbums(data)).toEqual([album]);
    },
  );

  it('says a folder that went away is missing, and comes back when it returns', async () => {
    const { root, photos, data } = folder({ 'a.jpg': JPG });
    const album: Album = await added(data, { path: photos });
    fs.renameSync(photos, path.join(root, 'moved'));
    expect(albumEntry(album, await listPhotos(album.path))).toMatchObject({
      missing: true,
      count: 0,
    });
    expect(await photoFile(album.path, 'a.jpg')).toBeNull();
    fs.renameSync(path.join(root, 'moved'), photos);
    const back = albumEntry(album, await listPhotos(album.path), true);
    expect(back).toMatchObject({ missing: false, count: 1 });
    expect(back.photos).toEqual([
      {
        name: 'a.jpg',
        src: `/api/albums/${album.id}/file/a.jpg`,
        small: `/api/albums/${album.id}/small/a.jpg`,
        needsSmall: false, // a few bytes: its own small copy
      },
    ]);
  });

  it('keeps a listing two seconds after it is read, then reads the folder again', async () => {
    const { photos } = folder({ 'a.jpg': JPG });
    let t = 1_000_000;
    const clock = () => t;
    expect((await cachedListing(photos, clock))!.photos).toHaveLength(1);
    fs.writeFileSync(path.join(photos, 'b.jpg'), JPG);
    t += 1000;
    expect((await cachedListing(photos, clock))!.photos).toHaveLength(1);
    t += 1500;
    expect((await cachedListing(photos, clock))!.photos).toHaveLength(2);
    // one read at a time: asked again while it is read, the same promise
    t += 5000;
    const first = cachedListing(photos, clock);
    t += 5000;
    expect(cachedListing(photos, clock)).toBe(first);
  });

  it('encodes a photo name in its address', async () => {
    const { photos, data } = folder({ 'Різдво #1 & 100%.jpg': JPG });
    const album = await added(data, { path: photos });
    const [p] = albumEntry(album, await listPhotos(album.path), true).photos!;
    expect(p.src).toBe(
      `/api/albums/${album.id}/file/${encodeURIComponent('Різдво #1 & 100%.jpg')}`,
    );
    const name = decodeURIComponent(p.src.split('/').pop()!);
    expect((await photoFile(photos, name))?.type).toBe('image/jpeg');
  });

  it('browses: the starting points, a folder’s subfolders and its photos, one level up', async () => {
    const { root, photos } = folder({ 'a.jpg': JPG, 'b.heic': HEIC });
    fs.mkdirSync(path.join(photos, 'Літо 10'));
    fs.mkdirSync(path.join(photos, 'Літо 2'));
    fs.mkdirSync(path.join(photos, '.git'));
    fs.mkdirSync(path.join(photos, '$RECYCLE.BIN'));
    const start = (await browse(undefined))!;
    expect(start.path).toBeNull();
    expect(start.folders[0]).toMatchObject({ path: os.homedir(), kind: 'home' });
    expect(start.folders.some((f) => f.kind === 'drive')).toBe(true);
    const here = (await browse(photos))!;
    expect(here).toMatchObject({ path: photos, parent: root, photos: 1, heic: 1 });
    expect(here.folders.map((f) => f.name)).toEqual(['Літо 2', 'Літо 10']);
    expect(here.folders[0].path).toBe(path.join(photos, 'Літо 2'));
    expect((await browse(path.parse(photos).root))!.parent).toBeNull();
    expect(await browse('relative/path')).toBeNull();
    expect(await browse(path.join(photos, 'a.jpg'))).toBeNull();
    expect(await browse(path.join(photos, 'gone'))).toBeNull();
    expect(await browse(42)).toBeNull();
  });

  it('small copies for the phones: kept per photo version, the photo itself until one is there (1.8.12-beta.2)', async () => {
    const big = Buffer.concat([JPG, Buffer.alloc(600 * 1024)]); // a «camera» photo over 512 KB
    const { root, photos, data } = folder({ 'big.jpg': big, 'tiny.jpg': JPG });
    fs.writeFileSync(path.join(photos, 'anim.gif'), Buffer.concat([GIF, Buffer.alloc(700 * 1024)]));
    const album = await added(data, { path: photos });
    const page = async () =>
      Object.fromEntries(
        albumEntry(
          album,
          await listPhotos(album.path, true),
          true,
          await smallCopies(data, album.id),
        ).photos!.map((p) => [p.name, p]),
      );
    const needs = async () =>
      Object.fromEntries(Object.entries(await page()).map(([n, p]) => [n, p.needsSmall]));
    // a small file and a GIF (its frames) are their own small copies
    expect(await needs()).toEqual({ 'anim.gif': false, 'big.jpg': true, 'tiny.jpg': false });
    // a count or a file's checks list without stats: no version, nothing asked of anyone
    const bare = albumEntry(album, await listPhotos(album.path), true).photos!;
    expect(bare.every((p) => p.v === undefined && p.needsSmall === false)).toBe(true);
    const real = fs.realpathSync(path.join(photos, 'big.jpg'));
    expect((await smallFile(data, album, 'big.jpg'))?.file).toBe(real);
    const v1 = (await page())['big.jpg'].v!;
    const copy = Buffer.concat([JPG, Buffer.from('small')]);
    expect(await putSmall(data, album, 'big.jpg', v1, copy)).toEqual({ bytes: copy.length });
    expect(await needs()).toEqual({ 'anim.gif': false, 'big.jpg': false, 'tiny.jpg': false });
    const sent = (await smallFile(data, album, 'big.jpg'))!;
    expect(sent.type).toBe('image/jpeg');
    expect(fs.readFileSync(sent.file).equals(copy)).toBe(true);
    expect(sent.file.startsWith(path.join(data, 'album-cache', album.id))).toBe(true);
    // replaced by another photo with an OLDER date (a copy that keeps dates): no copy of it yet
    fs.writeFileSync(path.join(photos, 'big.jpg'), Buffer.concat([big, Buffer.alloc(10)]));
    const old = new Date(Date.now() - 86_400_000);
    fs.utimesSync(path.join(photos, 'big.jpg'), old, old);
    expect((await needs())['big.jpg']).toBe(true);
    expect((await smallFile(data, album, 'big.jpg'))?.file).toBe(real);
    // a copy drawn of the version before is refused; one of this version replaces the old one
    expect(await putSmall(data, album, 'big.jpg', v1, copy)).toEqual({ refused: 'changed' });
    const v2 = (await page())['big.jpg'].v!;
    expect(await putSmall(data, album, 'big.jpg', v2, copy)).toEqual({ bytes: copy.length });
    expect(fs.readdirSync(path.join(data, 'album-cache', album.id))).toHaveLength(1);
    // only JPEG, only up to 4 MB, only a photo the folder holds — and never a path
    expect(await putSmall(data, album, 'big.jpg', v2, Buffer.from('<svg/>'))).toEqual({
      refused: 'type',
    });
    const huge = Buffer.concat([JPG, Buffer.alloc(4 * 1024 * 1024)]);
    expect(await putSmall(data, album, 'big.jpg', v2, huge)).toEqual({ refused: 'size' });
    expect(await putSmall(data, album, '../../secret.jpg', v2, copy)).toEqual({ refused: 'photo' });
    expect(await putSmall(data, album, 'gone.jpg', v2, copy)).toEqual({ refused: 'photo' });
    expect(fs.readdirSync(root).sort()).toEqual(['data', 'Фото']);
    // the album removed: its copies go, the folder stays
    await dropSmalls(data, album.id);
    expect(fs.existsSync(path.join(data, 'album-cache', album.id))).toBe(false);
    expect(fs.existsSync(path.join(photos, 'big.jpg'))).toBe(true);
  });
});
