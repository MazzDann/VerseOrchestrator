# Install and start

[Українською](../install.md) · English

This page is for whoever prepares the computer for a show: where to get the app and what it
needs, where to put texts and songs, how to start it with a shortcut or with the computer,
which browser to open it in, how to update it, make a portable copy, and switch everything
off. The first start step by
step is in the [Quick start](quickstart.md), and the development setup in the
[project README](../../README.md).

## Download the app

To install the app:

1. Download the archive for your system — the links lead to the latest release:

   | System                | Archive                                       |
   | --------------------- | --------------------------------------------- |
   | Windows 10/11 (x64)   | [`VerseOrchestrator-windows-x64.zip`][win]    |
   | macOS (Apple Silicon) | [`VerseOrchestrator-macos-arm64.zip`][mac]    |
   | Linux (x64)           | [`VerseOrchestrator-linux-x64.tar.gz`][linux] |

2. Extract the archive to a folder of your choice, for example Documents.

[win]: https://github.com/MazzDann/VerseOrchestrator/releases/latest/download/VerseOrchestrator-windows-x64.zip
[mac]: https://github.com/MazzDann/VerseOrchestrator/releases/latest/download/VerseOrchestrator-macos-arm64.zip
[linux]: https://github.com/MazzDann/VerseOrchestrator/releases/latest/download/VerseOrchestrator-linux-x64.tar.gz

At the top of the app's folder there is only what you need:

| What                                        | What for                                                     |
| ------------------------------------------- | ------------------------------------------------------------ |
| `start.cmd`, `start.command`, or `start.sh` | starting the app                                             |
| `modules/`                                  | MyBible modules: the app builds its library from them        |
| `data/`                                     | your data: settings, library, songs                          |
| `ЯК ЗАПУСТИТИ.txt`, `HOW TO START.txt`      | how to start and switch off the app                          |
| `app/`                                      | the app itself: code, Node.js, packages, the built interface |

The archive already contains Node.js, so there is nothing else to install. The archives'
checksums are in the `SHA256SUMS.txt` file on the
[latest release's page](https://github.com/MazzDann/VerseOrchestrator/releases/latest), and
earlier versions are on the [Releases](https://github.com/MazzDann/VerseOrchestrator/releases)
page.

You can also run the app from a clone of the repository — developers do; see the
[project README](../../README.md#run-from-the-source).

## Requirements

- Windows 10 or 11, macOS on Apple Silicon, or Linux (x64). From a clone of the repository
  the app runs on other processors too.
- Chrome or Edge. The app works in other browsers but doesn't open presentation windows on
  the screen you choose.
- Disk space: about 70 MB for the archive and 175 MB for the extracted app, plus the
  library. A library of 20 translations with dictionaries takes about 500 MB.
- To run from a clone of the repository: Node.js 22.18 or later (24 LTS is better) and an
  internet connection on the first start, when the app downloads its parts. The archive and
  a portable copy need neither Node.js nor the internet.

## Add texts and songs

The app reads texts from MyBible modules — `*.SQLite3` files. To add texts:

1. Copy the modules into the app's `modules/` folder:
   - Bible translations, for example `KJV.SQLite3`;
   - optionally, a Strong's dictionary (`*.dictionary.SQLite3`), cross-references
     (`*.crossreferences.SQLite3`), and commentaries (`*.commentaries.SQLite3`) for the
     **Strong's** and **Context** tabs.
2. Start the app. On start it builds the library from the modules — the
   `data/library.db` file.

To add modules later, copy them into `modules/`, then in the control window open
**Settings** → **App** and click **Rescan modules**.

Put only the modules you need in `modules/`. If there are more than 60 modules of one kind,
for example a whole MyBible catalog, the app doesn't take them into the library until you
list the files you need in `data/settings.json` → `library` (the `bibles`, `dictionaries`,
`commentaries`, and `crossreferences` lists).

Songs are kept in bundles in the `data/songs/` folder. You can add them from `.pptx` files
with the import in the control window or through the `songs/` folder — see
[Songs and custom text](songs-and-text.md#import-songs-from-pptx-files).

## Start the app

To start the app, in its folder:

- on Windows, double-click `start.cmd`;
- on macOS, double-click `start.command`;
- on Linux, run `./start.sh` in a terminal.

The first start of the app from the archive builds the library from the modules — from a
few seconds to a few minutes. From a clone of the repository, the first start also installs
the parts and builds the interface. Later starts take a second or two. The start window must
stay open while the app runs.

On the first start from the archive, the system may warn about a file from the internet:

- on Windows, confirm running `start.cmd`;
- on macOS, the app isn't signed by Apple, so the system blocks `start.command`. Open
  **System Settings** → **Privacy & Security**, click **Open Anyway** next to
  `start.command`, and confirm. Before macOS 15, it's enough to right-click the file and
  choose **Open**. After that the file opens with a normal double-click.

When the app is running already and a control window is open, starting it again doesn't
open a second control window: it switches to that one (on Windows; on macOS when it is in
Chrome, Edge, Brave, Chromium, Arc or Safari) or says that it is open. In those browsers, the
first time, macOS asks whether to let Terminal control the browser the control window is open
in — click **Allow**. If on macOS the control window is open in Firefox or a browser built on
it, such as Zen or LibreWolf, nothing is asked: the start file brings that browser forward but
can't pick the window or tab. If the permission wasn't given, see [The start file doesn't
switch to the control window on
macOS](troubleshooting.md#the-start-file-doesnt-switch-to-the-control-window-on-macos).

If the start window shows a message marked ✗ or !, see [Troubleshooting](troubleshooting.md).

## Choose the interface language

The app's interface is in Ukrainian and English. Until you choose a language, the app opens
in the browser's language: Ukrainian or English, whichever the browser ranks higher. If the
browser asks for neither, for example only German, the app opens in English.

To change the language, open **Settings** → **App** in the control window and in the
**Interface language** field choose **Українська** or **English**. The choice is saved with
the app's other settings.

The start window speaks the same language from the next start of the app. Viewers' phones
and the speaker remote show their browser's language, as does the page that appears while
the app starts.

## Choose the browser

The start file opens the control window in the system browser. To open it in another
browser — for example, when the system browser is for work and you run the show in Chrome —
open **Settings** → **App** in the control window and in the **Open the control window in…**
field choose the browser. The list holds **System browser** and the browsers the app found on
this computer. The choice works from the next start: the start file and the shortcut open the
control window there.

To open the control window as a separate window — without tabs or an address bar — turn on
**As a separate window**. Browsers built on Chromium can: Chrome, Edge, Brave, Arc, Opera,
Vivaldi, and Chromium. Firefox, Zen, and Safari open the control window as a regular window,
so the switch is off there. A separate window has one tab, so a second start brings exactly
that window forward more reliably.

To move to the other browser at once, without waiting for the next start, click **Open in …
now** under the switch — for example, **Open in Zen now**. The control window opens in the
chosen browser (as a separate window if that is on) and takes charge: remotes and viewers'
phones now listen to it. This window says **The control window moved to …** — close it with
**Close this window** or leave it. Presentation and stage windows opened from this browser stay
here, so if one is open, the app asks first: click **Switch to …** and open the presentation
again in the new control window. The button isn't there when **System browser** is chosen, or
in the chosen browser once the app itself has opened a control window there — by the start
file, the shortcut, or this button. In a window you opened yourself by its address, the button
may stay even in the chosen browser: browsers on one engine often introduce themselves the same
way (Firefox, Zen, and LibreWolf, for one), and a second control window there does no harm.

If the chosen browser is no longer on the computer, the start file opens the control window
as with **System browser** — in the system browser, and from the shortcut in Chrome or Edge as
a separate window — and says so in the start window. The choice is kept in
`data/settings.json` → `launch`.

Under the field you see the app's version — the same one stands at the top of **Settings**. A
copy from the repository says `dev` and the branch there, for example
`dev 1.4.4.try3 (feat/x · 36f9ddd)`.

## Create a shortcut

The shortcut starts the app and opens the control window as a window of its own — without
tabs or an address bar: in the browser chosen in **Open the control window in…** if it is
built on Chromium; with **System browser**, in Chrome or Edge. Firefox, Zen, and Safari open
it as a regular window.

To create a shortcut, open **Settings** → **App** in the control window and click
**Create shortcut**. The shortcut appears on the desktop; on Linux, in the applications menu
too.

## Start with the computer

For the app to be ready as soon as the computer is on, open **Settings** → **App** in the
control window and turn on **Start on open**.

Then a small process starts with the computer and holds the app's address. The app starts as
soon as someone opens that address — in the computer's browser or from a phone. If nobody
uses the app for 15 minutes, it stops, and the address keeps waiting.

The standard address is `http://localhost:4747`. To change the port, type a new one in the
**Port** field below the switch, click **Change**, and confirm. The new port also applies to
starting with `start.cmd`, `start.command`, or `./start.sh`.

## Update the app

The app finds out about new versions itself: every 12 hours it asks GitHub whether a newer
one is out. When there is one, a dot appears on the **Settings** button, and in
**Settings** → **App** → **Updates** you see the new version's number and a **What’s new**
link. **Check now** asks at once. To keep the app from contacting GitHub, turn off
**Check for updates**. The app downloads and installs a new version only when you click the
button.

Versions 0.x are previews: while you have a 0.x version, the app offers previews too; from
1.0.0 on, only regular releases.

### Update the app from the archive

To update an app installed from the archive:

1. In **Settings** → **App** → **Updates**, click **Download the update**. The app downloads
   the new version's archive, checks its checksum, and extracts it next to the `app/`
   folder. The show goes on meanwhile.
2. If output windows are open, close them: the app doesn't restart during a show.
3. Click **Restart and update**. In a few seconds the app starts in the new version: the
   control window reloads by itself, and phones reconnect.

The new version runs in the background, as with **Start on open**: the start window closes
with the old version. To stop the app, click **Switch off completely** in **Settings** →
**App**.

If the new version doesn't answer within a minute and a half, the app brings back the
previous one and says so in **Updates**, with the details in `data/updates/swap.log`. The
previous version stays in the `app.previous/` folder until the next update, and a version
that didn't start, in `app.failed/`.

An update doesn't touch the `data/` and `modules/` folders: settings, the library, songs,
and modules carry over to the new version.

### Go back to the previous version

If something is wrong with a new version, go back to the one you had before the update:

1. Close the output windows: the app doesn't restart during a show. If an update is
   unpacking, wait until it is ready. A download still under way stops.
2. In **Settings** → **App** → **Updates**, click **Go back to version …** with the previous
   version's number, then **Bring back** in the confirmation.

In a few seconds the app runs the previous version, and **Updates** says “Went back to
version …”. The version you left stays next to it, so you can go to it with the same button.
If the previous version doesn't start, the app keeps the one you had.

Versions before 1.4.0 can't go back to another version yet. If you went back to such a
version, it has no **Go back to version …** button, and **Updates** says “Updated from … to
…”. To switch to the newer version again, update the app as described above: this needs the
internet. If you went back from version 1.4.1 or later and it is still the latest, you don't
have to download it again: **Updates** offers **Restart and update** at once. After going
back from 1.4.0, the archive has to be downloaded again.

### Update by hand

Versions before 1.0.0 can't update themselves. To update such a version, or if the update
with the button failed:

1. Stop the app: click **Switch off completely** or close the start window.
2. Download the new version's archive from the
   [Releases](https://github.com/MazzDann/VerseOrchestrator/releases) page and extract it
   to a separate folder.
3. Replace your app's `app/` folder with the `app/` folder of the new version.

### Update a clone of the repository

To update a clone of the repository, get the new changes (`git pull`). An app started with
the start file notices the new code within a minute: a dot appears on the **Settings** icon,
and **Settings** → **App** → **Updates** shows a **Restart** button. Click it: the app
installs the new parts, rebuilds the interface, and starts again in the background, and the
page reloads by itself. The start window closes meanwhile. While output windows are open,
the button is unavailable.

After the restart the app runs in the background, as with **Start on open**. To stop it,
click **Switch off completely** in **Settings** → **App**. You can also do without the
button: stop the app and run the start file again.

## Save a backup

A backup is one `.zip` file of what you set up and gathered in the app: the slide look,
presets, hotkeys, bookmarks and history, the running order and saved programs, song bundles,
and images. Modules and the library aren't in it: their large files are in the `modules/`
folder. Neither are the speaker remotes or this computer's start settings: the port, the
browser, and the choice of modules.

To save a backup, in the control window open **Settings** → **App**, and in the **Backup**
section click **Save a backup**. The browser downloads a file such as
`VerseOrchestrator-backup-2026-10-01-1405.zip`. Keep it outside the app's folder, for
example on a flash drive. Safari on a Mac may unpack the downloaded file into a folder: then
compress that folder in Finder (**Compress**), and the app takes that file too.

To restore a backup on this or another computer:

1. In the same section, click **Restore from a backup…** and choose the backup file.
2. Check what it holds: the app shows the backup's date, the number of programs and
   running-order items, the song bundles, and the number of images. Nothing changes until you
   click **Restore**.
3. Click **Restore**. The control window reloads with the restored state.

Other open control windows take the restored settings at once. While a backup is saved or
restored, changes to songs and images wait until it ends.

The app moves the state the backup replaced into a folder of its own in `data/backups/`: the
song and image files stay there as they were. For a day after the restore you can bring it
back: click **Go back to how it was** in the **Backup** section and confirm with
**Bring back**. What was changed after the restore is kept in `data/backups/` too.

A backup can be up to 1 GB. If the images take more, the app says so and makes no backup.

## Make a portable copy

A portable copy is a folder with the app and Node.js inside. You run it on another computer
with the same system and processor without installing anything and without the internet,
for example from a flash drive.

To make a portable copy, run in the app's folder:

```bash
npm run portable
```

It needs Node.js from [nodejs.org](https://nodejs.org) or installed with fnm or nvm: that
Node.js goes into the copy. Node.js from Homebrew depends on Homebrew's libraries, so its copy
wouldn't start, and `npm run portable` refuses to make it.

The copy appears in the `portable/` folder, in a subfolder named with the version, system,
and processor, for example `VerseOrchestrator-VERSION-windows-x64`. The appearance settings
and the running order go into it. To add the library too, run
`npm run portable -- --with-library`.

At the top of the copy there is only what a user needs:

| What                                        | What for                                                              |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `start.cmd`, `start.command`, or `start.sh` | starting: the file for the system the copy was made for               |
| `modules/`                                  | MyBible modules: the app builds its library from them                 |
| `data/`                                     | your data: settings, library, songs                                   |
| `HOW TO START.txt`                          | how to start and switch off the copy (in the start window's language) |
| `app/`                                      | the app itself: code, Node.js, packages, the built interface          |

To update the copy to a new version, replace its `app/` folder with the `app/` folder of a
new copy. The `data/` and `modules/` folders stay as they are.

## Switch the app off completely

Closing the start window stops the app, but with **Start on open** turned on, the address
keeps waiting and starts with the computer. To switch everything off, open **Settings** →
**App** in the control window, click **Switch off completely…**, and confirm with
**Switch off**. To also erase the app's data in the browser, first select **Also erase the
browser's data**.

If the control window doesn't open, run `.\start.cmd --off` in a terminal in the app's
folder (on macOS and Linux, `./start.sh --off`). This switches off everything except the
browser's data.

After that nothing runs in the background or starts with the computer, and you can delete
the app's folder.

## What's next

- [Quick start](quickstart.md): the first verse on a second screen.
- [Troubleshooting](troubleshooting.md): messages of the start window and other problems.
- [VerseOrchestrator documentation](README.md): the contents of all parts.
