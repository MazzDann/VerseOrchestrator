import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createVideoDownloads, downloadName, downloadUrl, downloadsDir } from './videoDownload';
import { readVideos, removeVideo, videoEntry } from './videos';

const dirs: string[] = [];
const dataDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-dl-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** an MP4's first bytes (ftyp isom) and then some */
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypisom'),
  Buffer.from([0, 0, 2, 0]),
  Buffer.from('isomiso2'),
  Buffer.alloc(4000, 7),
]);
/** a server: each address its answer, the body in chunks */
const site =
  (
    pages: Record<
      string,
      { type?: string; body: Buffer | string; status?: number; headers?: Record<string, string> }
    >,
  ) =>
  async (url: string | URL | Request): Promise<Response> => {
    const href = String(url);
    const p = pages[href];
    if (!p) return new Response('no', { status: 404 });
    const body = Buffer.from(p.body);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < body.length; i += 1000)
          c.enqueue(new Uint8Array(body.subarray(i, i + 1000)));
        c.close();
      },
    });
    const res = new Response(stream, {
      status: p.status ?? 200,
      headers: {
        'content-type': p.type ?? 'video/mp4',
        'content-length': String(body.length),
        ...p.headers,
      },
    });
    Object.defineProperty(res, 'url', { value: href });
    return res;
  };

describe('«Відео за посиланням» (1.19.0-beta.8)', () => {
  it('a server gone quiet ends the download as failed, and Windows names are safe', async () => {
    const d = dataDir();
    const stall = async (_u: string | URL | Request, init?: RequestInit) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new Uint8Array(MP4.subarray(0, 1000)));
            init?.signal?.addEventListener('abort', () => c.error(new Error('aborted')));
          },
        }),
        { headers: { 'content-type': 'video/mp4' } },
      );
    const dl = createVideoDownloads(d, { fetchImpl: stall as typeof fetch, idleMs: 200 });
    const job = dl.start('https://x.org/stall.mp4');
    if ('refused' in job) throw new Error('refused');
    await dl.settled(job.id);
    expect(dl.get(job.id)).toMatchObject({ state: 'failed', failure: 'failed' });
    expect(fs.readdirSync(downloadsDir(d))).toEqual([]);
    const at = new URL('https://x.org/a');
    const res = (cd: string) => ({
      headers: new Headers({ 'content-disposition': cd }),
      url: at.href,
    });
    expect(downloadName(res('attachment; filename="CON.mp4"'), at)).toBe('_CON.mp4');
    expect(downloadName(res('attachment; filename="talk. "'), at)).toBe('talk');
    expect(downloadName(res('attachment; filename="COM1.webm"'), at)).toBe('_COM1.webm');
    expect(downloadName(res('attachment; filename="nul"'), at)).toBe('_nul');
  });
  it('turns share links into files and refuses YouTube and Telegram', () => {
    expect(String(downloadUrl('https://www.dropbox.com/s/abc/talk.mp4?dl=0'))).toBe(
      'https://www.dropbox.com/s/abc/talk.mp4?dl=1',
    );
    expect(
      String(downloadUrl('https://drive.google.com/file/d/1AbCdEfGhIjK/view?usp=sharing')),
    ).toBe('https://drive.google.com/uc?export=download&id=1AbCdEfGhIjK');
    expect(downloadUrl('https://youtu.be/aqz-KE-bpKQ')).toEqual({ refused: 'youtube' });
    expect(downloadUrl('https://t.me/channel/123')).toEqual({ refused: 'telegram' });
    expect(downloadUrl('ftp://x.org/a.mp4')).toEqual({ refused: 'address' });
  });
  it('names the file by the server, else by the address', () => {
    const res = (cd: string, url = 'https://x.org/v/clip.mp4') => ({
      headers: new Headers(cd ? { 'content-disposition': cd } : {}),
      url,
    });
    const at = new URL('https://x.org/v/clip.mp4');
    expect(
      downloadName(
        res(
          `attachment; filename*=UTF-8''%D0%9F%D1%80%D0%BE%D0%BF%D0%BE%D0%B2%D1%96%D0%B4%D1%8C.mp4`,
        ),
        at,
      ),
    ).toBe('Проповідь.mp4');
    expect(downloadName(res('attachment; filename="a:b?.mp4"'), at)).toBe('ab.mp4');
    expect(downloadName(res(''), at)).toBe('clip.mp4');
  });
  it('downloads a video into data/downloads/, adds it, and its file goes with it', async () => {
    const d = dataDir();
    const dl = createVideoDownloads(d, {
      fetchImpl: site({ 'https://x.org/v/clip.mp4': { body: MP4 } }),
    });
    const job = dl.start('https://x.org/v/clip.mp4');
    if ('refused' in job) throw new Error('refused');
    await dl.settled(job.id);
    const done = dl.get(job.id)!;
    expect(done).toMatchObject({ state: 'done', got: MP4.length, total: MP4.length, name: 'clip' });
    const file = path.join(downloadsDir(d), 'clip.mp4');
    expect(fs.readFileSync(file).equals(MP4)).toBe(true);
    const [video] = readVideos(d);
    expect(video).toMatchObject({ name: 'clip', path: file });
    expect(await videoEntry(d, video)).toMatchObject({ downloaded: true });
    // the same name again: «clip (2).mp4»
    const again = dl.start('https://x.org/v/clip.mp4');
    if ('refused' in again) throw new Error('refused');
    await dl.settled(again.id);
    expect(fs.existsSync(path.join(downloadsDir(d), 'clip (2).mp4'))).toBe(true);
    await removeVideo(d, video.id);
    expect(fs.existsSync(file)).toBe(false);
  });
  it('a page, not a video, too big, or gone: failed in words, nothing left behind', async () => {
    const d = dataDir();
    const dl = createVideoDownloads(d, {
      limit: 2000,
      fetchImpl: site({
        'https://x.org/page': { type: 'text/html', body: '<html>' },
        'https://x.org/zip.mp4': { type: 'application/octet-stream', body: Buffer.alloc(1500, 1) },
        'https://x.org/big.mp4': { body: MP4 },
        'https://x.org/gone.mp4': { body: '', status: 410 },
      }),
    });
    const outcome = async (u: string) => {
      const j = dl.start(u);
      if ('refused' in j) return j;
      await dl.settled(j.id);
      const { failure, status, state } = dl.get(j.id)!;
      return { state, failure, status };
    };
    expect(await outcome('https://x.org/page')).toMatchObject({ state: 'failed', failure: 'page' });
    expect(await outcome('https://x.org/zip.mp4')).toMatchObject({
      state: 'failed',
      failure: 'type',
    });
    expect(await outcome('https://x.org/big.mp4')).toMatchObject({
      state: 'failed',
      failure: 'size',
    });
    expect(await outcome('https://x.org/gone.mp4')).toMatchObject({
      state: 'failed',
      failure: 'failed',
      status: 410,
    });
    expect(fs.readdirSync(downloadsDir(d))).toEqual([]);
    expect(readVideos(d)).toEqual([]);
  });
});
