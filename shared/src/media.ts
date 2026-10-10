import { N_ } from './i18n/index.js';

/**
 * The system won't open a folder or a file of an album or a video (Mac check of 1.9.0): macOS
 * keeps Desktop, Documents, Downloads and removable or network disks from a program it hasn't
 * allowed (EPERM), plain rights refuse with EACCES. Not «not found» — the drive is there. The
 * server refuses an add by these keys; the control window tells them apart and, on a Mac, says
 * where to allow it (web/src/lib/denied.ts).
 */
export const FOLDER_DENIED = N_('Система не дає відкрити цю папку — перевірте права доступу.');
export const FILE_DENIED = N_('Система не дає відкрити цей файл — перевірте права доступу.');

/** HEIF's brands — an iPhone's photos are `heic` — and AVIF's, which browsers do read. */
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

/**
 * An HEIC/HEIF photo by its first bytes (1.7.0; shared since 1.14.0-beta.2, the albums read it on
 * the server too): an `ftyp` box whose brands — the major one and the compatible ones — are
 * HEIF's (`mif1` alone is either; AVIF's make it AVIF).
 */
export function isHeic(b: Uint8Array): boolean {
  const text = (at: number) => String.fromCharCode(...b.subarray(at, at + 4));
  if (b.length < 12 || text(4) !== 'ftyp') return false;
  const size = Math.min(b.length, ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0);
  const brands = [text(8)];
  for (let at = 16; at + 4 <= size; at += 4) brands.push(text(at));
  if (brands.some((x) => AVIF_BRANDS.has(x))) return false;
  return brands.some((x) => HEIF_BRANDS.has(x)) || ['mif1', 'msf1'].includes(brands[0]);
}
