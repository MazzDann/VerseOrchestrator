import type { SlidePicture } from '../presenterBus';

/**
 * «Вписати / Заповнити» (1.5.0): how a picture or an album's photo fills the slide — a
 * per-viewer convenience in localStorage, read by «Зображення» and by the album's steps.
 */
export type ImageFit = SlidePicture['fit'];
const FIT_KEY = 'vo:imageFit';

export function readImageFit(): ImageFit {
  try {
    return localStorage.getItem(FIT_KEY) === 'cover' ? 'cover' : 'contain';
  } catch {
    return 'contain';
  }
}

export function storeImageFit(fit: ImageFit): void {
  try {
    localStorage.setItem(FIT_KEY, fit);
  } catch {
    /* a per-viewer convenience: not kept is fine */
  }
}
