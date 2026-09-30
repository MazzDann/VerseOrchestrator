import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LAYOUT_MARKER, RELEASE_MARKER } from './layout';
import { needsBuild, uiStamp } from './standby';

const temps: string[] = [];
afterEach(() => {
  for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A clone with a built UI stamped as buildUi stamps it. */
function clone(version = '1.0.0'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-stamp-'));
  temps.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version }));
  fs.mkdirSync(path.join(root, 'web', 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'web', 'dist'));
  fs.writeFileSync(path.join(root, 'web', 'src', 'main.tsx'), 'one');
  fs.writeFileSync(path.join(root, 'web', 'dist', 'index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(root, 'web', 'dist', '.vo-version'), uiStamp(root));
  return root;
}

describe('is the UI build up to date? (1.0.0)', () => {
  it('in a clone: rebuilt when the sources change, even without a new version', () => {
    const root = clone();
    expect(uiStamp(root)).toMatch(/^1\.0\.0\+[0-9a-f]{12}$/);
    expect(needsBuild(root)).toBe(false);
    fs.writeFileSync(path.join(root, 'web', 'src', 'main.tsx'), 'two'); // a git pull
    expect(needsBuild(root)).toBe(true);
    fs.writeFileSync(path.join(root, 'web', 'src', 'main.tsx'), 'one');
    expect(needsBuild(root)).toBe(false);
    fs.rmSync(path.join(root, 'web', 'dist', 'index.html'));
    expect(needsBuild(root)).toBe(true);
  });

  it('in a release: its build stands for its version (it can’t rebuild anyway)', () => {
    const root = clone();
    fs.writeFileSync(path.join(root, LAYOUT_MARKER), JSON.stringify(RELEASE_MARKER));
    // stamped in the clone the release came from; the release's own files differ in time and set
    fs.writeFileSync(path.join(root, 'web', 'src', 'main.tsx'), 'changed');
    expect(uiStamp(root)).toBe('1.0.0');
    expect(needsBuild(root)).toBe(false);
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.0.1' }));
    expect(needsBuild(root)).toBe(true);
  });
});
