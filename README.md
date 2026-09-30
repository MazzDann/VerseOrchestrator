# VerseOrchestrator

[![CI](https://github.com/MazzDann/VerseOrchestrator/actions/workflows/ci.yml/badge.svg)](https://github.com/MazzDann/VerseOrchestrator/actions/workflows/ci.yml)

A local web app for **multi-screen reading of structured texts**. You navigate and
search in the main window; selected passages appear on a separate `/presenter` output
window you place on a second monitor, with state synced live between the windows.
Viewers can follow along on their phones, and a speaker can step through the show from
their own phone.

The primary content is the **Bible** (MyBible modules), but the model — _containers →
sections → numbered units_ (books → chapters → verses) with full-text search — applies
to any structured book (reference works, normative documents, manuals). The interface
is Ukrainian and English; search is case- and diacritic-insensitive and handles any module
language (Ukrainian, English, Greek, Hebrew, Arabic, and others).

## Download

Download the archive for your system; each link gets the latest release:

| System                | Download                                      |
| --------------------- | --------------------------------------------- |
| Windows 10/11 (x64)   | [`VerseOrchestrator-windows-x64.zip`][win]    |
| macOS (Apple Silicon) | [`VerseOrchestrator-macos-arm64.zip`][mac]    |
| Linux (x64)           | [`VerseOrchestrator-linux-x64.tar.gz`][linux] |

[win]: https://github.com/MazzDann/VerseOrchestrator/releases/latest/download/VerseOrchestrator-windows-x64.zip
[mac]: https://github.com/MazzDann/VerseOrchestrator/releases/latest/download/VerseOrchestrator-macos-arm64.zip
[linux]: https://github.com/MazzDann/VerseOrchestrator/releases/latest/download/VerseOrchestrator-linux-x64.tar.gz

Checksums, release notes, and earlier versions are on the [Releases](https://github.com/MazzDann/VerseOrchestrator/releases) page.

To start the app:

1. Extract the archive to a folder of your choice.
2. Put MyBible modules (`*.SQLite3`) in its `modules/` folder.
3. Run `start.cmd` (Windows), `start.command` (macOS), or `./start.sh` (Linux).

The archive carries its own Node.js and needs no internet connection. On the first start,
Windows may warn about a file from the internet: confirm to run it. macOS blocks
`start.command` the first time, because the app isn't signed by Apple: open **System
Settings** > **Privacy & Security**, select **Open Anyway** next to `start.command`, and
confirm (before macOS 15, right-click the file and select **Open**).

The app tells you when a newer version is out and installs it when you click **Завантажити
оновлення** and then **Перезапустити й оновити** (**Налаштування вигляду** > **Застосунок** >
**Оновлення**); if the new version doesn't start, the previous one comes back. `data/` and
`modules/` stay as they are. Versions before 1.0.0 update by hand: replace the `app/` folder
with the one from a newer archive.

## Documentation

The user documentation is in English and Ukrainian, like the app, and the control window's
**Help** button opens it in the interface language:

- [Quick start](docs/en/quickstart.md) ([українською](docs/quickstart.md)): start the app
  and show the first verse on a second screen.
- [Documentation](docs/en/README.md) ([українською](docs/README.md)): finding and showing
  text, songs, the running order, slide appearance, viewers' phones, the speaker's remote,
  installation, troubleshooting, and a reference of hotkeys, launcher options, and files.

The developer documentation is in English: [docs/dev](docs/dev/README.md) covers the
architecture and how to contribute.

## Feedback

Found a bug or have an idea? Open the
[feedback form](https://github.com/MazzDann/VerseOrchestrator/issues/new?template=feedback.yml),
or click **Надіслати відгук** / **Send feedback** in the app (**Settings** > **App**, or the
command palette): it fills in the version, the system, and the interface language.
Feedback is public — don't include personal data.

## Run from the source

To run the app from a clone of this repository, you need **Node.js 22.18 or later**
(24 LTS recommended) and MyBible modules. A release archive or a portable copy carries its
own Node.js.

1. Put your MyBible Bible modules (`*.SQLite3`) into a `modules/` folder at the
   repository root, for example `modules/KJV+.SQLite3`.
2. Start the launcher for your system:

   | System  | Launcher                                                                                                                      |
   | ------- | ----------------------------------------------------------------------------------------------------------------------------- |
   | Windows | Double-click `start.cmd`.                                                                                                     |
   | macOS   | Double-click `start.command`. If macOS blocks it, allow it in **System Settings** > **Privacy & Security** > **Open Anyway**. |
   | Linux   | Run `./start.sh` in a terminal.                                                                                               |

On the first start, the launcher installs the dependencies (`npm ci`, internet
required), builds the library `data/library.db` from `modules/`, and builds the
interface; that takes a few minutes. Later starts take a second or two. When the app is
ready, the launcher opens the control window in your browser and prints two addresses:

- `http://localhost:4747`: the control window, on this computer.
- `http://LAN_IP:4747/follow`: the page for phones on the same Wi-Fi network, where
  `LAN_IP` is this computer's address in the network.

To stop the app, close the launcher's window or press Ctrl+C in it. A desktop shortcut,
starting with the computer, a portable copy, and switching the app off completely are
described in [Встановлення й запуск](docs/install.md).

In a terminal, you can pass these options to any launcher (for example,
`.\start.cmd --check` or `./start.sh --no-browser`), or to `npm start -- --check`:

| Option         | Effect                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `--no-browser` | Doesn't open the browser.                                                                                                |
| `--port N`     | Uses port `N` for this start instead of the one in the settings (4747 by default).                                       |
| `--check`      | Reports Node.js, the dependencies, the library, the interface, and the port, and what a start would do. Changes nothing. |
| `--off`        | Switches the app off completely: stops it and removes the autostart entry.                                               |
| `--app`        | Opens the control window as a window of its own, without tabs or an address bar (Chrome or Edge).                        |
| `--shortcut`   | Creates a desktop shortcut that starts the app with `--app`, then exits.                                                 |

## Modules and copyright

The repository doesn't ship modules: they are large and have their own licensing. You
provide them in the standard **MyBible** `.SQLite3` format, which the MyBible app's
module catalog offers. Next to Bible translations, the library also imports Strong's
dictionaries (`*.dictionary.SQLite3`), cross-references (`*.crossreferences.SQLite3`),
and commentaries (`*.commentaries.SQLite3`) for the «Стронг» and «Контекст» tabs, and
songs from song bundles (`data/songs/*.vosongs`, one file per songbook), which the app
makes from `.pptx` files: imported in the control window or put in `songs/`.

Many translations — and most song collections — are still under copyright. Use them for
your own reading and projection, don't redistribute them, and prefer public-domain texts
(for example, KJV, Luther 1912, Segond 1910, Kulish 1905, or the Vulgate) for demos and
screenshots. The serverless build (`npm run build:static`) carries the full text of every
imported module, so don't publish it with copyrighted translations inside. `.gitignore`
keeps modules, the library, segments, songs, and builds out of the repository.

The builder looks for modules in this order: `$MODULES_DIR`, `modules/`,
`data/modules/`, `old/MyBible/`.

## Development

To work on the code with live reload, install the dependencies, build the library, and
run the development servers:

```bash
npm ci
npm run build:library   # MyBible *.SQLite3 -> data/library.db
npm run dev             # API server :8787 + web app :5173
```

Open <http://localhost:5173>. `npm run build:library:watch` rebuilds the library as you
add modules; the running server picks up the new data without a restart. No C/C++ build
tools are needed: `better-sqlite3` ships prebuilt binaries for Windows, macOS, and Linux.

Before you commit, run the checks:

```bash
npx prettier --check builder/src shared/src web/src server/src
npx eslint .
npx vitest run
```

Also run `npx tsc -b` in each of `web/`, `server/`, and `builder/`, and build the web app
with `npm run build --workspace @vo/web`, as CI does.

### Scripts

| Script                        | Purpose                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `npm start`                   | the launcher, as `start.cmd` / `start.sh`                                           |
| `npm run portable`            | a copy that runs without Node.js or internet (`-- --with-library` adds the library) |
| `npm run standby`             | only the background service behind the **Запуск за адресою** switch                 |
| `npm run app`                 | build the interface and run it from the server on :8787, in one process             |
| `npm run dev`                 | server + web app with live reload                                                   |
| `npm run build:library`       | (re)build `data/library.db` from `modules/`                                         |
| `npm run build:library:watch` | rebuild the library on module changes                                               |
| `npm run build:segments`      | `data/segments/*.vodb.gz`, the library for the in-browser engines                   |
| `npm run build:static`        | a serverless build in `web/dist`, with the segments                                 |
| `npm run bench:db`            | benchmark the database engines on the same queries                                  |
| `npm test`                    | Vitest                                                                              |
| `npm run lint`                | ESLint (TypeScript, React hooks, jsx-a11y)                                          |
| `npm run format`              | Prettier                                                                            |

## Architecture

An npm-workspaces monorepo on Node.js 24 and TypeScript:

- **`shared/`**: library queries written once for every database engine, the SQLite and
  Postgres schemas, MyBible conversion rules, segments, song bundles and the `.pptx`
  reader, text normalization, and reference parsing.
- **`builder/`**: converts MyBible modules and the song bundles into one merged
  `data/library.db` with a normalized full-text index, and into segments for the
  browser. It runs as its own process, so the app never freezes.
- **`server/`**: Express + better-sqlite3, a read-only library API on the loopback
  interface only, and a WebSocket hub for viewers' phones and speaker remotes. The
  launcher and the standby service (`launcher.ts`, `standby.ts`) run it and forward
  phones' connections to it.
- **`web/`**: Vite + React + Mantine. The control window (`/`), output windows
  (`/presenter`, `/stage`), phone pages (`/follow`, `/remote`), settings (`/settings`),
  and benchmarks (`/bench`). The windows sync over a window bus (`lib/bus.ts`); in-browser
  engines (SQLite-WASM, PGlite) in `lib/engine/` serve the library without a server.

## License

VerseOrchestrator is licensed under the GNU General Public License v3.0. See
[LICENSE](LICENSE).
