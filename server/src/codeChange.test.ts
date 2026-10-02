import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCodeWatch, headCommit } from './codeChange';
import type { GitRunner } from './versionLabel';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

/** A copy of the repository: a .git folder and a package.json of `version`. */
function checkout(version: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-code-'));
  dirs.push(d);
  fs.mkdirSync(path.join(d, '.git'));
  fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ version }));
  return d;
}

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

/** git answering for the commit `head()` names, on main, nothing changed. */
function fakeGit(head: () => string | null) {
  const calls: string[] = [];
  const run: GitRunner = (args) => {
    calls.push(args[0]);
    const h = head();
    if (args[0] === 'rev-parse') return h;
    if (args[0] === 'describe') return h ? `v1.5.0-2-g${h.slice(0, 7)}` : null;
    if (args[0] === 'status') return '# branch.head main\n';
    return null;
  };
  return { run, calls };
}

describe('upd2: a copy of the repository notices new code (1.6.0)', () => {
  it('reads the checked-out commit, or nothing when git says nothing', () => {
    expect(headCommit('.', () => `${A}`)).toBe(A);
    expect(headCommit('.', () => null)).toBeNull();
    expect(headCommit('.', () => 'fatal: not a git repository')).toBeNull();
  });

  it('says the code changed once another commit is checked out — and what it would be called', () => {
    const root = checkout('1.5.0');
    let head = A;
    let t = 0;
    const git = fakeGit(() => head);
    const watch = createCodeWatch({
      root,
      label: 'dev 1.5.0.try2 (main · aaaaaaa)',
      commit: A,
      run: git.run,
      now: () => t,
      freshMs: 5000,
    });
    expect(watch.state()).toEqual({
      changed: false,
      from: 'dev 1.5.0.try2 (main · aaaaaaa)',
      to: 'dev 1.5.0.try2 (main · aaaaaaa)',
    });
    // git pull: a new commit, and a new version in package.json
    head = B;
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.6.0' }));
    // a fresh answer is kept for a few seconds: no git call per request
    t = 1000;
    expect(watch.state().changed).toBe(false);
    t = 6000;
    expect(watch.state()).toMatchObject({ changed: true, to: 'dev 1.5.0.try2 (main · bbbbbbb)' });
    // back to the commit it started with: nothing to restart for
    head = A;
    t = 12000;
    expect(watch.state().changed).toBe(false);
  });

  it('never says changed without a commit to compare (no git, or git silent now)', () => {
    const root = checkout('1.5.0');
    const silent = fakeGit(() => null);
    expect(
      createCodeWatch({ root, label: 'x', commit: null, run: silent.run }).state().changed,
    ).toBe(false);
    expect(createCodeWatch({ root, label: 'x', commit: A, run: silent.run }).state().changed).toBe(
      false,
    );
  });
});
