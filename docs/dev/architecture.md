# Architecture

This page explains how VerseOrchestrator is put together: which package does what, which
processes run, how the library and the slides travel, and where to start reading for a
given change. It is a map, not a tour of every file: the two research topics of the project have
pages of their own — [Hybrid database](hybrid-db.md) and
[Window synchronization](window-sync.md).

## Packages

The repository is an npm-workspaces monorepo on Node.js 24 and TypeScript:

| Package                  | Role                                                                                                                                                                                                                                                          | Start with                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `shared/` (`@vo/shared`) | Library queries written once for every database engine, the SQLite and Postgres schemas, MyBible conversion rules, segments, song bundles and the `.pptx` reader (`src/songs/`), text normalization, reference parsing, the interface languages (`src/i18n/`) | `src/library/driver.ts`, `src/library/queries.ts`                  |
| `builder/`               | Converts MyBible modules and the song bundles into `data/library.db`, and the library into segments for the browser                                                                                                                                           | `src/build.ts`, `src/selection.ts`, `src/segments.ts`              |
| `server/`                | The library API (Express + better-sqlite3), the WebSocket hub for phones, and the launcher with its standby service                                                                                                                                           | `src/index.ts`, `src/live.ts`, `src/launcher.ts`, `src/standby.ts` |
| `web/`                   | The React app: the control window, output windows, phone pages, settings, benchmarks, and the in-browser database engines                                                                                                                                     | `src/pages/Control.tsx`, `src/presenterBus.ts`, `src/lib/`         |

## Processes

In production, the launcher starts three layers:

```text
start.cmd / start.command / start.sh
└── server/src/launcher.ts        installs dependencies, builds the library and the UI once
    └── standby waiter            server/src/standby.ts, on 0.0.0.0:4747
        └── app server            server/src/index.ts, on a free loopback port
```

- The **launcher** checks Node.js, runs `npm ci` when the lockfile's packages changed,
  rebuilds `better-sqlite3` for another Node.js ABI, builds the library from `modules/`
  when there is none, builds `web/dist` when its version stamp is stale, and then runs
  the standby waiter in the foreground.
- The **standby waiter** holds the app's address on every interface. The first request
  starts the app server; from then on it forwards HTTP and WebSocket traffic and appends
  the visitor's address to `X-Forwarded-For`. After 15 idle minutes (no requests and no
  open sockets) it stops the app and waits again.
- The **app server** serves the library API, the hub, and `web/dist`, on the loopback
  interface only. It exits when its parent goes away.

With **Запуск за адресою** switched on, the same waiter starts with the computer
(`server/src/autostart.ts`: a hidden `.vbs` in the Windows Startup folder, a macOS
LaunchAgent, or an XDG autostart entry on Linux).

In development, `npm run dev` runs the server on `127.0.0.1:8787` with `tsx watch` and
Vite on `:5173`. Vite's proxy forwards `/api`, including the `/api/ws` WebSocket, with
`xfwd`, so it plays the waiter's part.

### Why phones go through a forwarder

The app server listens on loopback only. A phone reaches it through the waiter (or Vite),
which appends the phone's address to `X-Forwarded-For`. `server/src/access.ts` takes the
client's address from that last hop only — earlier hops come from the client and can be
forged — and counts a request as local when the address belongs to this machine. So a
phone can't pose as the operator. Endpoints that change the app — remotes, settings,
the UI state, shutting down — also require the `X-VO-Control` header, which a page from
another origin can't send without a CORS preflight.

## How the library travels

```text
modules/*.SQLite3, data/songs/*.vosongs (← songs/*.pptx)
  └─ builder ──> data/library.db ──> app server (better-sqlite3, read-only) ──> HTTP API ──┐
               └─> data/segments/*.vodb.gz ──> browser worker (SQLite-WASM or PGlite) ─────┤
                                                                                          └─> web/src/api.ts
```

Both paths run the same queries from `shared/src/library/queries.ts` against a small
`SqlDriver` interface, and `web/src/api.ts` routes every read to the server or to the
local engine through the same response schemas. The data source is a setting
(**Джерело даних**), and the app falls back to the browser engine when there is no
server. The library API is read-only; `POST /api/rebuild` runs the builder as a separate
process, and the server picks up the new file without a restart. A song import is the
one write outside the builder: the browser reads the `.pptx` files, and
`POST /api/song-bundles/import` writes them into a bundle file and replaces the songs in
`data/library.db` (about 0.2 s for 479 songs). Segments are rebuilt only by
`npm run build:segments`.

## How a slide travels

```text
control window (/) ──window bus──> output windows (/presenter, /stage)
        │
        └──WebSocket /api/ws──> hub (server/src/live.ts) ──> viewers (/follow), remotes (/remote)
                                        ^
remotes' commands ──────────────────────┘ (forwarded to the control window, acked with its result)
```

- **Output windows** on the same computer get slides over the window bus
  (`web/src/lib/bus.ts`, used through `web/src/presenterBus.ts`): one ordered
  BroadcastChannel stream, backgrounds sent once as assets, and a small copy in
  localStorage for a cold start. Output windows announce themselves
  (`web/src/lib/outputs.ts`), and `web/src/lib/screens.ts` places them on screens with the
  Window Management API.
- **Phones** get the audience slide from the hub. Viewers are read-only sockets; a
  remote upgrades with its pairing token and may send the commands its pairing allows.
  The hub forwards them to the control window and acks the remote with the control
  window's real result. `web/src/lib/liveSocket.ts` reconnects after 0.5 s, 1 s, then
  every 2 s.
- **One control window leads.** `web/src/lib/leader.ts` elects it with a Web Lock; the
  others wait in the lock's queue and take over when it closes. **Взяти керування**
  steals the lock. Commands from output windows' keys and from remotes go through one
  pipeline (`web/src/lib/commands.ts`), with priorities (an open song before verse
  navigation) and ids, so a resent command applies once.

## How pages load

Every page — `/`, `/presenter`, `/stage`, `/follow`, `/remote`, `/settings`, `/bench` — is its
own chunk, loaded with `React.lazy` in `web/src/main.tsx`. The control window's start (the
server probe, the settings sync, the browser engine) is `web/src/lib/controlBoot.ts`, loaded
only on `/`. So a phone on `/follow` downloads the reader, not the control window's panels,
the database engine, or the benchmarks.

The build also writes a compressed copy of every text file next to it — `file.br` and
`file.gz` (the `precompress` plugin in `web/vite.config.ts`). The app server sends the copy
the browser accepts (`server/src/precompressed.ts`): brotli on `localhost`, gzip for a phone
on plain `http://` over Wi-Fi, where browsers don't offer brotli. The browser engines' `.wasm`
and `.data` files stay as they are: only the control window loads them, from the same
computer.

## State

| Where                               | What                                                                                                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zustand stores in `web/src/`        | `settingsStore.ts` (appearance, presets, hotkeys), `store.ts` (selection), `playlistStore.ts` (running order), `serverStore.ts`, `dataSourceStore.ts` |
| `data/ui-state.json`                | `vo:settings` and `vo:playlist`, synced both ways by `web/src/lib/uiState.ts` and `server/src/uiState.ts`; the later save wins                        |
| `data/settings.json`                | server options: the standby port and idle time, remembering remotes, the library's module selection                                                   |
| `data/secrets.json`                 | hashes of remote pairing codes (`server/src/remote.ts`)                                                                                               |
| Browser Cache Storage and IndexedDB | segment cache and PGlite snapshots for the in-browser engines                                                                                         |

Server data follows `VO_DATA_DIR` (default `data/`). A portable copy keeps the app in `app/`
with a marker, `.vo-portable`, that the launcher and the waiter turn into `VO_DATA_DIR` and
`MODULES_DIR` pointing next to it (`server/src/layout.ts`), so a new version replaces `app/`
alone.

## Where to start reading

| To change                                | Look at                                                                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a library query or the schema            | `shared/src/library/` (`queries.ts`, `schema.ts`, `postgres.ts`); tests in `server/src/library.test.ts` and `builder/src/pglite.test.ts`                   |
| how MyBible modules are converted        | `shared/src/library/mybible.ts`, used by the builder and the browser alike                                                                                 |
| how slides look                          | `Appearance` in `web/src/settingsStore.ts`, `web/src/components/SlideCanvas.tsx`, `SettingsPanel.tsx`                                                      |
| a hotkey                                 | `web/src/hotkeys.ts`                                                                                                                                       |
| a command from output windows or remotes | `web/src/lib/commands.ts`; for remotes also `server/src/remote.ts`, `server/src/live.ts`, `web/src/pages/Remote.tsx`, `web/src/components/RemotePanel.tsx` |
| output windows and screens               | `web/src/lib/outputs.ts`, `web/src/lib/screens.ts`, `web/src/openPresenter.ts`, `OutputsPanel.tsx`                                                         |
| starting, stopping, portable copies      | `server/src/launcher.ts`, `standby.ts`, `autostart.ts`, `portable.ts`, `shortcut.ts`                                                                       |

The launcher's files run before `npm ci`, straight from TypeScript through Node.js type
stripping: they import only `node:` modules and each other (with `.ts` extensions) and
use only erasable syntax.
