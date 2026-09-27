import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Agent worktrees (.claude/worktrees/*) hold whole copies of the repo — their tests
    // are theirs to run. old/ is the archived previous app.
    exclude: [...configDefaults.exclude, '.claude/**', 'old/**'],
  },
});
