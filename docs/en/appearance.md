# Slide appearance

[Українською](../appearance.md) · English

This page is for the operator: how to change the font, colors, background, and layout of
the slides the viewers see, and how to save a good look as a preset. Changes show at once
in the preview and in every presentation window. Hotkeys are described in the
[Reference](reference.md#hotkeys), and the **App** section in
[Install and start](install.md).

## Open the settings

To open the settings, click the **Settings** icon at the top. A panel with sections opens;
above them stands the app's version.
Below each section's name you see its current values; click the name to expand or
collapse the section.

You can drag the panel by its title, and resize it like a window, by any edge or corner.
A double-click on an edge or a corner brings back the standard size. From the keyboard:
reach the bottom-right corner with Tab and press the arrow keys.

To see the settings and the preview side by side, click **Open in a separate window** at
the top of the panel. The window opens where the panel was, at the same size, and the
panel closes; you can drag the window, for example to a second monitor. The size you give
the separate window is remembered: the panel and the window open with it next time.

![The Settings panel: the Presets section expanded with three built-in presets, and the
Text section with the font, color, and alignment](../img/en/appearance.png)

## Choose a ready look

In the **Presets** section, below the **Built-in** divider, click a ready look:

- **Classic (serif)** — a light serif font on a black background.
- **Lower third** — white text at the bottom of the screen on a dark blue background.
- **Large yellow on black** — a yellow sans-serif font on a black background.

To go back to the standard look, click **Reset the look to default**. The template from the
**Slide layout** section doesn't change.

## Change the text

In the **Text** section:

- **Font** — Lora, Inter, Georgia, Times New Roman, or the computer's system font.
- **Color** — the text color.
- **Alignment** — left, center, or right.
- **Show verse numbers** — a number before each verse.
- **Slide transition** — how a new slide replaces the previous one:
  - **Smooth** — the old slide fades out, the new one fades in; the new text appears in
    about 0.4 s.
  - **Fast** — the new slide at once, with a short fade-in.
  - **No animation** — an instant swap.

The transition applies to the presentation windows. If the system is set to reduce motion,
the monitors in the control window change the slide without animation, while the
presentation windows keep the chosen transition.

## Change the background

In the **Background** section:

- **Background color** — the color under the text.
- **Background image** — click **Upload** and choose a PNG, JPEG, or WebP file. A large
  image is scaled down to 1920 pixels on its longer side. Under the text the image is
  darkened a little so the text stays readable. To remove the image, click the trash icon
  **Remove the background**.

## Set up the cover

The cover is what the viewers see between the items of a show: your logo and a line of text
on the slide's background. The L key or the **Cover** button at the top of the control
window turns it on and off.

In the **Cover** section:

- **Cover text** — for example, the gathering's name. Best up to three lines: a longer text
  gets smaller together with the logo so that the cover fits on the slide.
- **Logo** — click **Upload** and choose a PNG, JPEG, or WebP file. The logo takes up to 80%
  of the slide's width (under text, up to half its height), the same in the preview and on
  every screen, so for a sharp picture use a file of 1600 pixels or more on its longer side. A
  smaller file is stretched at most twice on a Full HD screen, so a small logo takes up less
  room. A PNG keeps its transparency; a larger image is scaled down to 1600 pixels, and a photo
  is saved as JPEG so that it doesn't fill the browser's storage. Save an iPhone's HEIC photo
  as JPEG first. To remove the logo, click the trash icon **Remove the logo**.

A logo uploaded in version 1.4.0 was stored at 800 pixels at most on its longer side, so it
looks softer on a large screen. For a sharp picture, upload the logo again from the original
file.

An empty cover shows only the background. Presets don't keep the cover: it stays yours
whichever look you choose.

The browser keeps the logo and the background image in its storage, and that storage is small
(5 MB in Safari). If it runs out of room, the message **Couldn't save the settings** appears
and the image stays as it was: choose a smaller file or remove the background or the logo.

## Place the slide's elements

In the **Slide layout** section, in the **Template** field, choose how the slide's elements
are placed:

- **Classic (default)** — the text in the center, the reference below it.
- **Centered with a rule**, **Lower third**, **Minimal** — ready layouts you can change.

A template other than the classic one has four elements: **Quote** (the text of the
verses), **Reference**, **Subline** (the line with a word and its meaning when a verse is
shown with **To screen with Strong's**), and **Rule**. Each element has its own settings:

- **Show** — turns the element on or off.
- **X**, **Y**, **Width**, and **Height** (for the rule, **Thickness**) — the place and
  size in percent of the slide.
- **Font** — the font size of the reference or the subline. The quote's text picks its own
  size to fit.
- The alignment buttons — left, center, or right.

To change the space around the text, in **Margins** choose the units (**%** or **px**) and
how the margins are linked: **All together**, **Vert./Horiz.**, or **Each side**. Then type
the margins in the fields around the frame.

## Set up long passages

In the **Long passages** section:

- **Verses per slide** — `0` by default: the whole chosen passage stands on one slide, and
  the text shrinks to fit. To split long passages into pages, type the number of verses per
  page. Then **Next** and **Back** step through the pages, and the page number shows above
  the verses, for example **2/3**.
- **Progressive reveal** — the passage's verses appear one at a time with each **Next** and
  stay on the slide. When it is on, two more switches appear:
  - **Spotlight** — the verses already shown are dimmed; only the latest one is bright.
  - **Placeholders** — the verses not shown yet are faintly visible. Without this switch
    they are invisible, but their place is kept.

## Highlight the words of Jesus and a Strong's word

In the **Highlighting** section:

- **Jesus' words in color** and **Color of Jesus' words** — in translations that mark the
  words of Jesus, they have their own color.
- **Highlighted word color (Strong's)** — the color of the word shown with
  **To screen with Strong's**.
- **Strong's text on screen** — what stands in the subline: **Lemma** — only the first line
  of the dictionary entry, **Full entry** — the whole entry.

## Save your preset

A preset is a saved look: everything from the sections above except the background image
and the slide transition.

To save the current look as a preset:

1. Expand the **Presets** section.
2. In the **Preset name** field, type a name.
3. Click **Save**. A preset with the same name is replaced by the new one.

Saved presets appear below the field. To apply a preset, click its name.

To move a preset to another computer:

1. In the preset's row, click the **Export to a file** icon. The browser saves a
   `.vop.json` file.
2. On the other computer, in the **Presets** section, click the
   **Import a preset from a file** icon next to **Save** and choose that file. The preset
   appears in the list and is applied at once.

The appearance settings and presets are kept in the app's folder, so they stay after a
restart.

## What's next

- [Show a text](show-text.md): the preview and the screen, stepping through, output
  windows.
- [Songs and custom text](songs-and-text.md): songs from `.pptx`, announcements.
- [VerseOrchestrator documentation](README.md): the contents of all parts.
