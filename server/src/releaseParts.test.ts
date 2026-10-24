import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assign,
  buildReleaseParts,
  contentHash,
  planParts,
  tarFileList,
  walkFiles,
  type Archive,
} from './releaseParts';

const dirs: string[] = [];
/** a built release top with a file in each segment (and the user's data/ + modules/). */
function fakeTop(): string {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-parts-'));
  dirs.push(top);
  const put = (rel: string, body = rel) => {
    const abs = path.join(top, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  };
  put('app/node/bin/node');
  put('app/node_modules/onnxruntime-node/index.js');
  put('app/node_modules/@vo/server/index.js'); // our code → app, not deps
  put('app/web/dist/assets/ort.wasm');
  put('app/web/dist/assets/pglite.data');
  put('app/web/dist/assets/index-abc.js'); // our bundle → app, not engines
  put('shell/VerseOrchestrator.exe');
  put('shell/resources/app/main.js'); // our desktop build → app, not shell
  put('app/server/index.js');
  put('app/package.json', '{"version":"1.20.0"}');
  put('start.cmd'); // release-top loose file: no segment (the updater's top-files path refreshes it)
  put('ЯК ЗАПУСТИТИ.txt'); // non-ASCII top-level readme: no segment, so no name ever lands in a list
  put('data/library.db'); // the user's: no segment
  put('modules/Bible.SQLite3');
  return top;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** make a dir symlink (a junction on Windows — no privilege needed); null if even that is refused. */
function linkDir(target: string, link: string): boolean {
  try {
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch {
    return false;
  }
}

/** records what it was asked to archive and writes the file list as the archive's bytes. */
const recording = (): { calls: { out: string; files: string[] }[]; archive: Archive } => {
  const calls: { out: string; files: string[] }[] = [];
  const archive: Archive = async (_top, out, files) => {
    calls.push({ out, files });
    fs.writeFileSync(out, files.join('\n'));
  };
  return { calls, archive };
};

describe('walkFiles follows symlinks (1.20.0-beta.2)', () => {
  it('emits files reached through a symlinked dir (the @vo case), and survives a cycle', () => {
    const top = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-walk-'));
    dirs.push(top);
    fs.mkdirSync(path.join(top, 'app', 'server'), { recursive: true });
    fs.writeFileSync(path.join(top, 'app', 'server', 'index.js'), 'x');
    fs.mkdirSync(path.join(top, 'app', 'node_modules', '@vo'), { recursive: true });
    const linked = linkDir(
      path.join(top, 'app', 'server'),
      path.join(top, 'app', 'node_modules', '@vo', 'server'),
    );
    if (!linked) return; // no symlink/junction privilege here — nothing to assert
    // a self-referential link must not hang the walk
    linkDir(path.join(top, 'app'), path.join(top, 'app', 'loop'));
    const files = walkFiles(top);
    expect(files).toContain('app/server/index.js'); // the real path
    expect(files).toContain('app/node_modules/@vo/server/index.js'); // dereferenced through the link
  });
});

describe('the tar --null -T - file list (1.20.0-beta.1)', () => {
  it('is NUL-separated with no empty entries — windows-latest bsdtar chokes on a blank entry', () => {
    const body = tarFileList(['app/a.js', '', 'app/node/node.exe', 'shell/x']);
    expect(body).toBe('app/a.js\0app/node/node.exe\0shell/x');
    expect(body.split('\0').some((e) => e === '')).toBe(false);
  });
});

describe('updates in parts — the split (1.20.0-beta.1)', () => {
  it('puts each file in its segment; our code and the user folders are apart', () => {
    expect(assign('app/node/bin/node')).toBe('runtime');
    expect(assign('app/node_modules/onnxruntime-node/x')).toBe('deps');
    expect(assign('app/node_modules/@vo/server/x')).toBe('app');
    expect(assign('app/web/dist/assets/ort.wasm')).toBe('engines');
    expect(assign('app/web/dist/assets/index-abc.js')).toBe('app');
    expect(assign('shell/VerseOrchestrator.exe')).toBe('shell');
    expect(assign('shell/resources/app/main.js')).toBe('app');
    expect(assign('app/server/index.js')).toBe('app');
    expect(assign('start.cmd')).toBeNull(); // a release-top loose file: no segment
    expect(assign('ЯК ЗАПУСТИТИ.txt')).toBeNull(); // the non-ASCII top-level readme: kept out
    expect(assign('data/library.db')).toBeNull();
    expect(assign('modules/Bible.SQLite3')).toBeNull();
  });

  it('knows the macOS shell dir (VerseOrchestrator.app), its inner app → the app segment', () => {
    const mac = 'VerseOrchestrator.app';
    expect(assign('VerseOrchestrator.app/Contents/MacOS/VerseOrchestrator', mac)).toBe('shell');
    expect(assign('VerseOrchestrator.app/Contents/Resources/electron.icns', mac)).toBe('shell');
    expect(assign('VerseOrchestrator.app/Contents/Resources/app/main.js', mac)).toBe('app');
    // with the macOS shell dir, `shell/` is just an ordinary app-less name → no segment
    expect(assign('shell/x', mac)).toBeNull();
  });

  it('plans the segments, the user folders in none', () => {
    const top = fakeTop();
    const plan = planParts(top);
    const byName = Object.fromEntries(plan.map((s) => [s.name, s.files]));
    expect(byName.runtime).toEqual(['app/node/bin/node']);
    expect(byName.deps).toEqual(['app/node_modules/onnxruntime-node/index.js']);
    expect(byName.engines.sort()).toEqual([
      'app/web/dist/assets/ort.wasm',
      'app/web/dist/assets/pglite.data',
    ]);
    expect(byName.shell).toEqual(['shell/VerseOrchestrator.exe']);
    expect(byName.app).toEqual(
      expect.arrayContaining([
        'app/node_modules/@vo/server/index.js',
        'app/web/dist/assets/index-abc.js',
        'shell/resources/app/main.js',
        'app/server/index.js',
        'app/package.json',
      ]),
    );
    // every file is covered exactly once, and no user or release-top file leaked in
    const all = plan.flatMap((s) => s.files);
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain('data/library.db');
    expect(all).not.toContain('modules/Bible.SQLite3');
    expect(all).not.toContain('start.cmd');
    expect(all).not.toContain('ЯК ЗАПУСТИТИ.txt');
    // the segments together are every file except the user's data/ and modules/ and the top files
    const covered = walkFiles(top).filter((f) => assign(f) !== null);
    expect([...all].sort()).toEqual(covered.sort());
  });

  it('content hash is deterministic and notices a change', () => {
    const top = fakeTop();
    const files = ['app/server/index.js', 'app/package.json'];
    const a = contentHash(top, files);
    expect(contentHash(top, [...files].reverse())).toBe(a); // order does not matter
    fs.writeFileSync(path.join(top, 'app', 'server', 'index.js'), 'changed');
    expect(contentHash(top, files)).not.toBe(a);
  });

  it('builds parts, writes app/parts.json and a matching manifest', async () => {
    const top = fakeTop();
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-parts-out-'));
    dirs.push(outDir);
    const { calls, archive } = recording();
    const manifest = await buildReleaseParts({
      top,
      outDir,
      os: 'windows',
      arch: 'x64',
      platform: 'win32',
      full: 'VerseOrchestrator-windows-x64.zip',
      archive,
    });
    // app/parts.json lists every segment's content hash
    const appParts = JSON.parse(fs.readFileSync(path.join(top, 'app', 'parts.json'), 'utf8'));
    expect(appParts.format).toBe(1);
    expect(appParts.segments.map((s: { name: string }) => s.name).sort()).toEqual([
      'app',
      'deps',
      'engines',
      'runtime',
      'shell',
    ]);
    // the manifest's hashes match app/parts.json; each names its archive, sized and summed
    expect(manifest.full).toBe('VerseOrchestrator-windows-x64.zip');
    for (const seg of manifest.segments) {
      const inApp = appParts.segments.find((s: { name: string }) => s.name === seg.name);
      expect(seg.contentHash).toBe(inApp.contentHash);
      expect(seg.file).toBe(`VerseOrchestrator-windows-x64.${seg.name}.zip`);
      expect(seg.size).toBeGreaterThan(0);
      expect(seg.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(fs.existsSync(path.join(outDir, seg.file))).toBe(true);
    }
    // the `app` archive carries parts.json; the others don't
    const appCall = calls.find((c) => c.out.endsWith('.app.zip'))!;
    expect(appCall.files).toContain('app/parts.json');
    expect(calls.find((c) => c.out.endsWith('.shell.zip'))!.files).not.toContain('app/parts.json');
  });
});
