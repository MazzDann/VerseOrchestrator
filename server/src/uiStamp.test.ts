import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Plugin } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import config, { stamp } from '../../web/vite.config';
import { LAYOUT_MARKER, RELEASE_MARKER } from './layout';
import { needsBuild, STAMP_FILE, uiStamp } from './uiStamp';

const temps: string[] = [];
afterEach(() => {
  for (const d of temps.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A clone with a built UI stamped as the web build stamps it. */
function clone(version = '1.0.0'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-stamp-'));
  temps.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version }));
  fs.mkdirSync(path.join(root, 'web', 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'web', 'dist'));
  fs.writeFileSync(path.join(root, 'web', 'src', 'main.tsx'), 'one');
  fs.writeFileSync(path.join(root, 'web', 'dist', 'index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(root, 'web', 'dist', STAMP_FILE), uiStamp(root));
  return root;
}

/** Run a hook of the build's stamp plugin the way the bundler does (plain or `{ handler }`). */
async function hook(plugin: ReturnType<typeof stamp>, name: string, ...args: unknown[]) {
  const h = (plugin as unknown as Record<string, unknown>)[name];
  const fn = typeof h === 'function' ? h : (h as { handler: unknown }).handler;
  await (fn as (...a: unknown[]) => unknown).apply({}, args);
}

/** The stamp plugin of a web build in `root`, configured the way the bundler resolves it. */
async function plugin(root: string) {
  const p = stamp();
  await hook(p, 'configResolved', { root: path.join(root, 'web'), build: { outDir: 'dist' } });
  return p;
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

  it('a clone rebuilds a build without a stamp; a release serves it (1.4.1)', () => {
    const root = clone();
    // what `npm run build --workspace @vo/web` left before 1.4.1: the bundler empties dist/
    fs.rmSync(path.join(root, 'web', 'dist', STAMP_FILE));
    expect(needsBuild(root)).toBe(true);
    fs.writeFileSync(path.join(root, LAYOUT_MARKER), JSON.stringify(RELEASE_MARKER));
    expect(needsBuild(root)).toBe(false);
  });

  it('Finder’s .DS_Store, AppleDouble ._ files and other dotfiles are not sources (1.4.1)', () => {
    const root = clone();
    const before = uiStamp(root);
    fs.mkdirSync(path.join(root, 'web', 'src', 'lib'));
    fs.writeFileSync(path.join(root, 'web', 'src', 'lib', 'bus.ts'), 'bus');
    const withLib = uiStamp(root);
    expect(withLib).not.toBe(before); // a new source counts
    fs.writeFileSync(path.join(root, 'web', 'src', '.DS_Store'), 'Bud1');
    fs.writeFileSync(path.join(root, 'web', 'src', '._main.tsx'), 'x');
    fs.writeFileSync(path.join(root, 'web', 'src', 'lib', '.DS_Store'), 'Bud1');
    fs.writeFileSync(path.join(root, 'web', 'src', '.main.tsx.swp'), 'vim');
    fs.mkdirSync(path.join(root, 'web', 'src', '.cache'));
    fs.writeFileSync(path.join(root, 'web', 'src', '.cache', 'x'), 'y');
    expect(uiStamp(root)).toBe(withLib);
  });
});

describe('every web build stamps what it was built from (1.4.1)', () => {
  it('the web build runs the stamp, after its compressed copies are written', () => {
    // as the bundler reads them: nested arrays flattened, `false` skipped
    const flatten = (options: unknown[]): Plugin[] =>
      options.flatMap((o) => (Array.isArray(o) ? flatten(o) : o ? [o as Plugin] : []));
    const plugins = flatten(config.plugins ?? []);
    const names = plugins.map((p) => p.name);
    expect(names).toContain('vo-precompress');
    expect(names).toContain('vo-stamp');
    // `post` + `sequential`: once every other closeBundle (precompress's too) has finished
    expect(plugins.find((p) => p.name === 'vo-stamp')?.closeBundle).toMatchObject({
      order: 'post',
      sequential: true,
    });
  });

  it('writes the sources’ stamp as the build started, once the files are written', async () => {
    const root = clone();
    fs.rmSync(path.join(root, 'web', 'dist', STAMP_FILE)); // the bundler empties dist/
    const p = await plugin(root);
    await hook(p, 'buildStart');
    const started = uiStamp(root);
    // an edit while the build runs is not in this build: its stamp stays the one it started with
    fs.writeFileSync(path.join(root, 'web', 'src', 'main.tsx'), 'edited meanwhile');
    await hook(p, 'writeBundle');
    await hook(p, 'closeBundle');
    expect(fs.readFileSync(path.join(root, 'web', 'dist', STAMP_FILE), 'utf8')).toBe(started);
    expect(needsBuild(root)).toBe(true); // …so the edit is built next time
    fs.writeFileSync(path.join(root, 'web', 'src', 'main.tsx'), 'one');
    expect(needsBuild(root)).toBe(false);
  });

  it('a build that wrote nothing leaves no stamp', async () => {
    const root = clone();
    fs.rmSync(path.join(root, 'web', 'dist', STAMP_FILE));
    const p = await plugin(root);
    await hook(p, 'buildStart');
    await hook(p, 'closeBundle'); // the bundler failed before it wrote the files
    expect(fs.existsSync(path.join(root, 'web', 'dist', STAMP_FILE))).toBe(false);
    expect(needsBuild(root)).toBe(true);
  });
});
