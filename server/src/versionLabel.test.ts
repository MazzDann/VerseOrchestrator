import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { LAYOUT_MARKER, RELEASE_MARKER } from './layout';
import {
  devLabel,
  gitAsksNothing,
  isDevCopy,
  onPath,
  parseDescribe,
  parseStatus,
  versionLabel,
  type GitRunner,
} from './versionLabel';

const dirs: string[] = [];
function dir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-label-'));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A clone (a .git folder) or a worktree (a .git file), maybe with a release marker as well. */
function copy(git: 'dir' | 'file' | null, marker = false): string {
  const root = dir();
  if (git === 'dir') fs.mkdirSync(path.join(root, '.git'));
  if (git === 'file')
    fs.writeFileSync(path.join(root, '.git'), 'gitdir: /somewhere/.git/worktrees/x\n');
  if (marker) fs.writeFileSync(path.join(root, LAYOUT_MARKER), JSON.stringify(RELEASE_MARKER));
  return root;
}

/** `git status --porcelain=v2 --branch --untracked-files=no` on a branch, maybe with changes. */
const status = (head: string, ...changes: string[]) =>
  [`# branch.oid 20dd850aaaa`, `# branch.head ${head}`, ...changes].join('\n');
const CHANGED = '1 .M N... 100644 100644 100644 587be6b 587be6b server/src/index.ts';

/** git's answers by command, and which commands were asked. */
function fakeGit(answers: { describe?: string | null; status?: string | null }) {
  const asked: string[][] = [];
  const run: GitRunner = (args) => {
    asked.push(args);
    if (args[0] === 'describe') return answers.describe ?? null;
    if (args[0] === 'status') return answers.status ?? null;
    return null;
  };
  return { run, asked };
}

describe('the dev label (2026-10-01)', () => {
  it('reads git describe after a beta tag (1.8.11)', () => {
    expect(parseDescribe('v1.8.12-beta.1-3-g20dd850')).toEqual({
      version: '1.8.12-beta.1',
      ahead: 3,
      hash: '20dd850',
    });
    expect(parseDescribe('v1.8.12-beta-0-g20dd850')).toMatchObject({ version: '1.8.12-beta' });
    expect(parseDescribe('v1.8.12-3-g20dd850')).toMatchObject({ version: '1.8.12', ahead: 3 });
    // any pre-release tag counts — before 1.8.11 one was no release tag at all
    expect(parseDescribe('v1.4.2-rc1-7-g20dd850')).toMatchObject({
      version: '1.4.2-rc1',
      ahead: 7,
    });
  });

  it('reads git describe', () => {
    expect(parseDescribe('v1.4.2-7-g20dd850')).toEqual({
      version: '1.4.2',
      ahead: 7,
      hash: '20dd850',
    });
    expect(parseDescribe('v1.4.2-0-gd4961e3\n')).toEqual({
      version: '1.4.2',
      ahead: 0,
      hash: 'd4961e3',
    });
  });

  it('reads git status: the branch, «detached», and changes to tracked files', () => {
    expect(parseStatus(status('mac-test'))).toEqual({ branch: 'mac-test', dirty: false });
    expect(parseStatus(status('main', CHANGED))).toEqual({ branch: 'main', dirty: true });
    expect(parseStatus(status('(detached)'))).toEqual({ branch: 'detached', dirty: false });
    // a staged new file and a conflict count too
    expect(parseStatus(status('x', '1 A. N... 000000 100644 100644 0000 abcd f'))?.dirty).toBe(
      true,
    );
    expect(parseStatus(status('x', 'u UU N... 1 2 3 4 a b c f'))?.dirty).toBe(true);
    expect(parseStatus('')).toEqual({ branch: null, dirty: false });
    expect(parseStatus(null)).toBeNull();
  });

  it('counts the tries since the release tag, names the branch and the commit', () => {
    expect(devLabel('1.4.2', 'v1.4.2-7-g20dd850', status('mac-test'))).toBe(
      'dev 1.4.2.try7 (mac-test · 20dd850)',
    );
    expect(devLabel('1.4.2', 'v1.4.2-12-gabc1234', status('feat/mac-dev-version'))).toBe(
      'dev 1.4.2.try12 (feat/mac-dev-version · abc1234)',
    );
  });

  it('right on the tag: no try', () => {
    expect(devLabel('1.4.2', 'v1.4.2-0-gd4961e3', status('main'))).toBe(
      'dev 1.4.2 (main · d4961e3)',
    );
  });

  it('marks uncommitted changes with a + after the commit', () => {
    expect(devLabel('1.4.2', 'v1.4.2-7-g20dd850', status('mac-test', CHANGED))).toBe(
      'dev 1.4.2.try7 (mac-test · 20dd850+)',
    );
    expect(devLabel('1.4.2', 'v1.4.2-0-gd4961e3', status('main', CHANGED))).toBe(
      'dev 1.4.2 (main · d4961e3+)',
    );
  });

  it('says «detached» for a checked-out commit, and only the commit without a status', () => {
    expect(devLabel('1.4.2', 'v1.4.2-3-g1234567', status('(detached)'))).toBe(
      'dev 1.4.2.try3 (detached · 1234567)',
    );
    expect(devLabel('1.4.2', 'v1.4.2-3-g1234567', null)).toBe('dev 1.4.2.try3 (1234567)');
  });

  it('counts from the tag even when package.json says another version (a release branch)', () => {
    expect(devLabel('1.4.3', 'v1.4.2-2-g1234567', status('release/1.4.3'))).toBe(
      'dev 1.4.2.try2 (release/1.4.3 · 1234567)',
    );
  });

  it('without tags, git or a sane answer: «dev» and the version from package.json', () => {
    expect(devLabel('1.4.2', null, status('main'))).toBe('dev 1.4.2');
    for (const garbage of [
      '',
      'fatal: No names found, cannot describe anything.',
      'd4961e3',
      'v1.4-7-g20dd850',
      'v1.4.2-x-g20dd850',
      'v1.4.2-7-20dd850',
      'v1.4.2-7-gXYZ',
      'v1.4.2-7-g20dd850-dirty',
    ])
      expect(devLabel('1.4.2', garbage, status('main'))).toBe('dev 1.4.2');
  });
});

describe('a dev copy or a release', () => {
  it('a clone or a worktree is a dev copy; a release or a plain folder is not', () => {
    expect(isDevCopy(copy('dir'))).toBe(true);
    expect(isDevCopy(copy('file'))).toBe(true);
    expect(isDevCopy(copy(null))).toBe(false);
    expect(isDevCopy(copy(null, true))).toBe(false);
    // the release layout wins over a .git that happens to be there
    expect(isDevCopy(copy('dir', true))).toBe(false);
  });

  it('a release says its version and never asks git', () => {
    const git = fakeGit({ describe: 'v1.4.2-7-g20dd850', status: status('main') });
    expect(versionLabel(copy(null, true), '1.4.2', git.run)).toBe('1.4.2');
    expect(versionLabel(copy(null), '1.4.2', git.run)).toBe('1.4.2');
    expect(git.asked).toEqual([]);
  });

  it('a dev copy asks git: describe without --dirty (it writes .git/index), then status', () => {
    const git = fakeGit({ describe: 'v1.4.2-7-g20dd850', status: status('mac-test', CHANGED) });
    expect(versionLabel(copy('file'), '1.4.2', git.run)).toBe(
      'dev 1.4.2.try7 (mac-test · 20dd850+)',
    );
    expect(git.asked.map((a) => a[0])).toEqual(['describe', 'status']);
    expect(git.asked.flat()).not.toContain('--dirty');
  });

  it('git missing, failing or too slow (null): «dev» and the version, one call only', () => {
    const git = fakeGit({ describe: null, status: status('main') });
    expect(versionLabel(copy('dir'), '1.4.2', git.run)).toBe('dev 1.4.2');
    expect(git.asked).toHaveLength(1);
  });

  it('this repository, with the real git (or without it)', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    // a CI checkout has no tags and a Linux test image no git: «dev X.Y.Z» then; a downloaded
    // source zip has no .git at all: the version as it is
    expect(versionLabel(root, '9.9.9')).toMatch(
      fs.existsSync(path.join(root, '.git'))
        ? /^dev \d+\.\d+\.\d+(\.try\d+)?( \(.+ · [0-9a-f]{4,40}\+?\)| \([0-9a-f]{4,40}\+?\))?$/
        : /^9\.9\.9$/,
    );
  });
});

describe('git without a dialog (a Mac without the developer tools)', () => {
  /** A PATH folder holding an executable `git`. */
  function binWithGit(): string {
    const bin = dir();
    fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\n', { mode: 0o755 });
    return bin;
  }

  it('finds what spawn would run: the first executable on PATH', () => {
    const empty = dir();
    const bin = binWithGit();
    const pathVar = [empty, bin, binWithGit()].join(path.delimiter);
    expect(onPath('git', pathVar)).toBe(fs.realpathSync(path.join(bin, 'git')));
    expect(onPath('git', empty)).toBeNull();
    expect(onPath('git', '')).toBeNull();
  });

  it('elsewhere, or with a git of its own on PATH: git is asked, xcode-select is not', () => {
    let asked = 0;
    const devDir = () => {
      asked++;
      return null;
    };
    expect(gitAsksNothing('win32', '/usr/bin', devDir)).toBe(true);
    expect(gitAsksNothing('linux', '/usr/bin', devDir)).toBe(true);
    expect(gitAsksNothing('darwin', [binWithGit(), '/usr/bin'].join(path.delimiter), devDir)).toBe(
      true,
    );
    // no git at all: spawn fails quietly, nothing to ask
    expect(gitAsksNothing('darwin', dir(), devDir)).toBe(true);
    expect(asked).toBe(0);
  });

  it.runIf(process.platform === 'darwin' && fs.existsSync('/usr/bin/git'))(
    'a Mac with only /usr/bin/git: git only when the developer folder has one',
    () => {
      const tools = dir();
      fs.mkdirSync(path.join(tools, 'usr', 'bin'), { recursive: true });
      fs.writeFileSync(path.join(tools, 'usr', 'bin', 'git'), '');
      expect(gitAsksNothing('darwin', '/usr/bin', () => tools)).toBe(true);
      // no developer tools (xcode-select fails), or a folder left without them
      expect(gitAsksNothing('darwin', '/usr/bin', () => null)).toBe(false);
      expect(gitAsksNothing('darwin', '/usr/bin', () => dir())).toBe(false);
    },
  );
});
