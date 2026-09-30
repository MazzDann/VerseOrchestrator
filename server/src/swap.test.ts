import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyTopFiles, rollbackFolders, swapFolders } from './swap';

const temps: string[] = [];
afterEach(() => {
  for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A release folder with the given app folders, each holding its version. */
function release(folders: Record<string, string>): string {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-swap-'));
  temps.push(top);
  for (const [dir, version] of Object.entries(folders)) {
    fs.mkdirSync(path.join(top, dir));
    fs.writeFileSync(path.join(top, dir, 'version'), version);
  }
  return top;
}
const versionIn = (top: string, dir: string) =>
  fs.existsSync(path.join(top, dir))
    ? fs.readFileSync(path.join(top, dir, 'version'), 'utf8')
    : null;

describe('the update swap (1.0.0)', () => {
  it('puts the new app in place and keeps the old one as app.previous', async () => {
    const top = release({ app: '1.0.0', 'app.next': '1.0.1', 'app.previous': '0.14.2' });
    await swapFolders(top);
    expect(versionIn(top, 'app')).toBe('1.0.1');
    expect(versionIn(top, 'app.previous')).toBe('1.0.0');
    expect(versionIn(top, 'app.next')).toBeNull();
  });

  it('leaves the old app in place when there is nothing to swap in', async () => {
    const top = release({ app: '1.0.0' });
    await expect(swapFolders(top)).rejects.toThrow();
    expect(versionIn(top, 'app')).toBe('1.0.0');
  });

  it('rolls back: the failed app aside, the previous one back', async () => {
    const top = release({ app: '1.0.1', 'app.previous': '1.0.0' });
    await rollbackFolders(top);
    expect(versionIn(top, 'app')).toBe('1.0.0');
    expect(versionIn(top, 'app.failed')).toBe('1.0.1');
  });

  it('replaces the release’s top files, not its folders', () => {
    const top = release({ app: '1.0.1', data: 'mine' });
    const from = release({ data: 'theirs' });
    fs.writeFileSync(path.join(top, 'start.sh'), 'old');
    fs.writeFileSync(path.join(from, 'start.sh'), 'new');
    fs.writeFileSync(path.join(from, 'HOW TO START.txt'), 'notes');
    copyTopFiles(from, top);
    expect(fs.readFileSync(path.join(top, 'start.sh'), 'utf8')).toBe('new');
    expect(fs.readFileSync(path.join(top, 'HOW TO START.txt'), 'utf8')).toBe('notes');
    expect(versionIn(top, 'data')).toBe('mine');
  });
});
