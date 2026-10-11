import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { howToStart, nodeCopy, npmShim, projectFiles, pruneOnnx, START_FILE } from './portable';
import { OS_NAME, releaseAsset } from './layout';

describe('portable copy (0.7.3)', () => {
  it('copies node.exe with the npm beside it on Windows', () => {
    const copy = nodeCopy('win32', 'C:\\Program Files\\nodejs\\node.exe', '', () => true);
    expect(copy).toEqual([
      { from: 'C:\\Program Files\\nodejs\\node.exe', to: 'node.exe' },
      { from: 'C:\\Program Files\\nodejs\\npm.cmd', to: 'npm.cmd' },
      { from: 'C:\\Program Files\\nodejs\\npx.cmd', to: 'npx.cmd' },
      { from: 'C:\\Program Files\\nodejs\\node_modules\\npm', to: 'node_modules\\npm' },
      // Node's licence goes with its binary (0.14.1)
      { from: 'C:\\Program Files\\nodejs\\LICENSE', to: 'LICENSE' },
    ]);
    expect(nodeCopy('win32', 'C:\\node\\node.exe', '', (p) => !p.endsWith('npm.cmd'))).toMatch(
      /npm\.cmd/,
    );
  });

  it('finds npm beside the node on PATH or beside the file it links to (nodejs.org, fnm, nvm)', () => {
    // a symlink on PATH to an official tarball, as fnm and nvm install it
    const real = '/Users/me/.local/share/fnm/node-versions/v24.9.0/installation/bin/node';
    const have = new Set([
      '/Users/me/.local/share/fnm/node-versions/v24.9.0/installation/lib/node_modules/npm',
    ]);
    expect(
      nodeCopy(
        'darwin',
        '/usr/local/bin/node',
        real,
        (p) => have.has(p),
        () => [],
      ),
    ).toEqual([
      { from: real, to: 'bin/node' },
      {
        from: '/Users/me/.local/share/fnm/node-versions/v24.9.0/installation/lib/node_modules/npm',
        to: 'lib/node_modules/npm',
      },
    ]);
    // a node on PATH that links to a folder without npm: npm beside the one on PATH
    expect(
      nodeCopy(
        'linux',
        '/usr/local/bin/node',
        '/opt/node-24/bin/node',
        (p) => p === '/usr/local/lib/node_modules/npm',
        () => [],
      ),
    ).toEqual([
      { from: '/opt/node-24/bin/node', to: 'bin/node' },
      { from: '/usr/local/lib/node_modules/npm', to: 'lib/node_modules/npm' },
    ]);
    // nodejs.org's installer: npm beside the node on PATH
    expect(
      nodeCopy(
        'darwin',
        '/usr/local/bin/node',
        '/usr/local/bin/node',
        (p) => p === '/usr/local/lib/node_modules/npm',
        () => ['node_modules'],
      ),
    ).toContainEqual({ from: '/usr/local/lib/node_modules/npm', to: 'lib/node_modules/npm' });
    expect(
      nodeCopy(
        'linux',
        '/usr/bin/node',
        '/usr/bin/node',
        () => false,
        () => [],
      ),
    ).toMatch(/npm/);
    // an official tarball keeps LICENSE next to bin/: it travels too
    have.add('/Users/me/.local/share/fnm/node-versions/v24.9.0/installation/LICENSE');
    expect(
      nodeCopy(
        'darwin',
        '/usr/local/bin/node',
        real,
        (p) => have.has(p),
        () => [],
      ),
    ).toContainEqual({
      from: '/Users/me/.local/share/fnm/node-versions/v24.9.0/installation/LICENSE',
      to: 'LICENSE',
    });
  });

  it('refuses a Node that needs the libraries beside it: Homebrew’s (1.4.1)', () => {
    // macOS reports the real file: npm is in /opt/homebrew/lib, libnode in the Cellar's lib/
    const cellar = '/opt/homebrew/Cellar/node/25.6.1/bin/node';
    const libs = (dir: string) =>
      dir === '/opt/homebrew/Cellar/node/25.6.1/lib' ? ['libnode.141.dylib'] : [];
    for (const [real, files] of [
      [cellar, libs],
      [cellar, () => []], // …even if libnode moves: Homebrew links libuv, OpenSSL, ICU of its own
      ['/opt/homebrew/Cellar/node@24/24.9.0/bin/node', () => []],
      ['/usr/local/Cellar/node/24.9.0/bin/node', () => []], // an Intel Mac
      ['/home/linuxbrew/.linuxbrew/Cellar/node/24.9.0/bin/node', () => []],
      [
        '/opt/node-shared/bin/node',
        (d: string) => (d === '/opt/node-shared/lib' ? ['libnode.so.137'] : []),
      ],
    ] as [string, (d: string) => string[]][]) {
      const message = nodeCopy('darwin', real, real, () => true, files);
      expect(message).toBeTypeOf('string');
      expect(message).toContain(real);
      expect(message).toContain('Homebrew');
      expect(message).toContain('nodejs.org');
    }
  });

  // a real folder: only a libnode that is a file counts, not a link to another Node's (1.4.1)
  it.runIf(process.platform !== 'win32')(
    'takes nodejs.org’s Node beside the libnode link Homebrew puts in /usr/local/lib (Intel Mac)',
    () => {
      const prefix = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-node-'));
      try {
        const node = path.join(prefix, 'bin', 'node');
        const lib = path.join(prefix, 'lib');
        const cellar = path.join(prefix, 'Cellar', 'node', '25.6.1');
        fs.mkdirSync(path.join(prefix, 'bin'));
        fs.writeFileSync(node, '');
        fs.mkdirSync(path.join(lib, 'node_modules', 'npm'), { recursive: true });
        fs.mkdirSync(path.join(cellar, 'bin'), { recursive: true });
        fs.mkdirSync(path.join(cellar, 'lib'));
        fs.writeFileSync(path.join(cellar, 'bin', 'node'), '');
        fs.writeFileSync(path.join(cellar, 'lib', 'libnode.141.dylib'), '');
        // what `brew install node` leaves in the prefix's lib/
        fs.symlinkSync(
          '../Cellar/node/25.6.1/lib/libnode.141.dylib',
          path.join(lib, 'libnode.141.dylib'),
        );
        expect(nodeCopy('darwin', node, node)).toContainEqual({
          from: path.join(lib, 'node_modules', 'npm'),
          to: 'lib/node_modules/npm',
        });
        // Homebrew's own node, and a Node built with its libnode as a file beside it: refused
        const brew = path.join(cellar, 'bin', 'node');
        expect(nodeCopy('darwin', node, brew)).toBeTypeOf('string');
        fs.rmSync(path.join(lib, 'libnode.141.dylib'));
        fs.writeFileSync(path.join(lib, 'libnode.141.dylib'), '');
        expect(nodeCopy('darwin', node, node)).toContain('Homebrew');
      } finally {
        fs.rmSync(prefix, { recursive: true, force: true });
      }
    },
  );

  it('runs npm with the node beside it (no symlink — a flash drive would lose it)', () => {
    expect(npmShim('npm-cli')).toContain(
      'exec "$here/node" "$here/../lib/node_modules/npm/bin/npm-cli.js"',
    );
  });

  it('tells how to start, in the system’s own words', () => {
    const win = howToStart({ version: '0.7.3', platform: 'win32', arch: 'x64', withLibrary: true });
    expect(win).toContain('для Windows (x64)');
    expect(win).toContain('start.cmd');
    expect(win).toContain('бібліотеку вже додано');
    const mac = howToStart({
      version: '0.7.3',
      platform: 'darwin',
      arch: 'arm64',
      withLibrary: false,
    });
    expect(mac).toContain('start.command');
    expect(mac).toContain('./start.command --off'); // the only start file at a Mac release's top
    expect(mac).toContain('modules/');
    // the app is in app/, the user's things next to it (0.14.0)
    expect(win).toContain('app/');
    expect(win).toContain('data/');
    // a release carries the note in English too, whatever the console speaks (0.14.1)
    const en = howToStart(
      { version: '0.14.1', platform: 'linux', arch: 'x64', withLibrary: false },
      'en',
    );
    expect(en).toContain('./start.sh');
    expect(en).not.toMatch(/[Ѐ-ӿ]/);
  });

  it('names the folder and the start file the way people know their system (0.14.0)', () => {
    expect([OS_NAME.win32, OS_NAME.darwin, OS_NAME.linux]).toEqual(['windows', 'macos', 'linux']);
    // the archive the release workflow publishes for each (0.14.1)
    expect(releaseAsset('win32', 'x64')).toBe('VerseOrchestrator-windows-x64.zip');
    expect(releaseAsset('darwin', 'arm64')).toBe('VerseOrchestrator-macos-arm64.zip');
    expect(releaseAsset('linux', 'x64')).toBe('VerseOrchestrator-linux-x64.tar.gz');
    expect([START_FILE.win32, START_FILE.darwin, START_FILE.linux]).toEqual([
      'start.cmd',
      'start.command',
      'start.sh',
    ]);
  });

  it('without git: the project files by name, as .gitignore keeps things out', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-portable-'));
    try {
      for (const f of [
        'README.md',
        'server/src/index.ts',
        'web/src/main.tsx',
        'web/dist/index.html',
        'node_modules/express/index.js',
        'data/library.db',
        '.git/HEAD',
        'server/tsconfig.tsbuildinfo',
        '.env',
      ]) {
        fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
        fs.writeFileSync(path.join(dir, f), '');
      }
      expect(projectFiles(dir).sort()).toEqual([
        'README.md',
        'server/src/index.ts',
        'web/src/main.tsx',
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the ONNX runtime in a copy (1.15)', () => {
  const lay = (files: Record<string, string>) => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-onnx-'));
    for (const [f, body] of Object.entries(files)) {
      const p = path.join(app, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', f);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body);
    }
    const left = () =>
      fs
        .readdirSync(path.join(app, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6'), {
          recursive: true,
        })
        .map(String)
        .map((f) => f.split(path.sep).join('/'))
        .filter((f) => f.includes('.'))
        .sort();
    return { app, left };
  };

  it('keeps its own system, without DirectML', () => {
    const { app, left } = lay({
      'win32/x64/onnxruntime.dll': 'x',
      'win32/x64/DirectML.dll': 'x',
      'win32/x64/onnxruntime_binding.node': 'x',
      'linux/x64/libonnxruntime.so.1': 'x',
    });
    pruneOnnx(app, 'win32', 'x64');
    expect(left()).toEqual(['win32/x64/onnxruntime.dll', 'win32/x64/onnxruntime_binding.node']);
    fs.rmSync(app, { recursive: true, force: true });
  });

  it('macOS: one copy of the runtime — the one the binding loads', () => {
    const { app, left } = lay({
      'darwin/arm64/libonnxruntime.1.dylib': 'same',
      'darwin/arm64/libonnxruntime.1.30.0.dylib': 'same',
      'darwin/arm64/onnxruntime_binding.node': 'x',
    });
    pruneOnnx(app, 'darwin', 'arm64');
    expect(left()).toEqual([
      'darwin/arm64/libonnxruntime.1.dylib',
      'darwin/arm64/onnxruntime_binding.node',
    ]);
    fs.rmSync(app, { recursive: true, force: true });
  });
});
