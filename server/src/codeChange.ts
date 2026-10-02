import fs from 'node:fs';
import path from 'node:path';
import { runGit, versionLabel, type GitRunner } from './versionLabel.js';

/**
 * upd2 (1.6.0, the user's ask): a copy run from a git checkout notices that its code changed under
 * it — `git pull`, another branch — and «Оновлення» offers «Перезапустити»: the launcher starts
 * again in the background (npm ci if needed, the UI build) and the page reloads itself. A release
 * copy updates through installer.ts instead; nothing here changes the app.
 *
 * The commit the server started with against the one checked out now — uncommitted edits don't
 * count (`npm run dev` is the way to run code being edited, and it has no watch: index.ts makes
 * one only for an app a waiter started, where git answered). Asked when a control window looks,
 * at most every few seconds: one `git rev-parse` (≈ 10–30 ms).
 */
export interface CodeState {
  /** the checked-out commit is not the one this server started with */
  changed: boolean;
  /** what the running copy calls itself («dev 1.5.0 (main · ccb51f7)») */
  from: string;
  /** what the copy on disk would call itself — `from` while nothing changed */
  to: string;
}

/** The commit checked out in `root`, or null when git says nothing. */
export function headCommit(root: string, run: GitRunner = runGit): string | null {
  const out = run(['rev-parse', 'HEAD'], root);
  return out && /^[0-9a-f]{40,64}$/.test(out) ? out : null;
}

const packageVersion = (root: string): string => {
  try {
    return String(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version);
  } catch {
    return '';
  }
};

export interface CodeWatchOptions {
  root: string;
  /** what the server called itself at the start */
  label: string;
  /** the commit it started with (headCommit at the start) */
  commit: string | null;
  run?: GitRunner;
  now?: () => number;
  /** how long one answer counts as fresh */
  freshMs?: number;
}

export function createCodeWatch(o: CodeWatchOptions) {
  const run = o.run ?? runGit;
  const now = o.now ?? Date.now;
  let at = -Infinity;
  let last: CodeState = { changed: false, from: o.label, to: o.label };
  return {
    /** `fresh`: ask git now (after a pull), not the answer of a few seconds ago */
    state(fresh = false): CodeState {
      if (!fresh && now() - at < (o.freshMs ?? 5000)) return last;
      at = now();
      const commit = headCommit(o.root, run);
      const changed = !!o.commit && !!commit && commit !== o.commit;
      // a pull may bring a new version too: the label is read anew from package.json
      const to = changed ? versionLabel(o.root, packageVersion(o.root) || '?', run) : o.label;
      last = { changed, from: o.label, to };
      return last;
    },
  };
}
