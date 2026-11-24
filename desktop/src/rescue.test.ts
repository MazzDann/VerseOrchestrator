import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bringPrevious, rescueFor } from './rescue';

describe('back to the previous version when this one does not start (1.26.0-beta.4)', () => {
  let top = '';
  beforeEach(() => {
    top = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-rescue-'));
  });
  afterEach(() => fs.rmSync(top, { recursive: true, force: true }));
  const copy = (dir: string, version: string | null) => {
    const at = path.join(top, dir);
    fs.mkdirSync(path.join(at, 'server', 'src'), { recursive: true });
    if (version) fs.writeFileSync(path.join(at, 'package.json'), JSON.stringify({ version }));
    fs.writeFileSync(path.join(at, '.vo-portable'), '{"data":"../data"}');
    fs.writeFileSync(path.join(at, 'server', 'src', 'launcher.ts'), dir);
  };
  const has = (dir: string) => {
    try {
      return fs.readFileSync(path.join(top, dir, 'server', 'src', 'launcher.ts'), 'utf8');
    } catch {
      return null;
    }
  };

  it('swaps the two, and tells the app', () => {
    copy('app', '1.26.1');
    copy('app.previous', '1.26.0');
    const r = rescueFor(path.join(top, 'app'))!;
    expect(r).toEqual({ top, from: '1.26.1', to: '1.26.0' });
    bringPrevious(r, 1);
    expect([has('app'), has('app.previous'), has('app.failed')]).toEqual([
      'app.previous',
      'app',
      null,
    ]);
    expect(
      JSON.parse(fs.readFileSync(path.join(top, 'data', 'updates', 'result.json'), 'utf8')),
    ).toMatchObject({
      ok: true,
      from: '1.26.1',
      to: '1.26.0',
      kind: 'rollback',
      pin: { version: '1.26.0', skip: '1.26.1' },
    });
  });

  it('a version whose package.json is lost too goes the same way', () => {
    copy('app', null);
    copy('app.previous', '1.26.0');
    const r = rescueFor(path.join(top, 'app'))!;
    expect(r.from).toBe('');
    bringPrevious(r, 1);
    expect(has('app')).toBe('app.previous');
  });

  it('app/ gone altogether: the previous one takes its place', () => {
    copy('app.previous', '1.26.0');
    const r = rescueFor(path.join(top, 'app'))!;
    bringPrevious(r, 1);
    expect([has('app'), has('app.previous')]).toEqual(['app.previous', null]);
  });

  it('nothing to go back to: no offer', () => {
    copy('app', '1.26.1');
    expect(rescueFor(path.join(top, 'app'))).toBeNull();
    copy('app.previous', '1.26.0');
    fs.rmSync(path.join(top, 'app.previous', '.vo-portable'));
    expect(rescueFor(path.join(top, 'app'))).toBeNull();
    // a copy of the repository
    expect(rescueFor(path.join(top, 'repo'))).toBeNull();
  });

  it('not while a swap helper may be at it; a previous one set aside by it counts', () => {
    copy('app', '1.26.1');
    copy('app.previous.old', '1.26.0');
    const updates = path.join(top, 'data', 'updates');
    fs.mkdirSync(updates, { recursive: true });
    fs.writeFileSync(path.join(updates, 'plan.json'), '{}');
    expect(rescueFor(path.join(top, 'app'))).toBeNull();
    const old = new Date(Date.now() - 3600_000);
    fs.utimesSync(path.join(updates, 'plan.json'), old, old);
    expect(rescueFor(path.join(top, 'app'))?.to).toBe('1.26.0');
  });

  it('a folder that can’t be renamed leaves all as it was', () => {
    copy('app', '1.26.1');
    copy('app.previous', '1.26.0');
    const r = rescueFor(path.join(top, 'app'))!;
    fs.renameSync(path.join(top, 'app.previous'), path.join(top, 'gone'));
    expect(() => bringPrevious(r, 1)).toThrow();
    expect(has('app')).toBe('app');
  });
});
