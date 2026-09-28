import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Agent worktrees (.claude/worktrees/*) and portable copies (portable/*, 1.6.3) hold whole
    // copies of the repo — their tests are theirs to run. old/ is the archived previous app.
    exclude: [...configDefaults.exclude, '.claude/**', 'old/**', 'portable/**'],
  },
});
