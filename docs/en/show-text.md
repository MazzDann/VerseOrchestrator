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

| Action           | Key | What the viewers see                |
| ---------------- | --- | ----------------------------------- |
| **Hide text**    | B   | the slide's background without text |
| **Black screen** | .   | a completely black screen           |
| **Cover**        | L   | your logo and text on the background |
| Clear            | Esc | an empty screen; the preview stays  |

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
2. In the **How long** row, choose the minutes. To count to a time of day, choose
   **until…** and type the time in the **Until what time** field.
3. Optional: in the **Words over the time** field, change the words over the time. Without
   them, the screen says “Starting in”.
4. Click the button with the words and the time, for example **Show: Starting in 5:00**. If
   you chose **until…**, the button is **Show the countdown**.

While the countdown is on screen, the **Countdown** icon is highlighted and its tooltip shows
the time left. To change the countdown, click the icon again:

- **−1 min** and **+1 min** move its end by a minute.
- **Remove the countdown** brings back what was on screen before it, as the L key does.
- **Keep the cover without the time** removes only the time.

When the time is up, it leaves the screen and the cover stays. The control window says
“The countdown has ended”. If that time has already passed today, the countdown runs to it
tomorrow, but only when it is at most 12 hours away: at 23:50 you can choose 00:10.
Otherwise the field says “This time has already passed” and the countdown doesn't start.

## Open output windows

An output window is a separate browser window for the viewers or the speaker. There are two
kinds:

- **Presentation window** — what the viewers see, on a projector or a second monitor.
- **Stage** — a monitor for the speaker: what is on screen now, what comes next, and a
  clock.

![The Stage window: on the left, the verse on screen now; on the right, the next verse; at
the top, a clock](../img/en/stage-window.png)

To open an output window, click **Presentation window** or the **Stage** icon at the top.
If a second screen is connected, the browser asks for permission to manage windows on all
your screens; allow it, and the window opens on the second screen.

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
