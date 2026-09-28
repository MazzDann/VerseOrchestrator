import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { howToStart, nodeCopy, npmShim, projectFiles } from './portable';

describe('portable copy (1.6.3)', () => {
  it('copies node.exe with the npm beside it on Windows', () => {
    const copy = nodeCopy('win32', 'C:\\Program Files\\nodejs\\node.exe', '', () => true);
    expect(copy).toEqual([
      { from: 'C:\\Program Files\\nodejs\\node.exe', to: 'node.exe' },
      { from: 'C:\\Program Files\\nodejs\\npm.cmd', to: 'npm.cmd' },
      { from: 'C:\\Program Files\\nodejs\\npx.cmd', to: 'npx.cmd' },
      { from: 'C:\\Program Files\\nodejs\\node_modules\\npm', to: 'node_modules\\npm' },
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
  });

  it('runs npm with the node beside it (no symlink — a flash drive would lose it)', () => {
    expect(npmShim('npm-cli')).toContain(
      'exec "$here/node" "$here/../lib/node_modules/npm/bin/npm-cli.js"',
    );
  });

  it('tells how to start, in the system’s own words', () => {
    const win = howToStart({ version: '1.6.3', platform: 'win32', arch: 'x64', withLibrary: true });
    expect(win).toContain('для Windows (x64)');
    expect(win).toContain('start.cmd');
    expect(win).toContain('бібліотеку вже додано');
    const mac = howToStart({
      version: '1.6.3',
      platform: 'darwin',
      arch: 'arm64',
      withLibrary: false,
    });
    expect(mac).toContain('start.command');
    expect(mac).toContain('modules/');
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
