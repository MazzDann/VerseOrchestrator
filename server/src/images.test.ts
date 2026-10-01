import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addImage,
  cleanName,
  fromDataUrl,
  imageEntry,
  isImageFile,
  listImages,
  restoreImage,
  sniff,
  trashImage,
  type StoredImage,
} from './images';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const GIF = Buffer.from('GIF89a……', 'utf8');
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const url = (b: Buffer, type = 'image/png') => `data:${type};base64,${b.toString('base64')}`;

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-images-'));
  dirs.push(d);
  return path.join(d, 'images');
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('pictures on screen (1.5.0)', () => {
  it('tells PNG, JPEG, GIF and WebP by their first bytes, and nothing else', () => {
    expect(sniff(PNG)).toBe('png');
    expect(sniff(JPG)).toBe('jpg');
    expect(sniff(GIF)).toBe('gif');
    expect(sniff(WEBP)).toBe('webp');
    expect(sniff(SVG)).toBeNull();
    expect(sniff(Buffer.from('hello'))).toBeNull();
  });

  it('reads a data URL and a name', () => {
    expect(fromDataUrl(url(PNG))?.equals(PNG)).toBe(true);
    expect(fromDataUrl('http://x/a.png')).toBeNull();
    expect(fromDataUrl(3)).toBeNull();
    expect(cleanName('C:\\Фото\\Оголошення.JPG')).toBe('Оголошення');
    expect(cleanName('a/b/poster.final.png')).toBe('poster.final');
    expect(cleanName('')).toBe('image');
  });

  it('keeps a picture as two files and lists it, newest first', () => {
    const dir = tmp();
    const a = addImage(
      dir,
      { name: 'Перша.png', full: url(PNG), small: url(JPG, 'image/jpeg'), w: 1920, h: 1080 },
      new Date('2026-10-01T10:00:00Z'),
    ) as StoredImage;
    const b = addImage(
      dir,
      {
        name: 'Друга.jpg',
        full: url(JPG, 'image/jpeg'),
        small: url(JPG, 'image/jpeg'),
        w: 800,
        h: 600,
      },
      new Date('2026-10-01T11:00:00Z'),
    ) as StoredImage;
    expect(a).toMatchObject({ name: 'Перша', ext: 'png', smallExt: 'jpg', w: 1920, h: 1080 });
    expect(fs.existsSync(path.join(dir, `${a.id}.png`))).toBe(true);
    expect(fs.existsSync(path.join(dir, `${a.id}.small.jpg`))).toBe(true);
    expect(listImages(dir).map((i) => i.name)).toEqual(['Друга', 'Перша']);
    const e = imageEntry(a);
    expect(e.src).toBe(`/api/images/file/${a.id}.png`);
    expect(e.small).toBe(`/api/images/file/${a.id}.small.jpg`);
    expect(isImageFile(`${a.id}.png`) && isImageFile(`${a.id}.small.jpg`)).toBe(true);
    expect(b.ext).toBe('jpg');
  });

  it('refuses an SVG (or anything else) whatever it is called, and a broken request', () => {
    const dir = tmp();
    expect(addImage(dir, { name: 'x.png', full: url(SVG), small: url(PNG), w: 10, h: 10 })).toEqual(
      { refused: 'type' },
    );
    expect(addImage(dir, { name: 'x.png', full: url(PNG), small: url(SVG), w: 10, h: 10 })).toEqual(
      { refused: 'type' },
    );
    expect(addImage(dir, { name: 'x.png', full: 'nope', small: url(PNG), w: 10, h: 10 })).toEqual({
      refused: 'shape',
    });
    expect(addImage(dir, { name: 'x.png', full: url(PNG), small: url(PNG), w: 0, h: 10 })).toEqual({
      refused: 'shape',
    });
    expect(listImages(dir)).toEqual([]);
    for (const bad of ['../index.json', 'x.svg', 'index.json', '.trash'])
      expect(isImageFile(bad)).toBe(false);
  });

  it('a deleted picture waits for «Скасувати» and comes back with its id', () => {
    const dir = tmp();
    const a = addImage(dir, {
      name: 'Афіша.png',
      full: url(PNG),
      small: url(PNG),
      w: 100,
      h: 50,
    }) as StoredImage;
    const gone = trashImage(dir, a.id)!;
    expect(gone.image.name).toBe('Афіша');
    expect(listImages(dir)).toEqual([]);
    expect(fs.existsSync(path.join(dir, `${a.id}.png`))).toBe(false);
    expect(trashImage(dir, a.id)).toBeNull();
    const back = restoreImage(dir, gone.trashed)!;
    expect(back.id).toBe(a.id);
    expect(listImages(dir).map((i) => i.id)).toEqual([a.id]);
    expect(restoreImage(dir, gone.trashed)).toBeNull();
    expect(restoreImage(dir, '../../x')).toBeNull();
  });

  it('keeps the last twenty deleted pictures', () => {
    const dir = tmp();
    for (let i = 0; i < 23; i++) {
      const img = addImage(dir, {
        name: `p${i}`,
        full: url(PNG),
        small: url(PNG),
        w: 1,
        h: 1,
      }) as StoredImage;
      trashImage(dir, img.id);
    }
    const metas = fs.readdirSync(path.join(dir, '.trash')).filter((f) => f.endsWith('.json'));
    expect(metas.length).toBe(20);
  });
});
