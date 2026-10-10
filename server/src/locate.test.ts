import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { locateFile, locateFolder, seenFiles, usualRoots } from './locate';

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-locate-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const put = (file: string, bytes: number) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.alloc(bytes));
};

describe('a dropped folder or video found on disk (1.14.0-beta.1, the author’s Q14)', () => {
  it('a folder by its name and its files’ sizes, a few levels down', async () => {
    const home = tmp();
    put(path.join(home, 'Pictures', '2025', 'Табір', 'a.jpg'), 10);
    put(path.join(home, 'Pictures', '2025', 'Табір', 'b.jpg'), 20);
    // the same name with other files: not it
    put(path.join(home, 'Desktop', 'Табір', 'a.jpg'), 11);
    const roots = usualRoots(home);
    const seen = [
      { name: 'a.jpg', size: 10 },
      { name: 'b.jpg', size: 20 },
    ];
    expect(await locateFolder('Табір', seen, roots)).toEqual([
      path.join(home, 'Pictures', '2025', 'Табір'),
    ]);
    expect(await locateFolder('Нема', seen, roots)).toEqual([]);
  });

  it('a video by its name and size', async () => {
    const home = tmp();
    put(path.join(home, 'Videos', 'Вітання.mp4'), 64);
    put(path.join(home, 'Downloads', 'Вітання.mp4'), 65);
    expect(await locateFile({ name: 'Вітання.mp4', size: 64 }, usualRoots(home))).toEqual([
      path.join(home, 'Videos', 'Вітання.mp4'),
    ]);
  });

  it('stops at its time limit', async () => {
    const home = tmp();
    put(path.join(home, 'Pictures', 'x', 'a.jpg'), 1);
    expect(await locateFolder('x', [{ name: 'a.jpg', size: 1 }], usualRoots(home), -1)).toEqual([]);
  });

  it('takes names without folders and whole sizes only', () => {
    expect(seenFiles([{ name: 'a.jpg', size: 3 }])).toEqual([{ name: 'a.jpg', size: 3 }]);
    expect(seenFiles([{ name: '../a.jpg', size: 3 }])).toBeNull();
    expect(seenFiles([{ name: 'a.jpg', size: -1 }])).toBeNull();
    expect(seenFiles('x')).toBeNull();
  });
});
