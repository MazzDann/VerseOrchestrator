/**
 * What a copy calls itself (the user's ask, 2026-10-01). A release or a portable copy: its
 * version, «1.4.2». A copy run from a git checkout: «dev 1.4.2.try7 (mac-test · 20dd850)» — the
 * release tag it grew from, the commits since that tag (`try7`; none right on the tag), the branch
 * and the commit, with a «+» after the commit when tracked files are changed and not committed.
 * Testing branches on a Mac, the start file said «VerseOrchestrator 1.4.2» for every build, and a
 * test ran on a build without the change it was meant to try.
 *
 * Asked once, as the launcher or the server starts: two git calls (≈ 10 ms each on an Apple
 * Silicon Mac), a second at most each. No git, no release tag, anything odd: «dev 1.4.2» from
 * package.json. Only shown — the server's `version` stays the plain one, which the update check,
 * the UI stamp, the update swap and the pages that follow a new version compare.
 *
 * Like launcher.ts: only node: imports and no TS-only syntax (plain Node runs it).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readLayout } from './layout.ts';

/** Runs git in `cwd`: its output, or null when git is missing, fails, or takes too long. */
export type GitRunner = (args: string[], cwd: string) => string | null;

const GIT_TIMEOUT_MS = 1000;

/** The file `spawn` would run for `name`: the first executable one on PATH, or null. */
export function onPath(name: string, pathVar: string): string | null {
  for (const dir of pathVar.split(path.delimiter)) {
    if (!dir) continue;
    const file = path.join(dir, name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      if (fs.statSync(file).isFile()) return fs.realpathSync(file);
    } catch {
      /* not here */
    }
  }
  return null;
}

/** The developer tools' folder on a Mac (`xcode-select -p` shows no dialog), or null. */
function xcodeDeveloperDir(): string | null {
  const r = spawnSync('xcode-select', ['-p'], {
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return r.status === 0 && typeof r.stdout === 'string' ? r.stdout.trim() || null : null;
}

/**
 * Whether running `git` asks the user nothing. On a Mac /usr/bin/git is a stub of Apple's
 * developer tools: without the tools it opens a dialog offering to install them — it would at
 * every start of a checkout, and a clone made with GitHub Desktop (which brings its own git)
 * needs no such tools. So there /usr/bin/git counts only when the developer folder has a git.
 */
export function gitAsksNothing(
  platform: string,
  pathVar: string,
  developerDir: () => string | null = xcodeDeveloperDir,
): boolean {
  if (platform !== 'darwin') return true;
  // none (spawn then fails quietly) or a real one (Homebrew, …)
  if (onPath('git', pathVar) !== '/usr/bin/git') return true;
  const dir = developerDir();
  return !!dir && fs.existsSync(path.join(dir, 'usr', 'bin', 'git'));
}

let gitUsable: boolean | null = null;

export const runGit: GitRunner = (args, cwd) => {
  gitUsable ??= gitAsksNothing(process.platform, process.env.PATH ?? '');
  if (!gitUsable) return null;
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
    // `status` then refreshes the index without writing it back: no .git/index.lock in the way
    // of a commit made at the same moment (`describe --dirty` writes it whatever this says)
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  });
  return r.status === 0 && typeof r.stdout === 'string' ? r.stdout.trim() : null;
};

/**
 * A copy run from a git checkout — a `.git` folder, or the `.git` file of a worktree — and not
 * from a release's folders (layout.ts), which carry no `.git` but a marker.
 */
export function isDevCopy(root: string): boolean {
  return readLayout(root) === null && fs.existsSync(path.join(root, '.git'));
}

/** What `git describe --tags --long` says («v1.4.2-7-g20dd850»), in parts; or null. */
export function parseDescribe(
  text: string | null,
): { version: string; ahead: number; hash: string } | null {
  const m = /^v(\d+\.\d+\.\d+)-(\d+)-g([0-9a-f]{4,40})$/.exec(text?.trim() ?? '');
  return m ? { version: m[1], ahead: Number(m[2]), hash: m[3] } : null;
}

/**
 * What `git status --porcelain=v2 --branch --untracked-files=no` says: the branch («detached»
 * for a checked-out commit) and whether tracked files are changed; or null.
 */
export function parseStatus(text: string | null): { branch: string | null; dirty: boolean } | null {
  if (text === null) return null;
  let branch: string | null = null;
  let dirty = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim();
      branch = head === '(detached)' ? 'detached' : head || null;
    } else if (line.trim() && !line.startsWith('#')) dirty = true;
  }
  return { branch, dirty };
}

/**
 * A dev copy's label from git's answers: `describe` from `git describe --tags --long`, `status`
 * from `git status --porcelain=v2 --branch`; either null when git said nothing. Without a release
 * tag to count from: «dev <version>» from package.json.
 */
export function devLabel(version: string, describe: string | null, status: string | null): string {
  const d = parseDescribe(describe);
  if (!d) return `dev ${version}`;
  const s = parseStatus(status);
  const commit = `${d.hash}${s?.dirty ? '+' : ''}`;
  const where = s?.branch ? `${s.branch} · ${commit}` : commit;
  return `dev ${d.version}${d.ahead > 0 ? `.try${d.ahead}` : ''} (${where})`;
}

/** What the copy in `root` calls itself: `version` in a release, the dev label in a checkout. */
export function versionLabel(root: string, version: string, run: GitRunner = runGit): string {
  if (!isDevCopy(root)) return version;
  // no --dirty: it writes .git/index; `status` tells the changes and writes nothing
  const describe = run(['describe', '--tags', '--match', 'v[0-9]*', '--long'], root);
  // no tag to count from (or no git): the branch is not worth a second call
  if (!parseDescribe(describe)) return devLabel(version, null, null);
  const status = run(['status', '--porcelain=v2', '--branch', '--untracked-files=no'], root);
  return devLabel(version, describe, status);
}
