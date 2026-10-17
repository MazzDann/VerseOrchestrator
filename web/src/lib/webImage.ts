import { api } from '../api';

/**
 * Pictures from the internet (1.19.0-beta.3, the users' F1017-16): a picture dragged from a web page, a
 * picture or its address pasted (Ctrl+V), an address typed into «З інтернету…». A picture's own bytes
 * (a copied picture, a dragged one the browser hands over as a file) go the dropped files' way; an address
 * is fetched by the app's server (server/src/imageFetch.ts — a page may not read another site's picture),
 * a `data:` one read here. Either way the result is a File for lib/image.ts, as if dropped.
 */

/** The picture's address in a drag from a web page: the <img> it carried, else the link. */
export function imageAddressOf(data: {
  getData: (type: string) => string;
  types: readonly string[];
}): string | null {
  if (data.types.includes('text/html')) {
    const src = /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i.exec(data.getData('text/html'))?.[1];
    if (src) return src.replace(/&amp;/g, '&');
  }
  if (data.types.includes('text/uri-list')) {
    const first = data
      .getData('text/uri-list')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    if (first) return first;
  }
  return null;
}

/** Text that is one address of a picture or a page: http(s) or a `data:image/…` one. */
export function looksLikeAddress(text: string): boolean {
  const t = text.trim();
  if (/^data:image\/[\w.+-]+;base64,/i.test(t)) return true;
  if (/\s/.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/** The picture's file name with an extension its type agrees with. */
export function fileNameFor(name: string, type: string): string {
  const ext = EXT[type];
  if (!ext) return name;
  const base = name.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  return `${base || 'Зображення'}.${ext}`; // i18n-ignore: a file name
}

/** The picture at an address, as a file — fetched by the server, or read here from `data:`. */
export async function fileFromAddress(address: string): Promise<File> {
  const t = address.trim();
  if (/^data:image\//i.test(t)) {
    const blob = await (await fetch(t)).blob();
    return new File([blob], fileNameFor('Зображення', blob.type), { type: blob.type }); // i18n-ignore: a file name
  }
  const { blob, name } = await api.fetchImage(t);
  return new File([blob], fileNameFor(name, blob.type), { type: blob.type });
}
