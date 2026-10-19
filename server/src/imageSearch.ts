/**
 * Pictures from the internet by a search (1.19.0-beta.9, the author with the users' F1017-16/06): free
 * pictures with their author and licence — Wikimedia Commons (no key; its rules want a User-Agent that says
 * who asks) and Openverse (no key; an anonymous asker gets a limited number of searches a day). A result
 * carries the credit the picture keeps on the list and on screen.
 */
export type SearchSource = 'commons' | 'openverse';

export interface FoundImage {
  id: string;
  title: string;
  /** a small picture for the results */
  thumb: string;
  /** the picture to add: at most about 1920 px wide */
  url: string;
  w: number;
  h: number;
  author: string;
  license: string;
  /** the page of the picture where it lives */
  page: string;
  source: SearchSource;
  /** «author · licence · source», what goes with the picture */
  credit: string;
}

export type SearchRefusal = 'query' | 'busy' | 'failed';

const UA = 'VerseOrchestrator/1.19 (https://github.com/MazzDann/VerseOrchestrator)';
const PICTURE_MIME = /^image\/(jpeg|png|webp|gif)$/;
export const PAGE_SIZE = 24;

/** Wikimedia's metadata is HTML («<a href=…>Jane Doe</a>»): its words only. */
export function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export const creditOf = (author: string, license: string, sourceName: string) =>
  [author, license, sourceName].filter(Boolean).join(' · ').slice(0, 300);

interface CommonsPage {
  pageid: number;
  title: string;
  imageinfo?: {
    url: string;
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
    width: number;
    height: number;
    mime: string;
    descriptionurl: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }[];
}

/** Commons' answer → pictures (no SVG, TIFF, PDF — what a slide shows). */
export function fromCommons(body: unknown): FoundImage[] {
  const pages = (body as { query?: { pages?: Record<string, CommonsPage> } })?.query?.pages ?? {};
  const out: (FoundImage & { index: number })[] = [];
  for (const p of Object.values(pages)) {
    const info = p.imageinfo?.[0];
    if (!info || !PICTURE_MIME.test(info.mime)) continue;
    const meta = info.extmetadata ?? {};
    const author = plain(meta.Artist?.value ?? '').slice(0, 120);
    const license = plain(meta.LicenseShortName?.value ?? '').slice(0, 60);
    const url = info.thumburl ?? info.url;
    // a thumbnail's width is in its last part only (an original named «120px-…» isn't one — review)
    const thumb =
      info.thumburl && info.thumburl.includes('/thumb/')
        ? info.thumburl.replace(/\/\d+px-(?=[^/]*$)/, '/320px-')
        : url;
    out.push({
      id: `commons:${p.pageid}`,
      title: plain(meta.ObjectName?.value ?? p.title.replace(/^File:/, '').replace(/\.[^.]+$/, '')),
      thumb,
      url,
      w: info.thumbwidth ?? info.width,
      h: info.thumbheight ?? info.height,
      author,
      license,
      page: info.descriptionurl,
      source: 'commons',
      credit: creditOf(author, license, 'Wikimedia Commons'),
      index: (p as { index?: number }).index ?? 0,
    });
  }
  return out.sort((a, b) => a.index - b.index).map(({ index: _i, ...rest }) => (void _i, rest));
}

interface OpenverseResult {
  id: string;
  title?: string;
  url: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  creator?: string;
  license?: string;
  license_version?: string;
  foreign_landing_url?: string;
  filetype?: string;
}

/** Openverse's answer → pictures. */
export function fromOpenverse(body: unknown): FoundImage[] {
  const results = (body as { results?: OpenverseResult[] })?.results ?? [];
  return results
    .filter((r) => r.url && (!r.filetype || /^(jpe?g|png|webp|gif)$/i.test(r.filetype)))
    .map((r) => {
      const license =
        r.license === 'pdm' || r.license === 'cc0'
          ? r.license.toUpperCase()
          : `CC ${(r.license ?? '').toUpperCase()} ${r.license_version ?? ''}`.trim();
      const author = (r.creator ?? '').slice(0, 120);
      return {
        id: `openverse:${r.id}`,
        title: (r.title ?? '').slice(0, 200),
        thumb: r.thumbnail ?? r.url,
        url: r.url,
        w: r.width ?? 0,
        h: r.height ?? 0,
        author,
        license,
        page: r.foreign_landing_url ?? '',
        source: 'openverse' as const,
        credit: creditOf(author, license, 'Openverse'),
      };
    });
}

export async function searchImages(
  q: string,
  source: SearchSource,
  page: number,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ images: FoundImage[]; more: boolean } | { refused: SearchRefusal }> {
  const query = q.trim().slice(0, 200);
  if (!query) return { refused: 'query' };
  const get = opts.fetchImpl ?? fetch;
  const n = Math.max(1, Math.min(50, Math.floor(page) || 1));
  const url =
    source === 'openverse'
      ? `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page=${n}&page_size=${PAGE_SIZE}&mature=false`
      : 'https://commons.wikimedia.org/w/api.php?' +
        new URLSearchParams({
          action: 'query',
          format: 'json',
          generator: 'search',
          gsrsearch: `${query} filetype:bitmap`,
          gsrnamespace: '6',
          gsrlimit: String(PAGE_SIZE),
          gsroffset: String((n - 1) * PAGE_SIZE),
          prop: 'imageinfo',
          iiprop: 'url|size|mime|extmetadata',
          iiurlwidth: '1920',
          iiextmetadatafilter: 'Artist|LicenseShortName|ObjectName',
        }).toString();
  let res: Response;
  try {
    res = await get(url, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
  } catch {
    return { refused: 'failed' };
  }
  if (res.status === 429) return { refused: 'busy' };
  if (!res.ok) return { refused: 'failed' };
  const body = await res.json().catch(() => null);
  if (!body) return { refused: 'failed' };
  const images = source === 'openverse' ? fromOpenverse(body) : fromCommons(body);
  const more =
    source === 'openverse'
      ? n < ((body as { page_count?: number }).page_count ?? 0)
      : !!(body as { continue?: unknown }).continue;
  return { images, more };
}
