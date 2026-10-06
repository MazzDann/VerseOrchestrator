import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addAlbum,
  albumEntry,
  browse,
  cachedListing,
  listPhotos,
  MAX_PHOTOS,
  photoFile,
  readAlbums,
  removeAlbum,
  sniffPhoto,
} from './albums';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
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

  it('lists the photos right in a folder in name order: no subfolders, hidden files, other types', () => {
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
    const listing = listPhotos(photos)!;
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

  it('names a photo in NFC, and finds the file a Mac named decomposed', () => {
    const nfd = 'Свято й ялинка.jpg'.normalize('NFD');
    const { photos } = folder({ [nfd]: JPG });
    const listing = listPhotos(photos)!;
    // the disk may keep either spelling (macOS / Windows); the pages always get NFC
    expect(listing.photos[0].name).toBe('Свято й ялинка.jpg'.normalize('NFC'));
    expect(photoFile(photos, 'Свято й ялинка.jpg'.normalize('NFC'))?.type).toBe('image/jpeg');
  });

  it('serves only names in the listing, typed by their bytes, never a file outside the folder', () => {
    const { root, photos } = folder({ 'a.jpg': JPG, 'fake.png': SVG, 'b.bmp': BMP });
    fs.writeFileSync(path.join(root, 'secret.jpg'), JPG);
    fs.mkdirSync(path.join(photos, 'sub'));
    fs.writeFileSync(path.join(photos, 'sub', 'c.jpg'), JPG);
    expect(photoFile(photos, 'a.jpg')).toEqual({
      file: fs.realpathSync(path.join(photos, 'a.jpg')),
      type: 'image/jpeg',
    });
    expect(photoFile(photos, 'b.bmp')?.type).toBe('image/bmp');
    expect(photoFile(photos, 'fake.png')).toBeNull(); // an SVG behind a picture's name
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
      expect(photoFile(photos, bad)).toBeNull();
  });

  it('leaves out a link that leads out of the folder', () => {
    const { root, photos } = folder({ 'a.jpg': JPG });
    fs.writeFileSync(path.join(root, 'secret.jpg'), JPG);
    try {
      fs.symlinkSync(path.join(root, 'secret.jpg'), path.join(photos, 'link.jpg'));
    } catch {
      return; // Windows without developer mode can't make links: nothing to escape through
    }
    expect(listPhotos(photos)!.photos.map((p) => p.name)).toEqual(['a.jpg']);
    expect(photoFile(photos, 'link.jpg')).toBeNull();
  });

  it('keeps the first five thousand photos and says there are more', () => {
    const { photos } = folder({});
    for (let i = 0; i <= MAX_PHOTOS; i++) fs.writeFileSync(path.join(photos, `${i}.jpg`), JPG);
    const listing = listPhotos(photos)!;
    expect(listing.photos).toHaveLength(MAX_PHOTOS);
    expect(listing.photos.at(-1)!.name).toBe(`${MAX_PHOTOS - 1}.jpg`);
    expect(listing.truncated).toBe(true);
  });

  it('adds a folder once, names it after the folder, forgets it without touching the folder', () => {
    const { photos, data } = folder({ 'a.jpg': JPG });
    const added = addAlbum(data, { path: photos });
    if ('refused' in added) throw new Error('refused');
    expect(added.name).toBe('Фото');
    expect(addAlbum(data, { path: photos + path.sep })).toEqual(added);
    if (process.platform === 'win32')
      expect(addAlbum(data, { path: photos.toUpperCase() })).toEqual(added);
    expect(readAlbums(data)).toEqual([added]);
    const named = addAlbum(data, { path: path.dirname(photos), name: '  Свято  2026 ' });
    expect('refused' in named ? null : named.name).toBe('Свято 2026');
    expect(removeAlbum(data, added.id)?.id).toBe(added.id);
    expect(readAlbums(data).map((a) => a.id)).not.toContain(added.id);
    expect(fs.existsSync(path.join(photos, 'a.jpg'))).toBe(true);
    expect(removeAlbum(data, added.id)).toBeNull();
  });

  it('refuses what is not a folder on this computer', () => {
    const { photos, data } = folder({ 'a.jpg': JPG });
    expect(addAlbum(data, { path: 'Фото' })).toEqual({ refused: 'path' });
    expect(addAlbum(data, { path: 3 })).toEqual({ refused: 'path' });
    expect(addAlbum(data, { path: `${photos}\0` })).toEqual({ refused: 'path' });
    expect(addAlbum(data, { path: path.join(photos, 'a.jpg') })).toEqual({ refused: 'missing' });
    expect(addAlbum(data, { path: path.join(photos, 'gone') })).toEqual({ refused: 'missing' });
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

  it('says a folder that went away is missing, and comes back when it returns', () => {
    const { root, photos, data } = folder({ 'a.jpg': JPG });
    const album = addAlbum(data, { path: photos });
    if ('refused' in album) throw new Error('refused');
    fs.renameSync(photos, path.join(root, 'moved'));
    expect(albumEntry(album, listPhotos(album.path))).toMatchObject({ missing: true, count: 0 });
    expect(photoFile(album.path, 'a.jpg')).toBeNull();
    fs.renameSync(path.join(root, 'moved'), photos);
    const back = albumEntry(album, listPhotos(album.path), true);
    expect(back).toMatchObject({ missing: false, count: 1 });
    expect(back.photos).toEqual([{ name: 'a.jpg', src: `/api/albums/${album.id}/file/a.jpg` }]);
  });

  it('keeps a listing two seconds for the file requests, then reads the folder again', () => {
    const { photos } = folder({ 'a.jpg': JPG });
    const t = 1_000_000;
    expect(cachedListing(photos, t)!.photos).toHaveLength(1);
    fs.writeFileSync(path.join(photos, 'b.jpg'), JPG);
    expect(cachedListing(photos, t + 1000)!.photos).toHaveLength(1);
    expect(cachedListing(photos, t + 2500)!.photos).toHaveLength(2);
  });

  it('encodes a photo name in its address', () => {
    const { photos, data } = folder({ 'Різдво #1 & 100%.jpg': JPG });
    const album = addAlbum(data, { path: photos });
    if ('refused' in album) throw new Error('refused');
    const [p] = albumEntry(album, listPhotos(album.path), true).photos!;
    expect(p.src).toBe(
      `/api/albums/${album.id}/file/${encodeURIComponent('Різдво #1 & 100%.jpg')}`,
    );
    expect(photoFile(photos, decodeURIComponent(p.src.split('/').pop()!))?.type).toBe('image/jpeg');
  });

  it('browses: the starting points, a folder’s subfolders and its photos, one level up', () => {
    const { root, photos } = folder({ 'a.jpg': JPG, 'b.heic': HEIC });
    fs.mkdirSync(path.join(photos, 'Літо 10'));
    fs.mkdirSync(path.join(photos, 'Літо 2'));
    fs.mkdirSync(path.join(photos, '.git'));
    fs.mkdirSync(path.join(photos, '$RECYCLE.BIN'));
    const start = browse(undefined)!;
    expect(start.path).toBeNull();
    expect(start.folders[0]).toMatchObject({ path: os.homedir(), kind: 'home' });
    expect(start.folders.some((f) => f.kind === 'drive')).toBe(true);
    const here = browse(photos)!;
    expect(here).toMatchObject({ path: photos, parent: root, photos: 1, heic: 1 });
    expect(here.folders.map((f) => f.name)).toEqual(['Літо 2', 'Літо 10']);
    expect(here.folders[0].path).toBe(path.join(photos, 'Літо 2'));
    expect(browse(path.parse(photos).root)!.parent).toBeNull();
    expect(browse('relative/path')).toBeNull();
    expect(browse(path.join(photos, 'a.jpg'))).toBeNull();
    expect(browse(path.join(photos, 'gone'))).toBeNull();
    expect(browse(42)).toBeNull();
  });
});
