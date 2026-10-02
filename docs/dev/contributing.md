# Contributing

This page is for developers who change VerseOrchestrator: how to set up the project, the
checks every commit passes, and the conventions for branches, versions, commits, UI, and
docs. How the code is organized is in [Architecture](architecture.md).

## Set up

You need Node.js 24 (22.18 at least) and, to see real texts, some MyBible modules in
`modules/` (see [Modules and copyright](../../README.md#modules-and-copyright)). The tests
don't need modules: they build small in-memory fixtures. Version managers such as fnm,
nodenv, and asdf pick Node 24 from `.node-version`.

To set up and run the development servers:

```bash
npm ci
npm run build:library   # modules/*.SQLite3 -> data/library.db
npm run dev             # API server on :8787, web app on :5173
```

Open <http://localhost:5173>. Vite reloads the web app; `tsx watch` restarts the server.

## Run the checks

Before every commit, run:

```bash
npx prettier --check builder/src shared/src web/src server/src
npx eslint .
npx vitest run
```

Then run `npx tsc -b` in each of `web/`, `server/`, and `builder/`, and build the web app
as CI does:

```bash
npm run build --workspace @vo/web
```

Every web build stamps `web/dist/.vo-version` with the version and a hash of the interface's
sources (`server/src/uiStamp.ts`). `npm start`, `start.command`, and the standby waiter
compare the stamp with the code, so after a pull or a checkout they rebuild the interface
instead of serving the old one. `npm run portable` copies the Node.js it runs on: use one
from nodejs.org, fnm, or nvm, not Homebrew's.

Tests sit next to the code as `*.test.ts`. Library queries are tested on an in-memory
SQLite fixture (`server/src/library.test.ts`), and `builder/src/pglite.test.ts` checks
that SQLite and Postgres return the same results. For a bug fix, add a test that fails
without the fix.

## Measure before you optimize

The hybrid database and window synchronization are the project's research topics, so
performance claims need numbers. Measure before you change a hot path and after, and
put both in the commit message. The `/bench` page compares the database engines and the
window-sync transports, and `npm run bench:db` benchmarks the server's queries.

## Branches, versions, and commits

- **Branches.** `main` always holds a version that works, and GitHub protects it: changes
  arrive only through pull requests whose **Checks** passed, and nobody pushes to it
  directly. Do each change on its own branch — `feat/NAME` for a feature, `fix/NAME` for a
  fix — and open a pull request to `main`. Merge it once the checks pass. A merge commit
  keeps the branch's commits, with their measurements, in the history.
- **Versions.** `MAJOR.MINOR.PATCH`, starting with `1.0.0`, the first regular release.
  Work goes by themes: a theme is a `MINOR` line (`1.6.x`), and each feature, or group of
  features, that doesn't depend on the others is a release of its own in that line —
  `1.6.0`, `1.6.1`, `1.6.2` — and so is a fix. `MAJOR` is for changes that older data or
  settings can't follow. The version changes only when a release is made; commits on a
  branch leave it alone. Releases 1.0.0–1.5.0 used `PATCH` for fixes only and `MINOR` for
  features; before 1.0.0 every commit on `main` was a release of its own, `0.MINOR.PATCH`.
- **Dev copies.** A copy that runs from a git checkout — a clone or a worktree, not a
  release's `app/` — names itself after git, so you can tell which build you are testing.
  `dev 1.4.2.try7 (mac-test · 20dd850)` means 7 commits after the tag `v1.4.2`, on the
  branch `mac-test`, at the commit `20dd850`. A `+` after the commit means uncommitted
  changes to tracked files, and right on a tag there is no `.tryN`. The start file prints the
  label on its first line, and the control window shows it at the top of **Налаштування
  вигляду** (and of the `/settings` window), under **Відкривати вікно керування в…** and in
  **Застосунок** → **Оновлення** (`server/src/versionLabel.ts`, `label` in `GET /api/health`).
  A release shows `VerseOrchestrator X.Y.Z` there. When the app is already running, the start file asks it for its label
  and says «Працює інша збірка: …» if it differs — for example, the app was started before
  you switched branches. Then run `--off` and start again. A dev copy started by the start
  file also notices new code by itself (1.6.0, `server/src/codeChange.ts`): once the
  checked-out commit is not the one it started with, **Оновлення** offers **Перезапустити**,
  which starts the launcher again in the background (`--after PID`: it waits for the old
  waiter to end, then does what the start file does) and reloads the page. Without git (or, on a Mac, with
  only the `/usr/bin/git` stub and no developer tools) or without a release tag, the label is
  `dev X.Y.Z` from `package.json`. The label only reads git: `describe` and `status` write nothing to `.git`. A dev copy
  started by the start file does more since 1.6.1 (`server/src/gitSync.ts`): with
  `updates.check` on it fetches its upstream (`git fetch --quiet`) 15 s after the start and
  then every 12 h, and on **Перевірити зараз**; on **Отримати оновлення** (`POST
  /api/update/pull`) it fast-forwards (`git merge --ff-only @{upstream}`) — never on a dirty
  tree, a detached HEAD, a branch with no upstream, a merge or rebase under way, or a diverged
  branch. Releases and portable copies show the plain version and never call git. Whatever
  compares versions — the update check, the UI stamp, the update swap — uses `version`, never
  the label.
- **Commit messages.** The subject is `Theme: summary`, for example
  `Hub: back within 2 s after an outage`. The body explains why, and gives the
  measurements.
- **Releases.** Once the pull requests for a release are merged:

  1. On a branch `release/X.Y.Z` from `main`, set `"version"` in all five `package.json`
     files (the root, `shared`, `builder`, `server`, and `web`) and run
     `npm install --package-lock-only`.
  2. Commit with the subject `X.Y.Z — Theme: summary`, where the summary says what the
     release brings, and merge it through a pull request like any change.
  3. On the updated `main`, tag the merge commit and push the tag. The tag message's first
     line is the release commit's subject; its body, in Markdown, says what the release
     brings — in Ukrainian, then in English — and goes on the release page as written
     (`--cleanup=whitespace` keeps lines that start with `#`, such as Markdown headings):

     ```bash
     git tag -a vX.Y.Z --cleanup=whitespace -F tag-message.md
     git push origin vX.Y.Z
     ```

     CI builds the packages and publishes the release — see [Releases](#releases).

## Releases

GitHub Actions (`.github/workflows/ci.yml`) runs the checks above on every push to `main`
and on every pull request. A pushed tag `vX.Y.Z` makes a release when `X.Y.Z` is the
`version` in the tagged commit's `package.json` and the commit is on `main`; otherwise the
run fails and says why:

1. On Windows, macOS, and Linux runners, `npm run portable -- --release` builds a copy with
   its own Node.js — no settings of the build machine and never the library, whose
   translations have their own licences.
2. The copies are archived as `VerseOrchestrator-windows-x64.zip`,
   `VerseOrchestrator-macos-arm64.zip`, and `VerseOrchestrator-linux-x64.tar.gz`. The names
   carry no version, so `…/releases/latest/download/<file>` stays the same link.
3. A GitHub release for the tag gets the archives, `SHA256SUMS.txt`, and notes from
   `.github/scripts/release-notes.mjs`: the tag message's first line in bold, its body, then
   how to download, start, and update. Versions `0.x` come out as pre-releases.

To try the packages without a release — for example, a pull request's branch — run the
workflow by hand: **Actions** → **CI** → **Run workflow**, and pick the branch; the archives
are in the run's artifacts for seven days.

## UI conventions

- **Copy.** The UI is written in Ukrainian: sentence case, polite imperative («Додайте…»,
  «Перевірте…»). An empty state or an error says what to do next and names the exact
  button. The same action has the same name in the toolbar, the command palette, and
  notifications. Every string also needs its English version — see
  [Interface text and languages](#interface-text-and-languages).
- **Tokens.** Operator UI uses Mantine theme tokens and CSS variables, never raw hex
  colors, and must work in both the dark and the light scheme. Red (`live`) and amber
  (`cue`) mean on-screen and preview state only.
- **Sizes.** Components are `sm` by default and `xs` in toolbars. Every icon-only button
  has a tooltip and an `aria-label`.
- **Overlays.** Don't use Mantine `Modal` or Spotlight: their content doesn't render in
  this Vite setup. Use `FloatingPanel` for tool windows, and `Popover` or `Menu` for
  small choices.
- **Long lists.** Build them from plain elements with the `vo-*` classes in
  `web/src/styles.css`, and virtualize them with `VirtualList`. Lists of Mantine buttons
  took 4–5 s to render.
- **Slides.** Everything the audience sees comes from `Appearance` and the slide
  template, never from the Mantine theme. A new visual option is a new `Appearance`
  field with a default, a clamp in `sanitizeAppearance`, and a control in the matching
  section of `SettingsPanel`.

## Interface text and languages

The interface is Ukrainian and English. The Ukrainian stays in the code, and it is also the
key of the English version in one dictionary, `shared/src/i18n/en.ts`. The operator picks
the language in **Налаштування вигляду** → **Застосунок**; a phone or a browser that has
saved nothing takes its own language.

To add or change interface text:

1. Write the Ukrainian through one of these functions from `web/src/i18n.ts`:
   - `tr('Текст')`, or `tr('На екрані: {ref}', { ref })` with values in `{name}` places.
     Don't build the text from template literals: the whole sentence is the key.
   - `trn(n, '{n} пісню|{n} пісні|{n} пісень')` for a number: the three Ukrainian forms;
     the English entry has two, `'{n} song|{n} songs'`.
   - `trx('Додайте модуль {module} у папку…', { module: <code>…</code> })` when an element
     sits inside the sentence.
   - `N_('…')` or `Nn_('…|…|…')` to mark a string in a table that is built when the module
     loads; translate it where it is shown, `tr(TABLE[key])`.
2. In a component that shows translated text, call `useLang()`: a language switch then
   renders it again.
3. Add the English to `shared/src/i18n/en.ts`, under the comment of its area.
4. Run `npx vitest run shared/src/i18n`.

The test in `shared/src/i18n/i18n.test.ts` scans every source file. It fails when a key has
no English entry, when the placeholders or plural forms differ, when an entry is no longer
used, or when Cyrillic stands outside a key or a comment. A line that keeps Ukrainian on
purpose — a regex, a stored name, a search query in a benchmark — ends with a comment
that says `i18n-ignore` and why.

Server messages are keys too. Mark them with `N_`, and pass values apart:
`new ApiError(409, N_('Порт {port} зайнятий…'), { port })` answers
`{ error, key, vars }`, which the page shows in its own language. The launcher, the waiter,
and the portable build run under plain Node and can't import `@vo/shared`
(`server/src/plainNode.test.ts` checks): they use `server/src/lang.ts`, which reads the
same dictionary.

## Docs

- User documentation lives in `docs/` in Ukrainian and in `docs/en/` in English, one page
  for one page, written in the Google developer documentation style. A page names the
  buttons as its language's interface does: take the English from `shared/src/i18n/en.ts`.
  Change both languages in the same commit. The **Help** button opens the index in the
  interface language (`web/src/lib/docs.ts`). Developer documentation lives in
  `docs/dev/`, in English.
- Change the docs in the same commit as the behavior they describe.
- Screenshots show public-domain text only, such as Kulish 1905 or the KJV, and never a
  remote's pairing QR code: it carries the remote's code. The English pages have their own,
  of the English interface, in `docs/img/en/`.

## Feedback

Reports and ideas come as issues through the feedback form,
`.github/ISSUE_TEMPLATE/feedback.yml` — bilingual, with the version, the system, and the
interface language filled in by the app's «Надіслати відгук» (`web/src/lib/feedback.ts`,
by the form fields' ids). The app sends nothing and holds no token: the person submits the
form on GitHub. A new field the app should fill needs an `id` in the form and a parameter
in `feedbackUrl`.

## Data and copyright

`modules/`, `data/`, `songs/`, and builds stay out of git (`.gitignore`). Many
translations and song collections are under copyright: don't commit them, and don't
publish a static build with copyrighted modules inside.
