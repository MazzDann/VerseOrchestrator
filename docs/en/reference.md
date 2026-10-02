# Reference

[Українською](../reference.md) · English

This page is a reference for the operator and whoever sets up the app: hotkeys, the
buttons at the top of the control window, start options, the app's files, addresses, and
ports. How to do a task is in the parts of the [documentation](README.md).

## Hotkeys

These are the control window's standard keys. You can change them in **Settings** →
**Hotkeys**; the tooltips on the buttons show the current keys.

| Action                               | Windows and Linux | Also on macOS          |
| ------------------------------------ | ----------------- | ---------------------- |
| **Next** — the next verse            | →, ↓, PageDown    |                        |
| **Back** — the previous verse        | ←, ↑, PageUp      |                        |
| **Preview: next** — the preview only | Ctrl+→, Ctrl+↓    | ⌥→, ⌥↓ instead of Ctrl |
| **Preview: back** — the preview only | Ctrl+←, Ctrl+↑    | ⌥←, ⌥↑ instead of Ctrl |
| **To the chorus** — in a song        | C                 |                        |
| **To screen**                        | F5, F2            | ⌘↩                     |
| **Hide text**                        | B                 |                        |
| **Black screen**                     | . (period)        |                        |
| **Cover** — logo and text            | L                 |                        |
| **Countdown: pause / resume**        | T                 |                        |
| **Clear** — take the slide off       | Esc               |                        |
| **Bring back to the screen**         | Ctrl+Z            | ⌘Z                     |
| **Search (current)**                 | F3, Ctrl+F        | ⌘F                     |
| **Search (all)**                     | F4                | ⇧⌘F                    |
| **Command palette**                  | Ctrl+K, Ctrl+P    | ⌘K                     |

On macOS the F keys work together with Fn, so there are ⌘ keys by default as well.

Other keys of the control window:

- Digits outside text fields — go to a place in the open book: `16`, `3:16`, `3:16-18`,
  then Enter; ⌘↩ (Ctrl+Enter) or **To screen** goes there and shows it at once; Esc
  cancels. More in [Find a text](find-text.md).
- Enter on a verse in the list — show that verse on screen.
- Space on a verse — choose it; Ctrl+Space, Shift+Space, Ctrl+Enter, or Shift+Enter — add
  the verse to the selection or remove it from it.
- Ctrl+Enter (on macOS, ⌘↩) in the **Text to screen** panel — show the custom text.
- Alt+↑ and Alt+↓ scroll the list you are in (otherwise the verse list) without changing
  the selection. On macOS, ⌥ with the arrows is **Preview: next** and **Preview: back**.
- While a song is open, the arrow keys, PageUp, and PageDown step through its slides, and
  **Preview: next** and **Preview: back** do nothing.

In the presentation window:

| Key                        | Action               |
| -------------------------- | -------------------- |
| F or a click in the window | full screen and back |
| →, ↓, PageDown             | **Next**             |
| ←, ↑, PageUp               | **Back**             |
| . (period)                 | **Black screen**     |
| B                          | **Hide text**        |
| L                          | **Cover**            |

These keys work by their place on the keyboard, whatever the layout: with the Ukrainian one,
F types «а», L types «д», and the period key types «ю». They are always these: changes in
**Settings** → **Hotkeys** apply only in the control window.

In the **Stage** window, F makes the window full screen. The keys of a Bluetooth clicker on
the speaker's phone are described in [Speaker remote](remote.md#what-the-speaker-sees).

## Buttons at the top of the control window

The buttons at the top of the control window are grouped from left to right:

| Group                | Buttons                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| **Navigation**       | the navigation menu (in a narrow window), **Search**, the **Go to** field                             |
| **Sources**          | **Songs**, **Custom text**, **Images**, **Running order**                                             |
| **Windows**          | **Presentation window**, **Stage**, **Output windows**, **Viewers**, **Speaker remote**               |
| **Output to screen** | **Live**, **To screen**, **Hide text**, **Black screen**, **Cover**, **Countdown**, **Speaker timer** |
| **App**              | **Settings**, **Help**, **Light theme** or **Dark theme**, **Preview panel** (in a narrow window)     |

When the buttons don't all fit in the window, they make room one step at a time:

1. The app's name hides.
2. **Presentation window** and **Hide text** keep only their icons.
3. The **Go to** field and the **Live** caption hide.
4. The buttons of the **App** group, then **Windows**, then **Sources** move into the
   **More** menu — the button with three dots at the top right.

The **Output to screen** group, **Search**, and the navigation menu always stay in place.
In the narrowest window, **To screen** keeps only its icon too.

If the buttons still don't fit (a very large font in the browser and a small window), the
**More** button moves in front of the **Output to screen** group so that it stays in view,
and the row of buttons scrolls sideways. The buttons cut off at the right also work with
their keys.

In the **More** menu, the buttons keep their names, icons, and keys; an open panel has a
check mark. **Presentation window** is called **Open the presentation window** there. The
menu opens with a click, or with Enter or Space on the **More** button; choose an item with
the arrow keys and Enter, and close the menu with Esc. While the menu is open, keys act only
in it: the arrow keys don't move through the verses, and Esc doesn't take the slide off the
screen.

When the **Go to** field is hidden, type the numbers right in the control window, for
example `3:16`, or type the reference in the command palette (Ctrl+K, on macOS ⌘K). See
[Find a text](find-text.md).

## Start options

You pass options to the start file in a terminal, in the app's folder, for example
`.\start.cmd --check` on Windows or `./start.sh --no-browser` on macOS and Linux.

| Option         | What it does                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------- |
| `--no-browser` | Doesn't open the browser — for a computer without a screen, or to open the address yourself.      |
| `--port N`     | Starts on port `N` instead of the port from the settings (4747 by default) — this time only.      |
| `--check`      | Checks Node.js, the parts, the library, the interface, and the port, and changes nothing.         |
| `--off`        | Switches the app off completely, like **Switch off completely…**, except the browser's data.      |
| `--app`        | Opens the control window as a window of its own, without tabs or an address bar (Chromium-based). |
| `--shortcut`   | Creates a desktop shortcut that starts the app with `--app`, and exits.                           |
| `--new-window` | Opens another control window even when one is open already.                                       |

## Files and folders

Everything the app remembers is in its folder:

| Path                 | What's there                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| `modules/`           | MyBible modules (`*.SQLite3`) the library is built from                                             |
| `songs/`             | songs in presentations (`*.pptx`) that the app moves into a bundle                                  |
| `data/songs/`        | song bundles (`*.vosongs`)                                                                          |
| `data/images/`       | images to show: two files for each and `index.json`; in `.trash/`, the last twenty deleted          |
| `data/backups/`      | the state that restoring a backup or **Go back to how it was** replaced                             |
| `data/library.db`    | the library: translations, dictionaries, commentaries, songs, and the search index                  |
| `data/ui-state.json` | appearance settings, presets, hotkeys, the running order, and programs                              |
| `data/settings.json` | server options: the port and the waiting time (`standby`), remotes (`remotes`), modules (`library`) |
| `data/secrets.json`  | hashes of the remotes' codes                                                                        |
| `data/standby.log`   | the address waiter's log                                                                            |
| `portable/`          | portable copies made with `npm run portable`                                                        |

The browser keeps only copies of the settings and the library cache. **Switch off
completely…** with **Also erase the browser's data** selected erases them.

For the app to take its data from other places, set environment variables before starting
it:

| Variable        | What it sets                                      | By default                                                |
| --------------- | ------------------------------------------------- | --------------------------------------------------------- |
| `VO_DATA_DIR`   | the data folder                                   | `data/`; in a portable copy, `data/` next to `app/`       |
| `LIBRARY_DB`    | the library file                                  | `data/library.db`                                         |
| `MODULES_DIR`   | the folder with MyBible modules                   | `modules/`; in a portable copy, `modules/` next to `app/` |
| `SONGS_DIR`     | the folder with `.pptx` songs                     | `songs/`                                                  |
| `VO_UPDATE_URL` | the address where the app asks about new versions | the project's release list on GitHub                      |

The start window speaks the language chosen in the control window. To give it another one,
start the app with the `VO_LANG=en` or `VO_LANG=uk` variable.

## Addresses and ports

The app answers at these addresses (port 4747 is the default; the **Port** field in
**Settings** → **App** changes it):

| Address                           | What it opens                           |
| --------------------------------- | --------------------------------------- |
| `http://localhost:4747/`          | the control window                      |
| `http://localhost:4747/presenter` | the presentation window                 |
| `http://localhost:4747/stage`     | the **Stage** window                    |
| `http://localhost:4747/settings`  | the settings in a separate window       |
| `http://COMPUTER_IP:4747/follow`  | the page for viewers' phones            |
| `http://COMPUTER_IP:4747/remote`  | the speaker remote (with the QR's code) |

Replace `COMPUTER_IP` with the computer's IP address in the Wi-Fi network — the start window
prints it.

The control window, the settings, and the remotes take commands only from this computer or
from a phone with a remote's code. Phones on the network reach the app only through the
address with port 4747; the app's server itself listens only to this computer.

## What's next

- [Install and start](install.md): requirements, modules, shortcut, portable copy.
- [VerseOrchestrator documentation](README.md): the contents of all parts.
