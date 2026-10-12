import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { diskParts, oldBackups, removeAll, sizeOf } from './diskSpace.js';

let root = '';
afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
});
const put = (file: string, bytes: number) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.alloc(bytes));
};

describe('«Місце на диску»', () => {
  it('lists each part with its size; the trashes and old backups apart, the rest as «other»', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-disk-'));
    const data = path.join(root, 'data');
    const modules = path.join(root, 'modules');
    put(path.join(root, 'app', 'a.js'), 100);
    put(path.join(root, 'app.previous', 'a.js'), 90);
    put(path.join(data, 'library.db'), 1000);
    put(path.join(data, 'vectors.db'), 300);
    put(path.join(data, 'vectors.db-wal'), 20);
    put(path.join(data, 'models', 'fast', 'model.onnx'), 500);
    put(path.join(data, 'album-cache', 'x', '1.jpg'), 40);
    put(path.join(data, 'images', 'a.png'), 60);
    put(path.join(data, 'images', '.trash', 'b.png'), 30);
    put(path.join(data, 'backups', 'auto', 'auto-daily-2026-10-11-1.zip'), 10);
    put(path.join(data, 'backups', 'auto', 'auto-daily-2026-10-12-1.zip'), 11);
    put(path.join(data, 'backups', 'auto', 'auto-update-2026-10-01-1.zip'), 12);
    put(path.join(data, 'backups', 'before-restore-2026-10-01', 'x'), 13);
    put(path.join(data, 'backups', 'before-restore-2026-10-05', 'x'), 14);
    put(path.join(data, 'backups', 'pending.zip'), 15);
    put(path.join(data, 'settings.json'), 7);
    put(path.join(modules, 'KJV.SQLite3'), 2000);
    put(path.join(modules, 'documents', 'a.md'), 5);
    put(path.join(modules, 'documents', '.trash', '1-b.md'), 3);
    const parts = await diskParts({
      dataDir: data,
      modulesDir: modules,
      documentsDir: path.join(modules, 'documents'),
      libraryPath: path.join(data, 'library.db'),
      top: root,
    });
    const by = Object.fromEntries(parts.map((p) => [`${p.id}${p.sub ? `:${p.sub}` : ''}`, p]));
    expect(by.app.bytes).toBe(100);
    expect(by.previous).toMatchObject({ bytes: 90, removable: true });
    expect(by.library).toMatchObject({ bytes: 1000, removable: false });
    expect(by.vectors.bytes).toBe(320);
    expect(by['models:fast']).toMatchObject({ bytes: 500, removable: true });
    expect(by['album-cache'].bytes).toBe(40);
    expect(by.images.bytes).toBe(60);
    expect(by['images-trash'].bytes).toBe(30);
    expect(by.modules.bytes).toBe(2005);
    expect(by['documents-trash'].bytes).toBe(3);
    // the older daily copy only: the newest of each kind, an update's only copy, the states kept
    // before a restore (they hold the moved songs and pictures) and the pending undo stay
    expect(by['backups-old'].bytes).toBe(10);
    expect(by.backups.bytes).toBe(11 + 12 + 13 + 14 + 15);
    expect(by['data-other'].bytes).toBe(7);
  });

  it('old backups and removal: what goes is freed, the rest stays', async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-disk-'));
    const b = path.join(root, 'backups');
    put(path.join(b, 'auto', 'auto-daily-2026-10-11-1.zip'), 10);
    put(path.join(b, 'auto', 'auto-daily-2026-10-12-1.zip'), 11);
    put(path.join(b, 'before-undo-2026-10-01', 'x'), 5);
    const old = await oldBackups(b);
    expect(old.map((p) => path.basename(p))).toEqual(['auto-daily-2026-10-11-1.zip']);
    expect(await removeAll([...old, path.join(root, 'none')])).toBe(10);
    expect(await sizeOf(b)).toBe(16);
  });
});
