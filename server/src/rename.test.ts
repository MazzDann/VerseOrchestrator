import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addImage, listImages, renameImage } from './images';
import { addAlbum, readAlbums, renameAlbum } from './albums';
import { addVideo, readVideos, renameVideo } from './videos';
import { givenName } from './mediaName';

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-rename-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const url = (b: Buffer) => `data:image/png;base64,${b.toString('base64')}`;
/** the start of an MP4: an ftyp box */
const mp4 = () => {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(24);
  return Buffer.concat([
    size,
    Buffer.from('ftyp'),
    Buffer.from('isom\0\0\0\0isomavc1', 'latin1'),
    Buffer.alloc(64),
  ]);
};

describe('«Перейменувати» (1.14.0-beta.1, the author’s Q16)', () => {
  it('a given name: one line, trimmed, at most 120 characters; nothing = no name', () => {
    expect(givenName('  Різдво\n2025  ')).toBe('Різдво 2025');
    expect(givenName('a'.repeat(200))).toHaveLength(120);
    expect(givenName('   ')).toBeNull();
    expect(givenName(3)).toBeNull();
  });

  it('a picture, an album and a video get a new name; the files stay as they are', async () => {
    const root = tmp();
    const images = path.join(root, 'data', 'images');
    const img = addImage(images, {
      name: 'IMG_0001.png',
      full: url(PNG),
      small: url(PNG),
      w: 10,
      h: 10,
    });
    if ('refused' in img) throw new Error('refused');
    const before = fs.readdirSync(images).sort();
    expect(renameImage(images, img.id, 'Оголошення')?.name).toBe('Оголошення');
    expect(listImages(images)[0].name).toBe('Оголошення');
    expect(fs.readdirSync(images).sort()).toEqual(before);
    expect(renameImage(images, 'nope', 'x')).toBeNull();

    const data = path.join(root, 'data');
    const photos = path.join(root, 'Фото');
    fs.mkdirSync(photos);
    fs.writeFileSync(path.join(photos, 'a.png'), PNG);
    const album = await addAlbum(data, { path: photos });
    if ('refused' in album) throw new Error('refused');
    expect(renameAlbum(data, album.id, 'Табір 2025')?.name).toBe('Табір 2025');
    expect(readAlbums(data)[0]).toMatchObject({ name: 'Табір 2025', path: album.path });
    expect(fs.existsSync(photos)).toBe(true);

    const file = path.join(root, 'clip.mp4');
    fs.writeFileSync(file, mp4());
    const video = await addVideo(data, { path: file });
    if ('refused' in video) throw new Error(video.refused);
    expect(renameVideo(data, video.id, 'Вітання')?.name).toBe('Вітання');
    expect(readVideos(data)[0]).toMatchObject({ name: 'Вітання', path: video.path });
    expect(renameVideo(data, 'nope', 'x')).toBeNull();
  });
});
