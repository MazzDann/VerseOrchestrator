import { MAX_FULL_BYTES } from './images.js';

/**
 * A picture from the internet (1.19.0-beta.3, the users' F1017-16 «А як картинку з інтернету показати?»):
 * the control window gives an address — a picture dragged from a web page, a copied address pasted,
 * «З інтернету…» in «Зображення» — and the server fetches it, since a page may not read another site's
 * picture (CORS). Only http(s); the answer must be a picture (image/*), up to the pictures' 40 MB, within
 * 20 s. A web page instead of a picture: the picture it names for sharing (og:image / twitter:image), once.
 * The bytes go back as they came: the page makes the picture (lib/image.ts) and keeps it as a dropped file.
 */
export type FetchRefusal = 'address' | 'type' | 'size' | 'failed';

export interface FetchedImage {
  type: string;
  bytes: Buffer;
  /** the file's name from the address, for the picture's name */
  name: string;
}

export const FETCH_TIMEOUT_MS = 20_000;

/** The address as the server may fetch it: http(s) only, no user:password part. */
export function fetchableUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url;
}

/** «…/photos/Захід%20сонця.jpg?w=800» → «Захід сонця.jpg»; none → «Зображення». */
export function nameFromUrl(url: URL): string {
  const last = url.pathname.split('/').filter(Boolean).pop() ?? '';
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // a broken escape: the raw segment
  }
  // what a file name can't hold, control characters too
  name = [...name]
    .filter((c) => c.charCodeAt(0) >= 32 && !'\\/:*?"<>|'.includes(c))
    .join('')
    .trim();
  return name.slice(0, 120) || 'Зображення'; // i18n-ignore: a file name
}

/** The picture a web page names for sharing: og:image, else twitter:image (absolute). */
export function sharedImageOf(html: string, base: URL): string | null {
  const metas = html.match(/<meta\b[^>]*>/gi) ?? [];
  const find = (key: string) => {
    for (const m of metas) {
      const prop = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(m)?.[1]?.toLowerCase();
      if (prop !== key) continue;
      const content = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(m)?.[1];
      if (content) return content.replace(/&amp;/g, '&');
    }
    return null;
  };
  const found = find('og:image') ?? find('og:image:url') ?? find('twitter:image');
  if (!found) return null;
  try {
    return new URL(found, base).href;
  } catch {
    return null;
  }
}

/** Read a body up to `limit` bytes; past it, null. */
async function readCapped(res: Response, limit: number): Promise<Buffer | null> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

export async function fetchImage(
  raw: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; limit?: number } = {},
): Promise<FetchedImage | { refused: FetchRefusal; status?: number }> {
  const get = opts.fetchImpl ?? fetch;
  const limit = opts.limit ?? MAX_FULL_BYTES;
  const first = fetchableUrl(raw);
  if (!first) return { refused: 'address' };
  let url: URL = first;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  // a page instead of a picture: its shared picture, once
  for (let hop = 0; hop < 2; hop++) {
    let res: Response;
    try {
      res = await get(url.href, {
        signal,
        redirect: 'follow',
        headers: {
          // some hosts answer a bare client with a page or a refusal
          'User-Agent': 'Mozilla/5.0 (VerseOrchestrator) AppleWebKit/537.36 (KHTML, like Gecko)',
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.9,text/html;q=0.5',
        },
      });
    } catch {
      return { refused: 'failed' };
    }
    // a refusal lets the connection go at once, not at the timeout (review)
    const drop = () => void res.body?.cancel().catch(() => {});
    if (!res.ok) {
      drop();
      return { refused: 'failed', status: res.status };
    }
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (type.startsWith('image/')) {
      const length = Number(res.headers.get('content-length') ?? 0);
      if (length > limit) return { refused: 'size' };
      const bytes = await readCapped(res, limit).catch(() => undefined);
      if (bytes === undefined) return { refused: 'failed' };
      if (bytes === null) return { refused: 'size' };
      return { type, bytes, name: nameFromUrl(new URL(res.url || url.href)) };
    }
    if (hop > 0 || type !== 'text/html') {
      drop();
      return { refused: 'type' };
    }
    const html = await readCapped(res, 2 * 1024 * 1024).catch(() => null);
    const shared: string | null = html
      ? sharedImageOf(html.toString('utf8'), new URL(res.url || url.href))
      : null;
    const next: URL | null = shared ? fetchableUrl(shared) : null;
    if (!next) return { refused: 'type' };
    url = next;
  }
  return { refused: 'type' };
}
