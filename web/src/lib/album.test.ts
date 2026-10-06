import { describe, expect, it } from 'vitest';
import { albumSlide, photoIndex, photoTitle, type AlbumPhoto } from './album';
import { forAudience } from './slide';
import { isSlide } from './bus';

const photos: AlbumPhoto[] = ['IMG_1.jpg', 'IMG_2.jpg', 'IMG_10.jpg'].map((name) => ({
  name,
  src: `/api/albums/a/file/${name}`,
}));
const style = { font: 'Inter', color: '#fff', background: '#000' } as never;

describe('albums on screen (1.8.12)', () => {
  it('a photo goes as a picture slide with its place and the next one’s address', () => {
    const s = albumSlide('a', photos, 1, 'cover', style);
    expect(s.picture).toEqual({
      src: '/api/albums/a/file/IMG_2.jpg',
      small: '/api/albums/a/file/IMG_2.jpg',
      name: 'IMG_2',
      fit: 'cover',
      next: '/api/albums/a/file/IMG_10.jpg',
    });
    expect(s.source).toEqual({ kind: 'album', albumId: 'a', index: 1, name: 'IMG_2.jpg' });
    expect(s).toMatchObject({ lines: [], reference: 'IMG_2', visible: true, blank: false });
    expect(isSlide(s)).toBe(true);
    // the last photo has nothing ahead
    expect(albumSlide('a', photos, 2, 'contain', style).picture).not.toHaveProperty('next');
    // the phones get the same address, by reference, never the image
    expect(forAudience(s).picture).toEqual(s.picture);
  });

  it('names a photo without its extension', () => {
    expect(photoTitle('Свято 2026.jpeg')).toBe('Свято 2026');
    expect(photoTitle('a.b.png')).toBe('a.b');
    expect(photoTitle('.jpg')).toBe('.jpg');
  });

  it('finds a photo again after the folder changed: by name, else its place', () => {
    expect(photoIndex(photos, { index: 0, name: 'IMG_10.jpg' })).toBe(2);
    expect(photoIndex(photos, { index: 1, name: 'gone.jpg' })).toBe(1);
    expect(photoIndex(photos, { index: 9, name: 'gone.jpg' })).toBe(2);
    expect(photoIndex(photos, { index: -3 })).toBe(0);
    expect(photoIndex([], { index: 0, name: 'IMG_1.jpg' })).toBeNull();
  });
});
