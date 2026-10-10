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
Windows and macOS) or say that it is open, instead of opening a second one. Look for the
window titled “VerseOrchestrator — control”. To open another control window anyway, start
the app with `--new-window`. If on macOS the window didn't come forward, see [the next
section](#the-start-file-doesnt-switch-to-the-control-window-on-macos).

### The start file doesn't switch to the control window on macOS

The start file says that the control window is open, but that window doesn't come forward.
The reason is one of these:

- The control window is open in Firefox or a browser built on it, such as Zen or LibreWolf:
  the start window says “The control window is open in Firefox — showing Firefox.” (with that
  browser's name). That browser comes forward, but the start file can't pick a window or tab
  in it: if the control window is behind another of its windows, in another tab or minimized
  to the Dock, find it yourself. If the app is open in two such browsers, the start file
  can't tell which one has the control window and brings neither forward. For the start file
  to switch to the control window itself, open it in Chrome, Edge, Brave, Chromium, Arc or
  Safari.
- The control window is open in another browser the start file can't control. Look for the
  window titled “VerseOrchestrator — control” yourself.
- The start window says “macOS doesn't let Terminal control …” or “macOS doesn't let the
  app the start window runs in control …”: when macOS asked whether to let that app control
  the browser, the permission wasn't given. Open **System Settings** → **Privacy &
  Security** → **Automation**, under **Terminal** (or the app the start window runs in) turn
  on the browser named in the message, and start the app again.
- The start window says “If macOS asks for permission to control the browser, allow it and
  start again”: the browser didn't answer within 30 seconds — most often because the macOS
  request was left unanswered. Click **Allow** in it and start the app again.

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

### The presentation window disappears when you point at the Windows taskbar

When the pointer rests on a window thumbnail above a taskbar button, Windows shows only that
window and hides all the others — on every screen. This is the Windows “Peek” feature. The
projector then shows the desktop until the pointer moves away. It happens most often when you
go to the control window through the browser's thumbnails: the control, presentation and stage
windows are windows of one browser, so they share one taskbar button.

On Windows the app itself asks the system not to hide the presentation and stage windows. If
the presentation window still disappears, turn “Peek” off:

1. Press Win+R, type `SystemPropertiesPerformance`, and press Enter.
2. On the **Visual Effects** tab, clear **Enable Peek**.
3. Click OK. If nothing changes, sign out and sign in again.

If the presentation window doesn't come back as soon as you move the pointer away, it was
minimized: by a click in the far right corner of the taskbar or by Win+D. If you haven't clicked
anything since, press Win+D again — the windows come back. Otherwise bring it back with its
thumbnail on the browser's taskbar button, with Alt+Tab, or with **Go to the window** in its row
of the **Output windows** panel. Don't click inside the presentation window to bring it forward:
a click there turns full screen on and off.

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

### “The control window moved to …”

You clicked **Open in … now** (Settings → App): the control window opened in the other browser
and runs the show from there — remotes and viewers' phones listen to it. This window is no
longer needed: **Close this window**. This browser's presentation windows keep working until
you close them. To bring control back here, click **Listen here**.

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

### Another computer shows “Control the show from here with a computer remote”

The full control window works only on the computer that runs the app. Another computer of
the network controls the show through a computer remote: create one (**Speaker remote** →
**Computer**) and paste its link into the field on that page — see
[A remote on a computer](remote.md#a-remote-on-a-computer).

### A remote on a computer shows “This remote doesn’t work”

The link no longer works: the remote was revoked, its link was reissued, or the app restarted
with **Remember remotes after a server restart** turned off. Create a computer remote or
reissue the link, and open the new one.

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
