import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fetchableUrl } from './imageFetch.js';
import { addVideo, sniffVideo, VIDEO_EXTS, youtubeIdOf, type Video } from './videos.js';

/**
 * «Відео за посиланням» (1.19.0-beta.8, the user after asking about YouTube, 2026-10-19): a direct link to
 * a video file — on a site, in a cloud (Dropbox, Google Drive) — downloaded once into data/downloads/,
 * then a video of the list like any other file: it plays without the internet. A page instead of a
 * file, YouTube and Telegram are said in words (YouTube has «З YouTube…»; a Telegram video is saved
 * there and dropped as a file). One download at a time per address; it can be stopped.
 */
export const DOWNLOADS = 'downloads';
/** a video larger than this is not taken (a link to something else, or a disk filled by mistake) */
export const DOWNLOAD_LIMIT = 20 * 1024 ** 3;

export type DownloadRefusal = 'address' | 'youtube' | 'telegram';
export type DownloadFailure = 'page' | 'type' | 'size' | 'failed' | 'disk';

export interface DownloadJob {
  id: string;
  url: string;
  name: string;
  /** bytes so far, and of all (0: the server didn't say) */
  got: number;
  total: number;
  state: 'running' | 'done' | 'failed' | 'stopped';
  failure?: DownloadFailure;
  /** the server's answer when it failed (404 …) */
  status?: number;
  video?: Video;
}

export const downloadsDir = (dataDir: string) => path.join(dataDir, DOWNLOADS);

/** A file the app downloaded itself (it goes with its entry). */
export const isDownloaded = (dataDir: string, file: string) => {
  if (!file) return false;
  const rel = path.relative(downloadsDir(dataDir), file);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/**
 * The address to download: a cloud's share link turned into its file (Dropbox `dl=1`, Google Drive's
 * `uc?export=download`); YouTube and Telegram refused in words.
 */
export function downloadUrl(raw: string): URL | { refused: DownloadRefusal } {
  if (youtubeIdOf(raw)) return { refused: 'youtube' };
  const url = fetchableUrl(raw);
  if (!url) return { refused: 'address' };
  const host = url.hostname.replace(/^www\./, '');
  if (
    host === 't.me' ||
    host === 'telegram.me' ||
    host.endsWith('.t.me') ||
    host === 'web.telegram.org'
  )
    return { refused: 'telegram' };
  if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) {
    url.searchParams.delete('dl');
    url.searchParams.set('dl', '1');
  }
  const drive = /^\/file\/d\/([\w-]{10,})/.exec(url.pathname);
  if (host === 'drive.google.com' && drive)
    return new URL(`https://drive.google.com/uc?export=download&id=${drive[1]}`);
  return url;
}

/** The file's name: the server's Content-Disposition, else the address's last part; safe on any disk. */
export function downloadName(res: { headers: Headers; url: string }, fallback: URL): string {
  const cd = res.headers.get('content-disposition') ?? '';
  let name = '';
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(cd)?.[1];
  if (star) {
    try {
      name = decodeURIComponent(star.trim());
    } catch {
      // a broken escape: the plain one below
    }
  }
  if (!name) name = /filename\s*=\s*"?([^";]+)"?/.exec(cd)?.[1]?.trim() ?? '';
  if (!name) {
    const last = new URL(res.url || fallback.href).pathname.split('/').filter(Boolean).pop() ?? '';
    try {
      name = decodeURIComponent(last);
    } catch {
      name = last;
    }
  }
  name = [...name]
    .filter((c) => c.charCodeAt(0) >= 32 && !'\\/:*?"<>|'.includes(c))
    .join('')
    .trim()
    .normalize('NFC')
    .slice(0, 120)
    // Windows: no dot or space at a name's end, and no device names (CON, NUL, COM1 … — review)
    .replace(/[. ]+$/, '');
  const base = name.replace(/.[^.]*$/, '');
  if (/^(con|prn|aux|nul|comd|lptd)$/i.test(base)) name = `_${name}`;
  return name || 'video';
}

const TYPE_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/x-m4v': 'm4v',
};

/**
 * A name not taken in the folder — «name.mp4», «name (2).mp4», … — claimed at once (created empty, the
 * download then renamed over it): two downloads of one name never take the same file (review)
 */
async function claimName(dir: string, base: string, ext: string) {
  for (let i = 1; ; i++) {
    const file = path.join(dir, i === 1 ? `${base}.${ext}` : `${base} (${i}).${ext}`);
    try {
      await (await fsp.open(file, 'wx')).close();
      return file;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
}

export function createVideoDownloads(
  dataDir: string,
  opts: { fetchImpl?: typeof fetch; limit?: number; idleMs?: number } = {},
) {
  const get = opts.fetchImpl ?? fetch;
  const idleMs = opts.idleMs ?? 60_000;
  const limit = opts.limit ?? DOWNLOAD_LIMIT;
  const jobs = new Map<string, DownloadJob & { stop: AbortController }>();
  const runs = new Map<string, Promise<void>>();
  const view = (j: DownloadJob & { stop: AbortController }): DownloadJob => {
    const { stop: _stop, ...rest } = j;
    void _stop;
    return rest;
  };

  async function run(job: DownloadJob & { stop: AbortController }, url: URL) {
    const dir = downloadsDir(dataDir);
    // a server that goes quiet ends the download as failed, not as stopped by the operator (review)
    let quiet = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const awake = () => {
      clearTimeout(idle);
      idle = setTimeout(() => {
        quiet = true;
        job.stop.abort();
      }, idleMs);
    };
    awake();
    const part = path.join(dir, `.part-${job.id}`);
    const fail = async (failure: DownloadFailure, status?: number) => {
      await fsp.rm(part, { force: true }).catch(() => {});
      if (job.state === 'running') Object.assign(job, { state: 'failed', failure, status });
    };
    try {
      await fsp.mkdir(dir, { recursive: true });
      const res = await get(url.href, {
        signal: job.stop.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (VerseOrchestrator)', Accept: 'video/*,*/*;q=0.8' },
      });
      if (!res.ok) return fail('failed', res.status);
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (type === 'text/html') {
        await res.body?.cancel().catch(() => {});
        return fail('page');
      }
      job.total = Number(res.headers.get('content-length') ?? 0) || 0;
      if (job.total > limit) {
        await res.body?.cancel().catch(() => {});
        return fail('size');
      }
      const name = downloadName(res, url);
      job.name = name.replace(/\.[^.]{1,5}$/, '') || name;
      const fromName = /\.([a-z0-9]{2,4})$/i.exec(name)?.[1]?.toLowerCase();
      const out = fs.createWriteStream(part);
      // closed before its file is removed: a stream still opening would make the file again (a test found it)
      const close = () =>
        new Promise<void>((done) => {
          out.once('close', () => done());
          out.destroy();
        });
      const reader = res.body?.getReader();
      if (!reader) {
        await close();
        return fail('failed');
      }
      let head: Uint8Array | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        awake();
        if (!head) {
          const first = value.subarray(0, 64);
          head = first;
          // the first bytes say: not a video (a page, a picture, an archive) — no point downloading on
          if (!sniffVideo(first)) {
            await reader.cancel().catch(() => {});
            await close();
            return fail('type');
          }
        }
        job.got += value.byteLength;
        if (job.got > limit) {
          await reader.cancel().catch(() => {});
          await close();
          return fail('size');
        }
        if (!out.write(value)) await new Promise((r) => out.once('drain', r));
      }
      await new Promise<void>((resolve, reject) =>
        out.end((e?: Error | null) => (e ? reject(e) : resolve())),
      );
      if (!head) return fail('type');
      const kind = sniffVideo(head)!;
      const ext =
        fromName && VIDEO_EXTS.includes(fromName)
          ? fromName
          : (TYPE_EXT[type] ?? (kind === 'mov' ? 'mov' : kind));
      const file = await claimName(
        dir,
        job.name.slice(0, 100).replace(/[. ]+$/, '') || 'video',
        ext,
      );
      await fsp.rename(part, file);
      const added = await addVideo(dataDir, { path: file, name: job.name });
      if ('refused' in added) {
        await fsp.rm(file, { force: true }).catch(() => {});
        return fail('type');
      }
      job.video = added;
      job.state = 'done';
    } catch (e) {
      if (quiet) return fail('failed');
      if (job.stop.signal.aborted) {
        await fsp.rm(part, { force: true }).catch(() => {});
        job.state = 'stopped';
        return;
      }
      const code = (e as NodeJS.ErrnoException)?.code;
      return fail(code === 'ENOSPC' ? 'disk' : 'failed');
    } finally {
      clearTimeout(idle);
    }
  }

  return {
    /** Start a download (the same address, while it runs, is the same job). */
    start(raw: string): DownloadJob | { refused: DownloadRefusal } {
      const url = downloadUrl(raw);
      if ('refused' in url) return url;
      for (const j of jobs.values())
        if (j.url === url.href && j.state === 'running') return view(j);
      const job = {
        id: crypto.randomUUID(),
        url: url.href,
        name: '',
        got: 0,
        total: 0,
        state: 'running' as const,
        stop: new AbortController(),
      } as DownloadJob & { stop: AbortController };
      jobs.set(job.id, job);
      runs.set(job.id, run(job, url));
      return view(job);
    },
    get(id: string): DownloadJob | null {
      const j = jobs.get(id);
      return j ? view(j) : null;
    },
    /** A download's end (the tests wait for it). */
    settled: (id: string) => runs.get(id) ?? Promise.resolve(),
    stop(id: string): DownloadJob | null {
      const j = jobs.get(id);
      if (!j) return null;
      if (j.state === 'running') j.stop.abort();
      return view(j);
    },
  };
}
