import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { N_ } from '@vo/shared';
import { runGit, type GitRunner } from './versionLabel.js';

/**
 * upd2 (1.6.1, the user's ask): a copy of the repository gets its updates from the app —
 * «Перевірити зараз» (and twice a day, with «Перевіряти оновлення» on) fetches the branch's
 * upstream and says how far behind it is; «Отримати оновлення» pulls (`git merge --ff-only`
 * after a fetch). Only what git does by itself, with no question to answer: a clean tree, a
 * branch that tracks one, nothing diverged, no merge or rebase under way — anything else is said
 * in words and left to the operator. Then 1.6.0's «Перезапустити» (codeChange.ts) takes over.
 */
export interface GitSync {
  /** the checked-out branch; null when a commit is checked out (detached) */
  branch: string | null;
  /** what it tracks («origin/main»); null when nothing, or when that is gone */
  upstream: string | null;
  /** commits here and not there, and there and not here — as of the last fetch */
  ahead: number;
  behind: number;
  /** no changes to tracked files */
  clean: boolean;
  /** git is in the middle of something: a merge, a rebase, a cherry-pick */
  midway: boolean;
  /** when the upstream was last fetched; null: not since the start */
  fetchedAt: number | null;
  /** a dictionary key: the last fetch or pull failed */
  error: string | null;
  /** the failure's own words — git's error line, the files in the way — shown after the key */
  detail: string | null;
  /** why a pull would not be a plain fast-forward: a dictionary key ({branch}, {upstream}) */
  why: string | null;
}

type Standing = Omit<GitSync, 'fetchedAt' | 'error' | 'detail' | 'why'>;

/** Runs git and resolves its output, or rejects with git's error; settled after `ms` at most. */
export type AsyncGitRunner = (args: string[], cwd: string, ms: number) => Promise<string>;

/** A key: git didn't finish in time (its whole process tree is stopped). */
export const GIT_TIMED_OUT = N_('Git не відповів вчасно — перевірте мережу й спробуйте ще раз');

/**
 * What git said went wrong: its first `error:` / `fatal:` line and the paths listed under it
 * (the files in the way), or its last line — not «Aborting».
 */
export function gitError(text: string): string {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  const at = lines.findIndex((l) => /^(error|fatal):/.test(l));
  if (at < 0) return lines.filter((l) => l.trim()).pop() ?? '';
  const paths = [];
  for (let i = at + 1; i < lines.length && /^\t/.test(lines[i]); i++) paths.push(lines[i].trim());
  return [lines[at], ...paths].join(' ').slice(0, 300);
}

export const runGitAsync: AsyncGitRunner = (args, cwd, ms) =>
  new Promise((resolve, reject) => {
    const posix = process.platform !== 'win32';
    const child = spawn('git', args, {
      cwd,
      windowsHide: true,
      // a group of its own: a timeout stops git's helpers too (git-remote-https holds the pipes)
      detached: posix,
      // never a question: no terminal prompt, no credential window (the repository is public)
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    let done = false;
    const settle = (finish: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      finish();
    };
    child.stdout.on('data', (d) => (out += String(d)));
    child.stderr.on('data', (d) => (err += String(d)));
    const timer = setTimeout(() => {
      try {
        if (child.pid && posix) process.kill(-child.pid, 'SIGKILL');
        else if (child.pid)
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
      } catch {
        /* gone already */
      }
      child.stdout.destroy();
      child.stderr.destroy();
      settle(() => reject(Object.assign(new Error(GIT_TIMED_OUT), { timedOut: true })));
    }, ms);
    child.on('error', (e) => settle(() => reject(e)));
    child.on('close', (code) =>
      settle(() =>
        code === 0
          ? resolve(out.trim())
          : reject(new Error(gitError(err || out) || `git exited with ${code}`)),
      ),
    );
  });

/** The .git folder of `root` — a worktree's .git is a file naming it. */
function gitDirOf(root: string): string | null {
  const dotGit = path.join(root, '.git');
  try {
    if (fs.statSync(dotGit).isDirectory()) return dotGit;
    const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, 'utf8'));
    return m ? path.resolve(root, m[1].trim()) : null;
  } catch {
    return null;
  }
}

/**
 * Where the copy stands against its upstream — one local `git status` (its branch headers carry
 * the upstream and the counts), no network: a control window asks once a minute, on the same
 * event loop as the hub.
 */
export function readGitSync(root: string, run: GitRunner = runGit): Standing {
  const text = run(['status', '--porcelain=v2', '--branch', '--untracked-files=no'], root);
  let branch: string | null = null;
  let upstream: string | null = null;
  let counts: [number, number] | null = null;
  let dirty = false;
  for (const line of (text ?? '').split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim();
      branch = head && head !== '(detached)' ? head : null;
    } else if (line.startsWith('# branch.upstream ')) {
      upstream = line.slice('# branch.upstream '.length).trim() || null;
    } else if (line.startsWith('# branch.ab ')) {
      const m = /^# branch\.ab \+(\d+) -(\d+)/.exec(line);
      if (m) counts = [Number(m[1]), Number(m[2])];
    } else if (line.trim() && !line.startsWith('#')) dirty = true;
  }
  const dir = gitDirOf(root);
  const midway =
    !!dir &&
    ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'].some((f) =>
      fs.existsSync(path.join(dir, f)),
    );
  return {
    branch,
    // an upstream without counts is gone (its branch deleted after a merge, then pruned)
    upstream: branch && counts ? upstream : null,
    ahead: counts?.[0] ?? 0,
    behind: counts?.[1] ?? 0,
    clean: text !== null && !dirty,
    midway,
  };
}

/**
 * Why a pull would not be a plain fast-forward — a dictionary key with {branch}/{upstream} — or
 * null when it can go.
 */
export function whyNotPull(s: Standing): string | null {
  if (!s.branch) return N_('Копію відкрито не на гілці — отримайте оновлення вручну');
  if (!s.upstream)
    return N_('Гілка {branch} не стежить за віддаленою — отримайте оновлення вручну');
  if (s.midway) return N_('Git саме зливає чи перебазовує — завершіть це вручну');
  if (!s.clean) return N_('Є незбережені зміни у файлах — отримайте оновлення вручну (git pull)');
  if (s.ahead > 0 && s.behind > 0)
    return N_('Гілка {branch} розійшлася з {upstream} — злийте зміни вручну');
  return null;
}

/** Another git program holds the repository a moment (GitHub Desktop fetching, say). */
const LOCKED = /\.lock'?: File exists|cannot lock ref|Unable to create '.*\.lock'/i;
/** Files the operator has, untracked, where the incoming commits put theirs. */
const IN_THE_WAY = /untracked working tree files would be overwritten/i;

export interface GitSyncOptions {
  root: string;
  run?: GitRunner;
  runAsync?: AsyncGitRunner;
  now?: () => number;
  /** how long a fetch or a merge may take */
  fetchMs?: number;
}

/** How often the copy fetches by itself, with «Перевіряти оновлення» on. */
export const FETCH_EVERY_MS = 12 * 60 * 60 * 1000;

export function createGitSync(o: GitSyncOptions) {
  const run = o.run ?? runGit;
  const runAsync = o.runAsync ?? runGitAsync;
  const now = o.now ?? Date.now;
  const fetchMs = o.fetchMs ?? 60_000;
  let fetchedAt: number | null = null;
  let error: string | null = null;
  let detail: string | null = null;
  let busy: Promise<unknown> | null = null;
  // a control window asks once a minute: one git call, kept a few seconds — and dropped whenever
  // what it says changes (a fetch, a failure)
  let cached: { at: number; value: GitSync } | null = null;

  const state = (fresh = false): GitSync => {
    if (!fresh && cached && now() - cached.at < 5000) return cached.value;
    const s = readGitSync(o.root, run);
    const value = { ...s, fetchedAt, error, detail, why: whyNotPull(s) };
    cached = { at: now(), value };
    return value;
  };
  const failed = (key: string, d: string | null) => {
    error = key;
    detail = d;
    cached = null;
  };
  /** What a git failure means for the operator: a key, and git's own words when they help. */
  const meaning = (e: unknown, otherwise: string): [string, string | null] => {
    const msg = (e as Error).message ?? '';
    if ((e as { timedOut?: boolean }).timedOut) return [GIT_TIMED_OUT, null];
    if (LOCKED.test(msg))
      return [N_('Інша програма git саме працює з цією копією — спробуйте за хвилину'), null];
    if (IN_THE_WAY.test(msg)) {
      const files = msg.replace(/^.*?merge:\s*/i, '').trim();
      return [
        N_(
          'Нові файли з віддаленої гілки збігаються з вашими неврахованими — приберіть їх або отримайте оновлення вручну',
        ),
        files || null,
      ];
    }
    return [otherwise, msg || null];
  };

  /** One git job at a time: a fetch and a pull never overlap. */
  const one = <T>(job: () => Promise<T>): Promise<T> => {
    const p = (busy ?? Promise.resolve()).then(job, job);
    busy = p
      .catch(() => undefined)
      .finally(() => {
        if (busy === p) busy = null;
      });
    return p;
  };

  async function fetchUpstream(): Promise<boolean> {
    const s = readGitSync(o.root, run);
    if (!s.upstream) return false;
    try {
      // the remote of the branch's upstream (`.` for a local one: nothing to fetch); a transfer
      // that stalls below 1 KB/s for 30 s gives up
      await runAsync(
        ['-c', 'http.lowSpeedLimit=1000', '-c', 'http.lowSpeedTime=30', 'fetch', '--quiet'],
        o.root,
        fetchMs,
      );
      fetchedAt = now();
      error = null;
      detail = null;
      cached = null;
      return true;
    } catch (e) {
      failed(...meaning(e, N_('Не вдалося отримати зміни з віддаленого репозиторію')));
      return false;
    }
  }

  return {
    state,
    /** Fetch now («Перевірити зараз»); `due`: only when the last fetch is older than 12 h. */
    fetch(due = false): Promise<GitSync> {
      if (due && fetchedAt !== null && now() - fetchedAt < FETCH_EVERY_MS)
        return Promise.resolve(state());
      return one(async () => {
        await fetchUpstream();
        return state(true);
      });
    },
    /**
     * «Отримати оновлення»: fetch, then fast-forward to the upstream. Resolves how many commits
     * came; throws an Error whose message is a dictionary key (with vars) when it can't.
     */
    pull(): Promise<{ pulled: number; state: GitSync }> {
      const refuse = (key: string, s: { branch: string | null; upstream: string | null }) =>
        Object.assign(new Error(key), {
          vars: { branch: s.branch ?? '', upstream: s.upstream ?? '' },
        });
      return one(async () => {
        const before = readGitSync(o.root, run);
        const why = whyNotPull(before);
        if (why) throw refuse(why, before);
        if (!(await fetchUpstream()))
          throw refuse(error ?? N_('Не вдалося отримати оновлення'), before);
        // the fetch may have shown that the branches went apart
        const s = readGitSync(o.root, run);
        const whyNow = whyNotPull(s);
        if (whyNow) throw refuse(whyNow, s);
        if (s.behind === 0) return { pulled: 0, state: state(true) };
        try {
          await runAsync(['merge', '--ff-only', '--quiet', '@{upstream}'], o.root, fetchMs);
        } catch (e) {
          const [key, d] = meaning(e, N_('Не вдалося отримати оновлення'));
          failed(key, d);
          throw refuse(key, s);
        }
        return { pulled: s.behind, state: state(true) };
      });
    },
  };
}
