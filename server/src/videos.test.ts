import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addVideo,
  listVideoFiles,
  posterFile,
  putPoster,
  readVideos,
  removeVideo,
  sniffVideo,
  videoEntry,
  videoFile,
  type Video,
} from './videos';

const box = (major: string) => {
  const brands = Buffer.from(major + '\0\0\0\0isomavc1', 'latin1');
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + brands.length);
  return Buffer.concat([size, Buffer.from('ftyp'), brands, Buffer.alloc(64)]);
};
const MP4 = box('isom');
const MOV = box('qt  ');
const HEIC = box('heic');
const ebml = (doc: string) =>
  Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]),
    Buffer.from(doc),
    Buffer.alloc(32),
  ]);
const WEBM = ebml('webm');
const MKV = ebml('matroska');
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-videos-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function folder(files: Record<string, Buffer>) {
  const root = tmp();
  const dir = path.join(root, 'Відео');
  fs.mkdirSync(dir);
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), data);
  return { root, dir, data: path.join(root, 'data') };
}
const added = async (data: string, file: string) => {
  const v = await addVideo(data, { path: file });
  if ('refused' in v) throw new Error(v.refused);
  return v;
};

describe('video files (1.8.12-beta.3)', () => {
  it('tells MP4, MOV, WebM and MKV by their first bytes — never a HEIC photo or anything else', () => {
    expect(sniffVideo(MP4)).toBe('mp4');
    expect(sniffVideo(MOV)).toBe('mov');
    expect(sniffVideo(WEBM)).toBe('webm');
    expect(sniffVideo(MKV)).toBe('mkv');
    expect(sniffVideo(HEIC)).toBeNull();
    expect(sniffVideo(JPG)).toBeNull();
    expect(sniffVideo(Buffer.from('RIFF....AVI LIST'))).toBeNull();
  });

  it('adds a file once, by its path, named after it; refuses what is not a video here', async () => {
    const { dir, data } = folder({ 'Різдво 2025.mp4': MP4, 'fake.mp4': JPG, 'clip.webm': WEBM });
    const v = await added(data, path.join(dir, 'Різдво 2025.mp4'));
    expect(v.name).toBe('Різдво 2025');
    expect(await addVideo(data, { path: path.join(dir, 'Різдво 2025.mp4') })).toEqual(v);
    expect(await addVideo(data, { path: path.join(dir, 'fake.mp4') })).toEqual({ refused: 'type' });
    expect(await addVideo(data, { path: path.join(dir, 'gone.mp4') })).toEqual({
      refused: 'missing',
    });
    expect(await addVideo(data, { path: dir })).toEqual({ refused: 'missing' });
    expect(await addVideo(data, { path: 'clip.webm' })).toEqual({ refused: 'path' });
    expect(readVideos(data)).toEqual([v]);
  });

  it('serves a file typed by its bytes: a MOV and an MKV as the containers browsers play', async () => {
    const { dir } = folder({ 'a.mov': MOV, 'b.mkv': MKV, 'c.mp4': MP4 });
    expect(await videoFile(path.join(dir, 'a.mov'))).toMatchObject({
      kind: 'mov',
      type: 'video/mp4',
    });
    expect(await videoFile(path.join(dir, 'b.mkv'))).toMatchObject({
      kind: 'mkv',
      type: 'video/webm',
    });
    expect((await videoFile(path.join(dir, 'c.mp4')))?.size).toBe(MP4.length);
    expect(await videoFile(dir)).toBeNull();
  });

  it('a poster per version of the file; a file changed meanwhile gets none; removed with the video', async () => {
    const { dir, data } = folder({ 'a.mp4': MP4 });
    const v: Video = await added(data, path.join(dir, 'a.mp4'));
    const e1 = await videoEntry(data, v);
    expect(e1).toMatchObject({ missing: false, hasPoster: false, src: `/api/videos/${v.id}/file` });
    expect(await posterFile(data, v)).toBeNull();
    expect(await putPoster(data, v, e1.v!, JPG)).toEqual({ bytes: JPG.length });
    expect((await videoEntry(data, v)).hasPoster).toBe(true);
    expect(await posterFile(data, v)).toMatch(/video-cache/);
    // the file replaced (another size): its old poster is not its frame
    fs.writeFileSync(path.join(dir, 'a.mp4'), Buffer.concat([MP4, Buffer.alloc(10)]));
    expect(await posterFile(data, v)).toBeNull();
    expect(await putPoster(data, v, e1.v!, JPG)).toEqual({ refused: 'changed' });
    const e2 = await videoEntry(data, v);
    expect(await putPoster(data, v, e2.v!, Buffer.from('<svg/>'))).toEqual({ refused: 'type' });
    expect(await putPoster(data, v, e2.v!, JPG)).toEqual({ bytes: JPG.length });
    expect(fs.readdirSync(path.join(data, 'video-cache'))).toHaveLength(1);
    expect((await removeVideo(data, v.id))?.id).toBe(v.id);
    expect(fs.readdirSync(path.join(data, 'video-cache'))).toHaveLength(0);
    expect(fs.existsSync(path.join(dir, 'a.mp4'))).toBe(true);
    expect(await removeVideo(data, v.id)).toBeNull();
  });

  it('says a file that went away is missing', async () => {
    const { dir, data } = folder({ 'a.mp4': MP4 });
    const v = await added(data, path.join(dir, 'a.mp4'));
    fs.rmSync(path.join(dir, 'a.mp4'));
    expect(await videoEntry(data, v)).toMatchObject({ missing: true, size: 0, hasPoster: false });
    expect(await putPoster(data, v, '1-1', JPG)).toEqual({ refused: 'video' });
  });

  it('lists a folder’s video files in name order and counts the ones browsers can’t play', async () => {
    const { dir } = folder({
      'Кліп 10.mp4': MP4,
      'Кліп 2.webm': WEBM,
      'old.avi': Buffer.from('RIFF'),
      '.hidden.mp4': MP4,
      'photo.jpg': JPG,
    });
    const r = await listVideoFiles(dir);
    expect(r.videos.map((v) => v.name)).toEqual(['Кліп 2.webm', 'Кліп 10.mp4']);
    expect(r.videos[1]).toMatchObject({ path: path.join(dir, 'Кліп 10.mp4'), size: MP4.length });
    expect(r.unplayable).toBe(1);
    expect(await listVideoFiles(path.join(dir, 'gone'))).toEqual({ videos: [], unplayable: 0 });
  });
});
