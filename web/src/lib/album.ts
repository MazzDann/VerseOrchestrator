import type { Slide, SlidePicture, SlideStyle } from '../presenterBus';
import { pictureSlide } from './slide';

/**
 * Albums (1.8.12, F1005-13): a folder of photos shown in turn. Each photo goes on screen as a
 * plain picture slide (lib/slide.ts `pictureSlide`) — the output windows and the phones change
 * nothing — with the album's place as its `source`, so a window that takes over goes on from
 * the photo on screen, and the next photo's address, so the windows load it ahead.
 */

/** A photo as the server lists it (server/src/albums.ts `albumEntry`). */
export interface AlbumPhoto {
  name: string;
  src: string;
  /** for the phones (1.8.12-beta.2): its small copy, or the photo itself until there is one */
  small?: string;
  needsSmall?: boolean;
}

/** The name without its extension: what the monitors, the remotes and the phones say. */
export const photoTitle = (name: string) => name.replace(/\.[^.]{1,5}$/, '') || name;

/**
 * The slide for photo `index` of an album. The phones get `small`: the small copy the control
 * window drew (lib/albumSmall.ts), or the photo itself while there is none (beta.2).
 */
export function albumSlide(
  albumId: string,
  photos: readonly AlbumPhoto[],
  index: number,
  fit: SlidePicture['fit'],
  style: SlideStyle,
): Slide {
  const photo = photos[index];
  const next = photos[index + 1]?.src;
  const picture: SlidePicture = {
    src: photo.src,
    small: photo.small ?? photo.src,
    name: photoTitle(photo.name),
    fit,
    ...(next ? { next } : {}),
  };
  return {
    ...pictureSlide(picture, style),
    source: { kind: 'album', albumId, index, name: photo.name },
  };
}

/**
 * Where a photo is now, after the folder may have changed: by its name first (a photo added
 * before it moves it on), else the place it had, kept inside the album; null for an empty album.
 */
export function photoIndex(
  photos: readonly AlbumPhoto[],
  at: { index: number; name?: string },
): number | null {
  if (photos.length === 0) return null;
  const byName = at.name ? photos.findIndex((p) => p.name === at.name) : -1;
  if (byName >= 0) return byName;
  return Math.max(0, Math.min(photos.length - 1, Math.trunc(at.index) || 0));
}
