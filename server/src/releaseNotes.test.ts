import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/** .github/scripts/release-notes.mjs: what a GitHub release page says (0.14.1, 1.6.4). */
const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.github/scripts/release-notes.mjs',
);

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true, maxRetries: 5 });
});

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_NOSYSTEM: '1',
};

/** A repository with one commit and the annotated tag `tag` whose message is `message`. */
function repoWithTag(tag: string, message: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vo-notes-'));
  dirs.push(dir);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' });
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'a commit');
  fs.writeFileSync(path.join(dir, 'tag-message.md'), message);
  // as docs/dev/contributing.md says: --cleanup=whitespace keeps the body's Markdown headings
  git('tag', '-a', tag, '--cleanup=whitespace', '-F', 'tag-message.md');
  return dir;
}

const notes = (dir: string, tag: string) =>
  execFileSync(process.execPath, [SCRIPT, tag], { cwd: dir, encoding: 'utf8' });

describe('release notes', () => {
  it('the tag’s first line in bold, then its body — what the release brings (1.6.4)', () => {
    const dir = repoWithTag(
      'v1.6.4',
      '1.6.4 — upd2: the release page says what is new\n\n' +
        '#### Що нового\n\n- Перелік змін.\n\n#### What’s new\n\n- The list of changes.\n',
    );
    const out = notes(dir, 'v1.6.4');
    expect(
      out.startsWith('**1.6.4 — upd2: the release page says what is new**\n\n#### Що нового\n'),
    ).toBe(true);
    expect(out).toContain('#### What’s new\n\n- The list of changes.');
    // the body comes before how to download, untouched
    const body = out.indexOf('- The list of changes.');
    expect(body).toBeGreaterThan(0);
    expect(body).toBeLessThan(out.indexOf('### Завантажте для своєї системи'));
    expect(out).toContain('### Download for your system');
  });

  it('a beta tag (1.8.11): its notes, said to be a beta', () => {
    const dir = repoWithTag('v1.8.12-beta.1', '1.8.12-beta.1 — Media: photos from a folder\n');
    const out = notes(dir, 'v1.8.12-beta.1');
    expect(out.startsWith('**1.8.12-beta.1 — Media: photos from a folder**\n\nБета-версія:')).toBe(
      true,
    );
    expect(notes(repoWithTag('v1.8.12', '1.8.12 — Media\n'), 'v1.8.12')).not.toContain(
      'Бета-версія',
    );
  });

  it('a tag with one line only: no empty block', () => {
    const dir = repoWithTag('v1.6.1', '1.6.1 — upd2: «Отримати оновлення»\n');
    expect(notes(dir, 'v1.6.1')).toMatch(
      /^\*\*1\.6\.1 — upd2: «Отримати оновлення»\*\*\n\n### Завантажте для своєї системи/,
    );
  });
});
