import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addYouTube, readVideos, videoEntry, youtubeIdOf } from './videos';
import { youtubeTitle } from './youtube';

const dirs: string[] = [];
const dataDir = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-yt-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('YouTube in «Відео» (1.19.0-beta.6, F1017-06)', () => {
  it('finds the id in every kind of address', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://youtube.com/watch?v=aqz-KE-bpKQ&t=30s&list=PL1',
      'youtube.com/watch?v=aqz-KE-bpKQ',
      'https://m.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://music.youtube.com/watch?v=aqz-KE-bpKQ',
      'https://youtu.be/aqz-KE-bpKQ?si=abc',
      'https://www.youtube.com/shorts/aqz-KE-bpKQ',
      'https://www.youtube.com/embed/aqz-KE-bpKQ',
      'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
      'https://www.youtube.com/live/aqz-KE-bpKQ',
      '  aqz-KE-bpKQ ',
    ])
      expect(youtubeIdOf(url), url).toBe('aqz-KE-bpKQ');
    for (const url of [
      'https://vimeo.com/123',
      'https://www.youtube.com/watch?v=short',
      'https://www.youtube.com/channel/UC123',
      'https://evil.example/watch?v=aqz-KE-bpKQ',
      'not an address',
      '',
    ])
      expect(youtubeIdOf(url), url).toBeNull();
  });
  it('keeps one entry per video, with its length, no file', async () => {
    const d = dataDir();
    const a = addYouTube(d, {
      youtube: 'aqz-KE-bpKQ',
      name: '  Big   Buck Bunny ',
      duration: 634.5,
    });
    const again = addYouTube(d, { youtube: 'aqz-KE-bpKQ', name: 'other', duration: 1 });
    expect(again.id).toBe(a.id);
    expect(readVideos(d)).toHaveLength(1);
    expect(a).toMatchObject({
      name: 'Big Buck Bunny',
      path: '',
      youtube: 'aqz-KE-bpKQ',
      duration: 634.5,
    });
    const e = await videoEntry(d, a);
    expect(e).toMatchObject({
      missing: false,
      src: '',
      youtube: 'aqz-KE-bpKQ',
      duration: 634.5,
      hasPoster: true,
      poster: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg',
    });
    // a length that makes no sense is «unknown»
    expect(
      addYouTube(d, { youtube: 'bbbbbbbbbbb', name: 'x', duration: -3 }).duration,
    ).toBeUndefined();
    expect(addYouTube(d, { youtube: 'ccccccccccc', name: '', duration: 'x' }).name).toBe('YouTube');
  });
  it('a YouTube entry with a path, or a bad id, is not a video of the list', () => {
    const d = dataDir();
    const base = { name: 'x', added: new Date().toISOString() };
    fs.writeFileSync(
      path.join(d, 'videos.json'),
      JSON.stringify({
        videos: [
          { id: '11111111-1111-4111-8111-111111111111', path: '', youtube: 'aqz-KE-bpKQ', ...base },
          { id: '22222222-2222-4222-8222-222222222222', path: '', youtube: 'bad', ...base },
          {
            id: '33333333-3333-4333-8333-333333333333',
            path: '/x.mp4',
            youtube: 'aqz-KE-bpKQ',
            ...base,
          },
          { id: '44444444-4444-4444-8444-444444444444', path: '', ...base },
        ],
      }),
    );
    expect(readVideos(d).map((v) => v.id)).toEqual(['11111111-1111-4111-8111-111111111111']);
  });
  it('asks YouTube for the title and whether it may be shown here', async () => {
    const answer =
      (status: number, body: unknown = {}) =>
      async () =>
        new Response(JSON.stringify(body), { status });
    expect(
      await youtubeTitle('aqz-KE-bpKQ', { fetchImpl: answer(200, { title: 'Big Buck Bunny' }) }),
    ).toEqual({
      title: 'Big Buck Bunny',
    });
    expect(await youtubeTitle('aqz-KE-bpKQ', { fetchImpl: answer(401) })).toEqual({
      refused: 'embed',
    });
    expect(await youtubeTitle('aqz-KE-bpKQ', { fetchImpl: answer(404) })).toEqual({
      refused: 'missing',
    });
    expect(await youtubeTitle('aqz-KE-bpKQ', { fetchImpl: answer(500) })).toEqual({
      refused: 'failed',
    });
    const down = async () => {
      throw new Error('offline');
    };
    expect(await youtubeTitle('aqz-KE-bpKQ', { fetchImpl: down })).toEqual({ refused: 'failed' });
  });
});
