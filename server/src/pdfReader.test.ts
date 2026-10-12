import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { childExecArgv } from './pdfReader.js';

describe('the PDF child’s flags', () => {
  const resolve = (s: string) => `file:///C:/app/node_modules/${s}/dist/loader.mjs`;
  it('a bare loader name becomes absolute (a release runs `--import tsx`)', () => {
    expect(
      childExecArgv(['--disable-warning=ExperimentalWarning', '--import', 'tsx'], resolve),
    ).toEqual([
      '--disable-warning=ExperimentalWarning',
      '--import=file:///C:/app/node_modules/tsx/dist/loader.mjs',
    ]);
    // a path for --require (whatever the system spells it as)
    expect(childExecArgv(['--require=tsx/cjs'], resolve)).toEqual([
      `--require=${fileURLToPath(resolve('tsx/cjs'))}`,
    ]);
  });
  it('absolute and relative ones, and the other flags, stay', () => {
    const argv = [
      '--require',
      'C:\\x\\preflight.cjs',
      '--import',
      'file:///C:/x/loader.mjs',
      '--max-old-space-size=512',
    ];
    expect(childExecArgv(argv, resolve)).toEqual([
      '--require=C:\\x\\preflight.cjs',
      '--import=file:///C:/x/loader.mjs',
      '--max-old-space-size=512',
    ]);
  });
  it('a name that does not resolve is left as it was', () => {
    expect(
      childExecArgv(['--import', 'nope'], () => {
        throw new Error('not found');
      }),
    ).toEqual(['--import=nope']);
  });
});
