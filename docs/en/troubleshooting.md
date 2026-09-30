# Troubleshooting

[Українською](../troubleshooting.md) · English

This page is for whoever starts the app and runs the show: what the messages of the start
window, the control window, and the phones mean and what to do about them. The sections are
named the way the problem shows on screen.

## The start window

### “Node.js not found” or “Node.js … is too old”

The app needs Node.js 22.18 or later. Install Node.js 24 LTS from
[nodejs.org](https://nodejs.org) or with a command:

- on Windows, in PowerShell: `winget install OpenJS.NodeJS.LTS`;
- on macOS: `brew install node`;
- on Linux: with your distribution's package or through
  [nvm](https://github.com/nvm-sh/nvm).

Then start the app again. The archive and a portable copy don't need Node.js.

### “Couldn't install the dependencies”

On the first start from a clone of the repository, the app downloads its parts from the
internet. Check the connection and start the app again. To a computer without the internet,
bring a [portable copy](install.md#make-a-portable-copy).

### “The SQLite module doesn't load”

When the Node.js version changes, the app rebuilds the SQLite module itself. If the message
stays, run `npm ci` in the app's folder and start the app again.

### “No library” or “Couldn't build the library”

“No library” means there are no MyBible modules in the `modules/` folder. The app starts,
but without texts: the control window shows “No library yet” and what to do. Put
`*.SQLite3` modules into `modules/` and click **Rescan modules** there — no need to restart
the app. See also [Add texts and songs](install.md#add-texts-and-songs).

If the library couldn't be built, the start window shows the reason above. The message
`library.bibles is null ("all") but the modules folder has … such files` means there are
more than 60 modules of one kind: list the files you need in `data/settings.json` →
`library`.

### “Port 4747 is taken by another program”

Another program already holds the app's address. Start the app with another port — in a
terminal in the app's folder:

- on Windows: `.\start.cmd --port 4748`;
- on macOS and Linux: `./start.sh --port 4748`.

To change the port for good, open **Settings** → **App** in the control window and change
the **Port**.

### The browser didn't open by itself

Open the control window's address from the start window in a browser, for example
`http://localhost:4747`.

### The start file opened no control window

A control window is open already: the start file and the shortcut then switch to it (on
Windows) or say that it is open, instead of opening a second one. Look for the window titled
“VerseOrchestrator — control”. To open another control window anyway, start the app with
`--new-window`.

## Presentation windows

### The presentation window doesn't open

The browser blocks pop-ups for the app's address. The app then says “Couldn't open the
window (check the pop-up blocker)” or “The browser blocked the window — allow pop-ups for
this site”. Allow pop-ups for the app's address in the site settings — the icon to the left
of the address — and open the window again.

### The presentation window opens on the wrong screen

To open windows on the screen you choose, the browser needs the “Window management”
permission. If the permission is denied, the **Output windows** panel says “Access to the
screens is denied”. To allow it:

1. Click the icon to the left of the control window's address.
2. Allow “Window management” for this site.
3. Reload the control window and open the presentation window again.

Chrome and Edge can open windows on the screen you choose.

### “Presentation 1: couldn't draw the slide”

The presentation window couldn't draw the slide and kept the previous one on screen, or, if
that failed too, a black screen. The viewers won't see a white window. The window draws the
next slide as usual. Show the slide again or choose another one. If the notification
repeats, save the text after “Reason:” for the developer.

If the reason is “a slide of unknown shape”, a window of another version of the app sent the
slide. Reload all the app's windows: the control window and the presentation windows.

### “Presentation 1: couldn't go full screen”

The browser didn't let the presentation window go full screen when the control window
asked — from the **Output windows** panel or with **Open in full screen**. This happens when
other windows hide the presentation window. Press F in the presentation window itself, or
click in it.

## The control window

### “Another control window runs the show”

Only one control window runs the show — see
[If several control windows are open](show-text.md#if-several-control-windows-are-open).

### “Remotes and viewers' phones listen to the control window in another browser”

The app is open in two browsers, for example in Chrome and Edge. Remotes and viewers' phones
follow the control window in the other browser, and from here the show reaches only this
browser's output windows. To make the remotes and phones follow this window, click
**Listen here**. To keep only that other window, close this one: **Close this window**. The
browser closes this way only a window the shortcut or the start file opened; close a tab
yourself (Ctrl+W, on macOS ⌘W).

### “No connection to the app's server”

The control window lost the connection to the app: remotes and viewers' phones can't hear
it, and the output windows keep working. Check that the start window is open. As soon as the
app runs again, the connection comes back by itself in a few seconds.

### The Strong's or Context tab is empty

The library lacks the modules they need. Put a Strong's dictionary (`*.dictionary.SQLite3`),
cross-references (`*.crossreferences.SQLite3`), or commentaries (`*.commentaries.SQLite3`)
into the `modules/` folder and click **Rescan modules** in **Settings** → **App**.

### “The passage is unavailable — the translation changed”

A passage in the [running order](running-order.md) refers to a translation that is no longer
in the library, for example after a rescan with other modules. Remove that item and add the
passage again.

### F5, F3, or F4 don't work on a Mac

On a Mac keyboard, the F keys work together with Fn. Instead, press ⌘↩ (**To screen**), ⌘F
and ⇧⌘F (search), and ⌘K (the command palette).

## Phones

### A phone doesn't open the page

See [If a phone doesn't open the page](viewers.md#if-a-phone-doesnt-open-the-page).

### The remote shows “The remote is unavailable”

The remote's code no longer works: the operator revoked the remote or reissued its code, or
the app restarted with **Remember remotes after a server restart** turned off. To give the
speaker a new code, create a remote or reissue the code — see
[Manage remotes](remote.md#manage-remotes).

## If nothing helped

Send feedback: tell what happened, or suggest how to make it better. To send feedback:

1. In the control window, open **Settings** → **App** and click **Send feedback**. Or press
   Ctrl+K (on macOS, ⌘K) and choose **Send feedback**.
2. The feedback form opens on GitHub with the app's version, the system and browser, and
   the interface language already filled in. It needs a GitHub account.
3. Choose what it is — a bug, an idea, or a question — describe it, and submit it.

Feedback is public, so don't include personal data, passwords, or remote codes. The app
sends nothing itself: you fill in the form and submit it.

## What's next

- [Install and start](install.md): requirements, modules, shortcut, portable copy.
- [VerseOrchestrator documentation](README.md): the contents of all parts.
