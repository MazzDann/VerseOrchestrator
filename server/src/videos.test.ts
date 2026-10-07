import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/** A disk that doesn't tell «a.mp4» from «A.MP4» (a Mac's APFS by default, NTFS) — not Linux's. */
const caseBlind = fs.existsSync(os.tmpdir().toUpperCase());
/** A folder link: a junction needs no rights on Windows; a Mac's /var is itself a link. */
const linkType = process.platform === 'win32' ? 'junction' : 'dir';
/** A folder link can be made here — probed once, like caseBlind, so a test without one says so. */
const canLink = (() => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-videos-link-'));
  try {
    fs.mkdirSync(path.join(d, 'a'));
    fs.symlinkSync(path.join(d, 'a'), path.join(d, 'b'), linkType);
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
})();
/** A file can be closed to this process with chmod 000: not on Windows, not as root (albums.test). */
const canClose = process.platform !== 'win32' && process.getuid?.() !== 0;
/** A path the other system wrote: a Windows drive here, a Mac's folder on Windows. */
const FAR = process.platform === 'win32' ? '/Volumes/Відео/Різдво.mp4' : 'D:\\Відео\\Різдво.mp4';

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
    // as pasted (Mac check of 1.9.0): in quotes, as a file:// URL — the same video
    expect(await addVideo(data, { path: `"${path.join(dir, 'Різдво 2025.mp4')}"` })).toEqual(v);
    const url = pathToFileURL(path.join(dir, 'Різдво 2025.mp4')).href;
    expect(await addVideo(data, { path: url })).toEqual(v);
    expect(readVideos(data)).toEqual([v]);
  });

  it.skipIf(process.platform === 'win32')(
    'takes a listed file’s path as it is: «a\\ b.mp4», «Різдво .mp4» (review)',
    async () => {
      const { dir, data } = folder({ 'a\\ b.mp4': MP4, 'Різдво .mp4': MP4 });
      const escaped = await added(data, path.join(dir, 'a\\ b.mp4'));
      expect(escaped.path).toBe(path.join(dir, 'a\\ b.mp4'));
      expect((await added(data, path.join(dir, 'Різдво .mp4'))).path).toBe(
        path.join(dir, 'Різдво .mp4'),
      );
      expect(readVideos(data)).toHaveLength(2);
    },
  );

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

  it.skipIf(!canClose)(
    'says a file the system won’t open is refused (missing here, `denied` says why) — and serves nothing (Mac check of 1.9.0)',
    async () => {
      const { dir, data } = folder({ 'a.mp4': MP4, 'b.mp4': MP4 });
      const file = path.join(dir, 'a.mp4');
      const v = await added(data, file);
      fs.chmodSync(file, 0o000);
      try {
        // still `missing`: every guard that keeps a missing video off the screen keeps it off
        expect(await videoEntry(data, v)).toMatchObject({
          missing: true,
          denied: true,
          size: 0,
          hasPoster: false,
        });
        expect(await videoFile(file)).toBeNull();
        expect(await posterFile(data, v)).toBeNull();
        expect(await putPoster(data, v, '1-1', JPG)).toEqual({ refused: 'video' });
        // refused as such — not «not a video»
        expect(await addVideo(data, { path: file })).toEqual({ refused: 'denied' });
        // a folder the system won't open: the system won't say what is in it either
        fs.chmodSync(dir, 0o000);
        expect(await addVideo(data, { path: path.join(dir, 'b.mp4') })).toEqual({
          refused: 'denied',
        });
        expect(await videoEntry(data, v)).toMatchObject({ missing: true, denied: true });
      } finally {
        fs.chmodSync(dir, 0o755);
        fs.chmodSync(file, 0o644);
      }
      expect(await videoEntry(data, v)).toMatchObject({
        missing: false,
        denied: false,
        size: MP4.length,
      });
    },
  );

  it('keeps videos another system added: written back as they are, never read, removable (Mac check of 1.9.0)', async () => {
    const { dir, data } = folder({ 'a.mp4': MP4, 'b.mp4': MP4 });
    const theirs: Video = {
      id: crypto.randomUUID(),
      name: 'Різдво',
      path: FAR,
      added: '2026-10-01T10:00:00.000Z',
    };
    fs.mkdirSync(data, { recursive: true });
    fs.writeFileSync(path.join(data, 'videos.json'), JSON.stringify({ videos: [theirs] }));
    expect(readVideos(data)).toEqual([theirs]);
    // the adds write the file again: theirs stays — and its real path is never asked of the disk
    const realpath = vi.spyOn(fsp, 'realpath');
    let asked: unknown[];
    let mine: Video;
    try {
      mine = await added(data, path.join(dir, 'a.mp4'));
      const other = await added(data, path.join(dir, 'b.mp4'));
      expect((await removeVideo(data, other.id))?.id).toBe(other.id);
    } finally {
      asked = realpath.mock.calls.map(([p]) => p);
      realpath.mockRestore();
    }
    expect(asked).toContain(path.join(dir, 'a.mp4'));
    expect(asked).not.toContain(FAR);
    expect(readVideos(data)).toEqual([theirs, mine]);
    // shown as not here — and never opened (on a Mac `D:\Відео\…` is a relative name)
    const open = vi.spyOn(fsp, 'open');
    try {
      expect(await videoFile(FAR)).toBeNull();
      expect(await posterFile(data, theirs)).toBeNull();
      expect(await putPoster(data, theirs, '1-1', JPG)).toEqual({ refused: 'video' });
      expect(await videoEntry(data, theirs)).toMatchObject({
        missing: true,
        elsewhere: true,
        hasPoster: false,
      });
      expect(open).not.toHaveBeenCalled();
    } finally {
      open.mockRestore();
    }
    expect(await videoEntry(data, mine)).toMatchObject({ missing: false, elsewhere: false });
    expect((await removeVideo(data, theirs.id))?.path).toBe(FAR);
    expect(readVideos(data)).toEqual([mine]);
  });

  it.skipIf(!canLink)(
    'a file reached through a link is the video it already is (Mac check of 1.9.0)',
    async () => {
      const { root, dir, data } = folder({ 'a.mp4': MP4 });
      const v = await added(data, path.join(dir, 'a.mp4'));
      // a Mac's temporary folder is under /var, a link to /private/var
      expect(await addVideo(data, { path: fs.realpathSync(path.join(dir, 'a.mp4')) })).toEqual(v);
      fs.symlinkSync(dir, path.join(root, 'link'), linkType);
      expect(await addVideo(data, { path: path.join(root, 'link', 'a.mp4') })).toEqual(v);
      expect(readVideos(data)).toEqual([v]);
    },
  );

  it.skipIf(!caseBlind)(
    'a file in another case is the video it already is (Mac check of 1.9.0)',
    async () => {
      const { dir, data } = folder({ 'a.mp4': MP4 });
      const v = await added(data, path.join(dir, 'a.mp4'));
      expect(await addVideo(data, { path: path.join(dir, 'A.MP4') })).toEqual(v);
      expect(readVideos(data)).toEqual([v]);
    },
  );

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
