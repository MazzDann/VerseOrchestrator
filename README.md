# VerseOrchestrator

A local web app for **multi-screen reading of structured texts**. You navigate and
search in the main window; selected passages appear on a separate `/presenter` output
window you place on a second monitor, with state synced live between the windows.

The primary content is the **Bible** (MyBible modules), but the model — _containers →
sections → numbered units_ (books → chapters → verses) with full-text search — applies
to any structured book (reference works, normative documents, manuals). The UI is
Ukrainian; search is case- and diacritic-insensitive and handles any module language
(Ukrainian, Russian, English, Greek, Hebrew, Arabic, …).

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
`myb.1gb.ru`, `mybible.infoo.pro`, `mph4.ru`, served as `http://<host>/m/<file>.zip`;
the older `mybible.i-t.kz` mirror is dead — expired TLS, dropped from the registry).

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
- **Send / blank:** **На екран** (or F5/F2) projects the selection. Two blank levels:
  **Затемнити** hides only the text but keeps the background; **Чорний екран** (`.`)
  paints pure black. A header **LIVE** toggle makes the presenter follow the selection
  live; with it off, navigation only updates the preview and you push with F5/F2.
- **Songs («Пісні»):** project text from a `.pptx` collection (e.g. song lyrics) —
  search by number or title, then tap a stanza. A faithful / plain-text toggle
  reproduces the original slide look.
- **Text («Текст»):** project a free-text slide — announcements, notes, any custom
  text — with an optional title; recent texts are kept for one-click reuse.
- **Study:** clickable Strong's numbers (**«Стронг»** tab) → definition + concordance
  ("where else is this word used"); the **«Контекст»** tab shows cross-references and
  commentary for the selected verse. These appear when a module that carries them is
  installed.

### Hotkeys (control window)

Defaults — rebindable in **Settings → Вигляд → Гарячі клавіші**.

| Key                   | Also on macOS | Action                                    |
| --------------------- | ------------- | ----------------------------------------- |
| `→` / `↓`             |               | next verse                                |
| `←` / `↑`             |               | previous verse                            |
| `PageDown` / `PageUp` |               | next / previous verse (presenter clicker) |
| `F5` / `F2`           | `⌘↩`          | push the selection to the screen          |
| `F3` / `Ctrl+F`       | `⌘F`          | search the current module                 |
| `F4`                  | `⇧⌘F`         | search all modules                        |
| `Ctrl+K` / `Ctrl+P`   | `⌘K`          | command palette                           |
| `b`                   |               | blank the screen (keeps the background)   |
| `.`                   |               | black screen (pure black, ignores the bg) |
| `Esc`                 |               | clear the screen / close search           |

On a Mac the F-keys need `Fn`, so the `⌘` chords are defaults there too; the F-keys keep
working. A keymap saved before 1.4.12 gets the `⌘` chords for every action you haven't
rebound. On a focused verse, `Enter` projects that verse and `Ctrl`/`Shift`+`Enter` adds it
to the selection (on a Mac, `⌘↩` projects the selection).

### Speaker remote (phone)

A speaker can drive the show from their own phone, on the same Wi-Fi network as the
control window. You decide, per remote, what that phone may do; everything else stays
in the control window. The phone never sees settings.

To pair a phone:

1. In the header, click **Пульт доповідача**.
2. Enter a name, tick what the remote may do, and click **Створити пульт**.
3. Let the speaker scan the QR code with the phone's camera. The code is shown only
   once; **Перевипустити код** issues a new one and cuts the old phone off.

Each remote has its own permissions. To change them later, click the **Дозволи** icon
on the remote's row; the open phone updates at once, without a new QR code:

| Permission     | On the phone                                                        |
| -------------- | ------------------------------------------------------------------- |
| **Далі**, **Назад** | step through the show (also a Bluetooth clicker: arrows, `PageDown`/`PageUp`, `Space`) |
| **На екран**   | put the control window's preview — or the speaker's own choice — on screen (`Enter` on a clicker) |
| **Вибір віршів** | choose translations, book, chapter, and verse on the phone         |
| **Пісні**      | find a song by number or words and choose a stanza                  |
| **Затемнити**, **Чорний екран** | blank the screen                                   |

A new remote gets **Далі**, **Назад**, and **Затемнити**; the others start off.

When the speaker chooses a verse or a stanza on the phone, it becomes their own
preview (**Ваш передпоказ**) and **Далі** walks it; your selection in the control
window doesn't change. What you see:

- **Пульт** monitor, under **На екрані**: the speaker's preview while it differs from
  the screen, with buttons to put it on screen, to jump your own selection there, or to
  hide it.
- **На екрані … · пульт «NAME»**: the speaker's remote put the current slide there.
  Your selection stops following the screen until you project it again (**На екран**
  or `F5`).

To offer the speaker what you have prepared, click the send icon on the **Прев’ю**
monitor. The phone shows **Оператор пропонує** with **У передпоказ** and **На екран**;
nothing changes until the speaker taps one. The icon appears for remotes that are
online and allowed to choose that kind of content.

**Відкликати** on a remote's row disconnects that phone immediately. To keep remotes
paired across server restarts, turn on **Пам’ятати пульти після перезапуску сервера**;
only a hash of each code is stored, in `data/secrets.json`.

## Scripts

| Script                        | Purpose                                                             |
| ----------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                 | run server + web together                                           |
| `npm run build:library`       | (re)build `data/library.db` from `modules/`                         |
| `npm run build:library:watch` | rebuild on module changes                                           |
| `npm test`                    | Vitest: normalization (Cyrillic, tag stripping) + reference parsing |
| `npm run lint`                | ESLint (TypeScript, React hooks, jsx-a11y)                          |
| `npm run format`              | Prettier                                                            |

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
