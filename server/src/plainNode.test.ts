import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The launcher, the waiter and the portable build run under plain Node (type stripping, no
 * tsx), so they may import only each other and `node:` modules — not `@vo/shared`, whose
 * sources import `./x.js` the tsx way. An i18n import once broke `start` like that (0.11.6),
 * and vitest, which resolves both ways, didn't notice.
 */
describe('plain Node entry points', () => {
  it('load without tsx', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const imports = ['launcher.ts', 'standby.ts', 'portable.ts']
      .map((f) => `await import(${JSON.stringify(pathToFileURL(path.join(dir, f)).href)});`)
      .join('');
    const r = spawnSync(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', imports],
      { encoding: 'utf8', timeout: 30_000 },
    );
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});
