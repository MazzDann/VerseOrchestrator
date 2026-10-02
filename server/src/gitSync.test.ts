import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGitSync,
  gitError,
  GIT_TIMED_OUT,
  readGitSync,
  runGitAsync,
  whyNotPull,
} from './gitSync';

const dirs: string[] = [];
afterEach(() => {
  // a git just stopped (the hang test) may hold its folder a moment on Windows
  for (const d of dirs.splice(0))
    fs.rmSync(d, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_NOSYSTEM: '1',
};
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim();

/** An upstream repository with one commit on main, and a clone of it that tracks origin/main. */
function pair() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-git-'));
  dirs.push(root);
  const up = path.join(root, 'up');
  const copy = path.join(root, 'copy');
  fs.mkdirSync(up);
  git(up, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(up, 'a.txt'), 'one\n');
  git(up, 'add', 'a.txt');
  git(up, 'commit', '-q', '-m', 'one');
  git(root, 'clone', '-q', up, copy);
  const commit = (dir: string, text: string) => {
    fs.appendFileSync(path.join(dir, 'a.txt'), `${text}\n`);
    git(dir, 'commit', '-q', '-am', text);
  };
  return { up, copy, commit };
}

describe('upd2: a copy of the repository gets its updates (1.6.1)', () => {
  it('fetches, says how far behind it is, and fast-forwards', async () => {
    const { up, copy, commit } = pair();
    const sync = createGitSync({ root: copy });
    expect(sync.state()).toMatchObject({
      branch: 'main',
      upstream: 'origin/main',
      behind: 0,
      clean: true,
      fetchedAt: null,
      why: null,
    });
    commit(up, 'two');
    commit(up, 'three');
    // not known before a fetch
    expect(sync.state(true).behind).toBe(0);
    const after = await sync.fetch();
    expect(after).toMatchObject({ behind: 2, ahead: 0, error: null });
    expect(after.fetchedAt).not.toBeNull();
    const { pulled, state } = await sync.pull();
    expect(pulled).toBe(2);
    expect(state.behind).toBe(0);
    expect(git(copy, 'rev-parse', 'HEAD')).toBe(git(up, 'rev-parse', 'HEAD'));
    // nothing new: nothing pulled
    expect((await sync.pull()).pulled).toBe(0);
  }, 30_000);

  it('leaves to the operator what git would ask about', async () => {
    const { up, copy, commit } = pair();
    const sync = createGitSync({ root: copy });
    commit(up, 'two');
    // uncommitted changes to a tracked file
    fs.appendFileSync(path.join(copy, 'a.txt'), 'mine\n');
    await expect(sync.pull()).rejects.toThrow(/незбережені зміни/);
    git(copy, 'checkout', '--', 'a.txt');
    // a commit of its own and one upstream: diverged
    commit(copy, 'mine');
    await sync.fetch();
    expect(sync.state(true).why).toMatch(/розійшлася/);
    await expect(sync.pull()).rejects.toThrow(/розійшлася/);
    // a merge left half done
    git(copy, 'reset', '-q', '--hard', 'origin/main~1');
    fs.writeFileSync(path.join(copy, '.git', 'MERGE_HEAD'), git(copy, 'rev-parse', 'HEAD'));
    expect(sync.state(true).why).toMatch(/зливає/);
    fs.rmSync(path.join(copy, '.git', 'MERGE_HEAD'));
    // a branch with no upstream; a commit checked out
    git(copy, 'checkout', '-q', '-b', 'mine');
    expect(sync.state(true).why).toMatch(/не стежить/);
    git(copy, 'checkout', '-q', '--detach');
    expect(sync.state(true).why).toMatch(/не на гілці/);
  }, 30_000);

  it('says so when the upstream can’t be reached, and fetches by itself only twice a day', async () => {
    const { copy } = pair();
    let t = 0;
    const sync = createGitSync({ root: copy, now: () => t });
    await sync.fetch();
    const first = sync.state(true).fetchedAt;
    t = 60 * 60 * 1000;
    await sync.fetch(true); // due? not after an hour
    expect(sync.state(true).fetchedAt).toBe(first);
    t = 13 * 60 * 60 * 1000;
    git(copy, 'remote', 'set-url', 'origin', path.join(copy, '..', 'gone'));
    await sync.fetch(true);
    const s = sync.state(true);
    expect(s.error).toMatch(/Не вдалося отримати зміни/);
    expect(s.detail).toBeTruthy();
    await expect(sync.pull()).rejects.toThrow(/Не вдалося отримати зміни/);
  }, 30_000);

  it('an upstream deleted after its merge (and pruned) counts as none', async () => {
    const { up, copy } = pair();
    git(up, 'branch', 'feature');
    git(copy, 'fetch', '-q');
    git(copy, 'checkout', '-q', '-b', 'feature', 'origin/feature');
    const sync = createGitSync({ root: copy });
    expect(sync.state(true)).toMatchObject({ branch: 'feature', upstream: 'origin/feature' });
    git(up, 'branch', '-D', 'feature');
    git(copy, 'fetch', '-q', '--prune');
    const s = sync.state(true);
    expect(s.upstream).toBeNull();
    expect(s.why).toMatch(/не стежить/);
  }, 30_000);

  it('says which untracked files stand where the incoming ones go — and keeps them', async () => {
    const { up, copy } = pair();
    fs.writeFileSync(path.join(up, 'b.txt'), 'theirs\n');
    git(up, 'add', 'b.txt');
    git(up, 'commit', '-q', '-m', 'b');
    fs.writeFileSync(path.join(copy, 'b.txt'), 'mine\n'); // untracked here
    const sync = createGitSync({ root: copy });
    await expect(sync.pull()).rejects.toThrow(/збігаються з вашими неврахованими/);
    const s = sync.state(true);
    expect(s.error).toMatch(/збігаються/);
    expect(s.detail).toContain('b.txt');
    expect(fs.readFileSync(path.join(copy, 'b.txt'), 'utf8')).toBe('mine\n');
  }, 30_000);

  it('a fetch that hangs is stopped at its time, helpers and all', async () => {
    // a server that takes the connection and never answers
    // (a connection reset when git is stopped is expected)
    const silent = net.createServer((sock) => sock.on('error', () => undefined));
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', r));
    const port = (silent.address() as net.AddressInfo).port;
    const { copy } = pair();
    const t = Date.now();
    try {
      await expect(
        runGitAsync(['fetch', '--quiet', `http://127.0.0.1:${port}/x.git`], copy, 1500),
      ).rejects.toThrow(GIT_TIMED_OUT);
      expect(Date.now() - t).toBeLessThan(5000);
    } finally {
      silent.close();
      // the stopped tree lets go of its folder a moment later (Windows): before the cleanup
      await new Promise((r) => setTimeout(r, 1500));
    }
  }, 30_000);

  it('reads git\u2019s own words, not «Aborting»', () => {
    expect(
      gitError(
        'error: The following untracked working tree files would be overwritten by merge:\n\tb.txt\n\tc.txt\nPlease move or remove them before you merge.\nAborting\n',
      ),
    ).toBe(
      'error: The following untracked working tree files would be overwritten by merge: b.txt c.txt',
    );
    expect(gitError('fatal: unable to access x\n')).toBe('fatal: unable to access x');
    expect(gitError('something odd\nlast words\n')).toBe('last words');
  });

  it('reads nothing odd from a folder that is no repository', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-nogit-'));
    dirs.push(d);
    const s = readGitSync(d);
    expect(s).toMatchObject({ branch: null, upstream: null, behind: 0 });
    expect(whyNotPull(s)).toMatch(/не на гілці/);
  });
});
