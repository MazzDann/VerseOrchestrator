# Show a text

[Українською](../show-text.md) · English

This page is for the operator during a show: how to put the selection on screen, step
through, hide the text, and manage the output windows. How to find and choose a text is in
[Find a text](find-text.md).

## The preview and the screen

The app tells what you prepare from what the viewers see. On the right of the control
window there are two monitors for that:

- **Preview** (a yellow frame) — the current selection. The text goes to the screen from
  here.
- **On screen** (a red frame) — what is in the presentation window right now.

When the preview and the screen are the same, one monitor stays, with a red frame and the
**On screen** label.

![On the right, the yellow Preview monitor with John 3:16 in two translations and the red
On screen monitor with the verse in one: what is prepared differs from what is on
screen](../img/en/find-parallel.png)

You can put the monitors below the verse list: **Settings** → **App** → **Preview panel
position** → **Bottom of the center**. Then **Preview** and **On screen** stand side by
side, with the slide's text to their right when there is room. To change the panel's
height, drag its top edge (or reach it with Tab and press ↑ and ↓); a double-click on the
edge brings back the standard height. In a short window the panel gets lower by itself, and a
few verses above it stay in view; once there is room again, the panel returns to your height.

## Show the selection

To show the selection:

- click **To screen** at the top or press F5 (on macOS, ⌘↩);
- or click a verse in the list and press Enter — that verse appears on screen at once.

The **Live** switch next to **To screen** decides what happens next:

- **On** (the default). After the first **To screen**, the screen follows the selection:
  the next verse of the same chapter appears at once. Going to another book or chapter
  stays in the preview until you click **To screen** again.
- **Off.** The selection changes only the preview, and the text goes to the screen only
  with **To screen**. This is handy for preparing what comes next while something else is
  on screen.

To show several verses together, gather them:

- Ctrl+click (on macOS, ⌘+click) adds a verse to the selection or takes it out;
- Shift+click chooses every verse from the one you clicked last to this one (with Ctrl, adds
  them to the selection).

While **Live** is on, the gathered verses wait in the preview, and the screen keeps what it
shows. The badge above the verses names the chosen numbers and how many there are, for
example **3:16–18, 20 · 4**; while they are not on screen yet, the badge is yellow. To show
them, press Enter, **To screen**, or **Next**. After that, **Next** goes through the gathered
verses one by one (16, 17, 18, 20) and, after the last, on to the chapter's next verse.

For each added verse to appear on screen at once, turn off **Settings** → **Hotkeys** →
**Several verses — to the screen after Enter**.

## Step through

To show the next or the previous verse, press:

- → or ↓, PageDown — **Next**;
- ← or ↑, PageUp — **Back**.

The same keys work in the presentation window and with a wireless presentation clicker.

To prepare the next verse while the current one is on screen, step with Ctrl: Ctrl+→ or
Ctrl+↓ — **Preview: next**, Ctrl+← or Ctrl+↑ — **Preview: back** (on macOS, with ⌥:
Ctrl with the arrows switches desktops there). The preview moves on, and the screen stays,
even with **Live** on. To show the preview, click **To screen**; a plain arrow brings the
screen back to the selection too.

- The whole chosen passage stands on one slide, and the text shrinks to fit. To split long
  passages into pages, set **Verses per slide** in the
  [long passage settings](appearance.md#set-up-long-passages). Then **Next** and **Back**
  step through the pages.
- On the last verse of a chapter, the first **Next** only says where the next one leads:
  “End of the chapter. Press “Next” again — …”. Press it again within five seconds to go
  to the next chapter. This way a clicker doesn't leave the chapter by accident.
  The last verse of a book works the same way: “End of the book. Press “Next” again — …”,
  and the second **Next** opens the next book's first chapter. **Back** on a first verse
  goes to the previous chapter or book.
- To show a long passage one verse at a time, turn on **Progressive reveal** in the same
  settings.

## Take the text off the screen

To take the text away for a while, use one of these actions:

| Action           | Key | What the viewers see                 |
| ---------------- | --- | ------------------------------------ |
| **Hide text**    | B   | the slide's background without text  |
| **Black screen** | .   | a completely black screen            |
| **Cover**        | L   | your logo and text on the background |
| Clear            | Esc | an empty screen; the preview stays   |

**Hide text**, **Black screen**, and **Cover** are toggles: press again, and what was on
screen comes back. The cover — a logo and a line of text between the items of a show — is
set up in [Slide appearance](appearance.md#set-up-the-cover). During the cover the viewers'
phones show an empty screen, and during a [countdown](#show-a-countdown-before-the-start) the
time to the start.

**Clear** is not a toggle: pressing Esc again leaves the screen empty. To bring back the
slide you cleared, press Ctrl+Z (⌘Z on a Mac) or click **Bring back** in the “Screen
cleared” notification. You can bring the slide back until something else goes on screen.

## Show a countdown before the start

A countdown is the cover with the time to the start under its logo and text, for example
“Starting in 4:59”. The time counts down on every screen, in the **Stage** window, and on the
viewers' phones, all by the computer's clock: a phone whose clock is off shows the same time.

To show a countdown:

1. At the top of the control window, to the right of **Cover**, click the **Countdown** icon.
2. Optional: in the **Where to show** row, choose **In a corner** for the time to run in a corner
   over what is already on screen — verses, a song, a picture. **On the cover** is the usual
   choice.
3. In the **How long** row, choose the minutes, or type your own in the **Length** field: 7 is
   seven minutes, 7:30 is seven minutes thirty seconds, 1:05:00 is an hour and five minutes. To
   count to a time of day, choose **until…** and type the time in the **Until what time** field.
4. Optional: in the **Words with the time** field, change the words over the time. Without
   them, the screen says “Starting in”.
5. Optional: in the **After zero** row, choose what the time does when it is up. See the list
   below.
6. Click the button with the words and the time, for example **Show: Starting in 5:00**. If
   you chose **until…**, the button is **Show the countdown**.

While the countdown is on screen, the **Countdown** icon is highlighted and its tooltip shows
the time left. To change the countdown, click the icon again:

- **Pause** stops the time on every screen and phone, and **Resume** lets it go on from there.
- **−1 min** and **+1 min** move its end by a minute.
- **Remove the countdown** brings back what was on screen before it, as the L key does.
- **Keep the cover without the time** removes only the time.
- **After zero** changes what the time does when it is up, for the countdown on screen too.

The **After zero** switch says what the time does past zero:

- **Overtime** — the time counts on: −0:01, −0:02 … so everyone sees how late the start
  is. This is the usual choice.
- **Stop at 0:00** — the screen keeps showing 0:00.
- **Hide time** — the time leaves the screen, and the cover stays.

When the countdown reaches zero, the control window says so. Before the end and past zero the
time changes color, and you can choose its size, font, and format: see
[Set up the countdown's look](appearance.md#set-up-the-countdowns-look).

To hear the last 5 seconds, turn on **Sound for the last 5 seconds** in the countdown window or
in the **Countdown** section of the appearance settings: a short tone sounds at 5, 4, 3, 2, and
1, and a longer one at zero. The control window plays it, so it comes from this computer's
speakers. It sounds only while the time is on screen: not while paused, not under **Black
screen**, and not while the text is hidden. The speaker timer makes no sound.

A countdown in a corner is the time alone, without words, in the corner chosen in the appearance
settings (top right by default; when the viewers' QR takes the bottom right, the time moves up).
The slide's text keeps out from under it. The viewers' phones show this time small at the top.
**Pause**, **−1 min** and **+1 min**, **After zero**, the sound, and the T key work the same; **Remove the countdown**
removes only the time.

The T key pauses and resumes the countdown on screen. With no countdown on screen, T shows a
new one of the length and in the place (on the cover or in a corner) you chose last.

If the time chosen with **until…** has already passed today, the countdown runs to it
tomorrow, but only when it is at most 12 hours away: at 23:50 you can choose 00:10.
Otherwise the field says “This time has already passed” and the countdown doesn't start.

## Give the speaker a timer

The speaker timer is a time that only the speaker sees: in the **Stage** window, at the bottom
right, and on their phone remote. The audience's screen and their phones don't show it.

To start the timer:

1. At the top of the control window, to the right of **Countdown**, click the **Speaker timer**
   icon.
2. Choose the minutes, or type your own in the **Length** field: 7, 7:30, or 1:05:00.
3. Optional: in the **After zero** row, choose what the time does when it is up, as for the
   countdown.
4. Click the button with the time, for example **Start on Stage: 15:00**.

While the timer runs, its icon is highlighted. To change the timer, click the icon again: it has
**Pause** / **Resume**, **−1 min** and **+1 min**, **Remove the timer**, and **After zero**. The
timer's colors, font, and format have a section of their own in the appearance settings, apart
from what the viewers see: see [Set up the speaker timer](appearance.md#set-up-the-speaker-timer).

The speaker can run the timer from their phone remote too, if you allow them **Speaker timer**:
see [Speaker remote](remote.md#permissions).

## Write to the speaker

A message to the stage is a line that only the speaker sees: in the **Stage** window and on
their phone remote, for example “5 minutes left” or “Louder, please”. The viewers don't see it.

To send a message:

1. At the top of the control window, to the right of **Speaker timer**, click the
   **Message to the stage** icon.
2. Type the text and press Enter, or click **Show on the stage**. Shift+Enter starts a new line.

On the stage, the message shows as a band at the top and stays until you remove it: click the
icon again and then **Remove**. The last three messages are under **Recent** — send any of them
again with one click.

## Open output windows

An output window is a separate browser window for the viewers or the speaker. There are two
kinds:

- **Presentation window** — what the viewers see, on a projector or a second monitor.
- **Stage** — a monitor for the speaker: what is on screen now, what comes next, a clock,
  the speaker timer, your messages, and the running order.

![The Stage window: at the top, the reference, “verse 16 of 36”, and a clock; below them, the
message “5 minutes left”; in large letters, the verse on screen now; below it, the next verse
and the speaker timer; at the bottom, the running order](../img/en/stage-window.png)

By default, the stage shows the slide's words in a large plain font, so the speaker can read
them from afar; you can choose slide previews instead. To change it, see
[Set up the stage](appearance.md#set-up-the-stage).

While a countdown from the running order is on screen, the stage in its words layout shows its
time in large digits instead of the words (with slide previews, only the “next: …” line under the
slide), and under it what follows its zero: the next item (“next: Announcements”),
the end of the running order, or what the time does (“next: stops at 0:00”, “next: counts past
zero”). The **Stage** view on a phone remote shows the same; the “next: …” words appear there if
the remote is allowed **Running order**.

To open an output window, click **Presentation window** or the **Stage** icon at the top.
If a second screen is connected, the browser asks for permission to manage windows on all
your screens; allow it, and the window opens on the second screen. A second output window
doesn't go over the first: it opens on another free screen, or, if there is none, next to the
control window. The presentation window comes first: it still opens on a screen that holds
only the stage. You can move a window in the **Output windows** panel.

In an output window:

- to make it full screen, click in it or press F;
- the arrow keys, PageUp, and PageDown step through, and the period key turns on the black
  screen — the same as in the control window;
- the mouse pointer hides after a few seconds.

## Manage output windows

The **Output windows** panel shows the computer's screens and the open windows. To open it,
click the **Output windows** icon at the top.

![The Output windows panel: two screens with Presentation and Stage buttons, two open
windows with action buttons, switches, and layout buttons](../img/en/outputs-panel.png)

In the panel you can:

- open a window on the screen you want — with **Presentation** and **Stage** in the
  screen's row;
- find a window — **Show the number on this window**: the number appears in the window for
  three seconds;
- make a window full screen, go to it, move it to another screen, or close it — with the
  buttons in the window's row;
- save where the windows stand with **Save the layout**, and open them the same way next
  time with **Open the layout**.

The **hidden** label in a window's row means other windows cover it or it is minimized. The
browser pauses updates of such a window, so bring it to the front or put it on a screen of
its own.

The switches at the bottom of the panel:

- **Several presentation windows** — **Presentation window** opens a new window each time
  instead of bringing back the open one. This way you can show on several screens at once.
- **Open in full screen** — a new window goes full screen with your next click in the
  control window.
- **A separate process for each window** — a failure of one output window doesn't touch
  the control window and the other windows (Chrome, Edge). Such a window goes full screen
  with the F key or a click in the window itself.

## If several control windows are open

Only one control window runs the show. The others show a strip at the top: “Another
control window runs the show. You can prepare what comes next here — only that window puts
it on screen.” In such a window you can search and prepare passages. To run the show from
here, click **Take control**: nothing changes on screen, and the next actions come from
here. To go back to the window in charge, click **Close this window**.

The shortcut and the start file don't open a second control window: if one is open already,
they switch to it (on Windows; on macOS when it is in Chrome, Edge, Brave, Chromium, Arc or
Safari) or say that it is open. In those browsers on macOS, the first time, the system asks
whether to let Terminal control the browser — click **Allow**. When on macOS the control
window is open in Firefox or a browser built on it, such as Zen or LibreWolf, nothing is
asked: they bring that browser forward, and you find the window or tab in it yourself. To
open another window anyway, start the app with `--new-window`. The window that runs the show
is called “VerseOrchestrator — control” in the browser.

## What's next

- [Songs and custom text](songs-and-text.md): songs from `.pptx`, announcements.
- [Running order](running-order.md): a program of passages, songs, texts, and images.
- [Slide appearance](appearance.md): font, colors, background, template, presets.
- [VerseOrchestrator documentation](README.md): the contents of all parts.
