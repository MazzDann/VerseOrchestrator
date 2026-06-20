# VerseOrchestrator

Local web app that reads Bible modules and projects selected verses onto a second
screen (presentation-style): you control from the main window, the output shows in a
separate `/presenter` window you place on another monitor — like presenting slides.

UI language is Ukrainian; the app handles any MyBible module (Ukrainian, Russian,
English, Greek, Hebrew, Arabic, …) and is case- and diacritic-insensitive in search.

## Prerequisites

- **Node.js 18+** (developed on Node 24 LTS). `npm` comes with it.
- No C/C++ build tools needed — `better-sqlite3` v12 ships prebuilt binaries for
  current Node versions on Windows/macOS/Linux.

## 1. Get Bible modules

The repository does **not** ship Bible modules (they are large and have their own
licensing). You provide them yourself, in the standard **MyBible** `.SQLite3` format:

1. Create a `modules/` folder at the repository root.
2. Put your MyBible Bible-text modules there, e.g. `modules/KJV+.SQLite3`,
   `modules/UKRK.SQLite3`. Commentaries/dictionaries/cross-references are ignored.

MyBible modules can be obtained via the MyBible app or its community module mirrors
(the catalog the app uses lives at `https://mybible.zone` and mirror hosts such as
`mybible.i-t.kz`, `myb.1gb.ru`, `mybible.infoo.pro`, `mph4.ru`, served as
`http://<host>/m/<file>.zip`).

The builder auto-detects the modules folder in this order: `$MODULES_DIR` →
`modules/` → `data/modules/` → `old/MyBible/`.

## 2. Install, build the library, run

```bash
npm install
npm run build:library   # MyBible *.SQLite3 -> data/library.db (merged + search index)
npm run dev             # API server :8787 + web app :5173
```

Open <http://localhost:5173>, pick one or more translations, navigate or search,
select verses, click **На екран**, and open the output window with **Показ**
(placed on a second monitor automatically in Chrome/Edge).

`npm run build:library:watch` rebuilds automatically as you add modules, without
blocking the running app (the server picks up the new data with no restart).

## Usage

- **Navigate:** pick translation(s) → filter/select a book → chapter → verses.
- **Search (F3 / Ctrl+F = current module, F4 = all modules):**
  - text, case/diacritic-insensitive, e.g. `любов`
  - reference, e.g. `Ів 3:16`, `Jn 3:16-18`, `бут 2 3`, `бут 2 3-5`, `бут 2`
- **Send / blank:** **На екран** projects the selection; **Затемнити** blanks it.

### Hotkeys (control window)

| Key | Action |
| --- | --- |
| `→` / `↓` | next verse | 
| `←` / `↑` | previous verse |
| `F3` / `Ctrl+F` | search current module |
| `F4` | search all modules |
| `b` | blank the screen |
| `Esc` | clear the screen / close search |

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | run server + web together |
| `npm run build:library` | (re)build `data/library.db` from `modules/` |
| `npm run build:library:watch` | rebuild on module changes |
| `npm test` | Vitest: normalization (Cyrillic, tag stripping) + reference parsing |
| `npm run lint` | ESLint (TypeScript, React hooks, jsx-a11y) |
| `npm run format` | Prettier |

## Architecture

A small npm-workspaces monorepo:

- **`builder/`** — separate process that converts MyBible `*.SQLite3` modules into a
  single merged `data/library.db` with a clean schema and a normalized,
  Cyrillic-safe FTS5 search index. Runs independently so the app never freezes.
- **`server/`** — Express + better-sqlite3 REST API over `data/library.db`.
- **`web/`** — Vite + React + Mantine. Control UI at `/`, presenter at `/presenter`;
  the two windows sync via `BroadcastChannel` (abstracted in `presenterBus`).
- **`shared/`** — text normalization (`stripTags`, `normalizeForSearch`) and
  reference parsing, used by builder and server.

`data/library.db`, `modules/`, and `old/` are git-ignored.

## Optional: visual/dev tooling

`.mcp.json` configures the [Playwright MCP](https://github.com/microsoft/playwright-mcp)
server for browser-based screenshots/testing during development (load it by restarting
your MCP client).
