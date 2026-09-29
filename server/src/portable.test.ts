import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { howToStart, nodeCopy, npmShim, OS_NAME, projectFiles, START_FILE } from './portable';

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

  it('finds npm beside the node on PATH or beside the file it links to (Homebrew, nvm)', () => {
    const have = new Set(['/opt/homebrew/lib/node_modules/npm']);
    expect(
      nodeCopy(
        'darwin',
        '/opt/homebrew/bin/node',
        '/opt/homebrew/Cellar/node/24.9.0/bin/node',
        (p) => have.has(p),
      ),
    ).toEqual([
      { from: '/opt/homebrew/Cellar/node/24.9.0/bin/node', to: 'bin/node' },
      { from: '/opt/homebrew/lib/node_modules/npm', to: 'lib/node_modules/npm' },
    ]);
    expect(nodeCopy('linux', '/usr/bin/node', '/usr/bin/node', () => false)).toMatch(/npm/);
    // an official tarball keeps LICENSE next to bin/: it travels too
    have.add('/opt/homebrew/Cellar/node/24.9.0/LICENSE');
    expect(
      nodeCopy(
        'darwin',
        '/opt/homebrew/bin/node',
        '/opt/homebrew/Cellar/node/24.9.0/bin/node',
        (p) => have.has(p),
      ),
    ).toContainEqual({ from: '/opt/homebrew/Cellar/node/24.9.0/LICENSE', to: 'LICENSE' });
  });

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
