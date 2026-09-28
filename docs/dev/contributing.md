# Contributing

This page is for developers who change VerseOrchestrator: how to set up the project, the
checks every commit passes, and the conventions for versions, commits, UI, and docs. How
the code is organized is in [Architecture](architecture.md).

## Set up

You need Node.js 24 (22.18 at least) and, to see real texts, some MyBible modules in
`modules/` (see [Modules and copyright](../../README.md#modules-and-copyright)). The tests
don't need modules: they build small in-memory fixtures.

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

Then run `npx tsc -b` in each of `web/`, `server/`, and `builder/`.

Tests sit next to the code as `*.test.ts`. Library queries are tested on an in-memory
SQLite fixture (`server/src/library.test.ts`), and `builder/src/pglite.test.ts` checks
that SQLite and Postgres return the same results. For a bug fix, add a test that fails
without the fix.

## Measure before you optimize

The hybrid database and window synchronization are the project's research topics, so
performance claims need numbers. Measure before you change a hot path and after, and
put both in the commit message. The `/bench` page compares the database engines and the
window-sync transports, and `npm run bench:db` benchmarks the server's queries.

## Versions and commits

- **Versions.** `MAJOR.MINOR` is one themed milestone; `PATCH` goes up with every commit
  in it. Bump `"version"` in all five `package.json` files (the root, `shared`,
  `builder`, `server`, and `web`) and run `npm install --package-lock-only` in the same
  commit. Check `git log` first: another branch may have taken the next number.
- **Tags.** Tag every commit with an annotated tag: `git tag -a vX.Y.Z -m "…"`.
- **Commit messages.** The subject is `X.Y.Z — Theme: summary`, for example
  `1.5.29 — Hub: back within 2 s after an outage`. The body explains why, and gives the
  measurements.

## UI conventions

- **Copy.** The UI is Ukrainian: sentence case, polite imperative («Додайте…»,
  «Перевірте…»). An empty state or an error says what to do next and names the exact
  button. The same action has the same name in the toolbar, the command palette, and
  notifications.
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

## Docs

- User documentation lives in `docs/`, in Ukrainian, written in the Google developer
  documentation style. Developer documentation lives in `docs/dev/`, in English.
- Change the docs in the same commit as the behavior they describe.
- Screenshots show public-domain text only, such as Kulish 1905 or the KJV, and never a
  remote's pairing QR code: it carries the remote's code.

## Data and copyright

`modules/`, `data/`, `songs/`, and builds stay out of git (`.gitignore`). Many
translations and song collections are under copyright: don't commit them, and don't
publish a static build with copyrighted modules inside.
