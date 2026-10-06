# Songs and custom text

[Українською](../songs-and-text.md) · English

This page is for the operator: how to show a song slide by slide and how to put your own
text on screen, for example an announcement. How to gather songs and texts into a program
beforehand is in [Running order](running-order.md).

## Where songs are kept

Songs are kept in bundles. A bundle is a collection of songs in one file in the app's
`data/songs/` folder, for example `data/songs/Hymns.vosongs`. The bundle holds the text and
the look of every slide, so the app no longer needs the `.pptx` files the songs came from.
To move a collection to another computer, copy the bundle file into the same folder there.
A bundle file added or deleted by hand reaches the library at the next start of the app.

When there are several bundles, a bundle choice appears next to the song search, and each
song in the list shows its bundle's name. Each bundle has its own song numbers.

## Import songs from .pptx files

Songs come from PowerPoint presentations: one song, one `.pptx` file. The browser reads the
files, and the app writes the songs into the bundle you choose. Import works while the app
is running (`start.cmd`, `start.command`, or `./start.sh`).

To import songs:

1. At the top, click the **Songs** icon.
2. To the right of the song search, click the **Import songs** icon.
3. Under **From**, click **.pptx files…** and choose the files, or click **Folder…** and
   choose a folder. Subfolders are read too. Below the buttons you see how many songs were
   found and which files were skipped.
4. In the **To** list, choose a bundle. To create a bundle, choose **New bundle…** and type
   its name.
5. Click **Import**.

After the import, the search shows the songs of the bundle they went into. If the bundle
already has a song with the same file name, the new version replaces it, and the song keeps
its places in [running orders](running-order.md).

Below the song search, “Imported into “…”: … new, … updated” appears with a **Cancel**
button. It brings the bundle back to how it was before the import, and deletes a bundle the
import created. You can cancel until you close the song search, import again, rename or
delete a bundle, or rescan the modules.

## Rename or delete a bundle

To rename a bundle:

1. At the top, click the **Songs** icon.
2. To the right of the song search, click the **Song bundles** icon.
3. In the bundle's row, click the **Rename** icon, type the new name, and press Enter.

The bundle's songs stay the same, so [running orders](running-order.md) still find them
after the rename. The bundle's file in the `data/songs/` folder gets the new name.

To delete a bundle, click the trash icon in its row of **Song bundles**. In its place,
“Deleted: …” appears with a **Cancel** button that brings the bundle back with all its
songs. You can cancel until you delete another bundle or go back to the song search. The
last ten deleted bundles stay in the `data/songs/.trash/` folder: to bring one back later,
move its file back into `data/songs/` and start the app again.

A bundle that a folder of `.pptx` files fills, such as the `songs/` folder, comes back at
the next start while the folder holds those files. The “Deleted: …” row names that folder.
To delete such a bundle for good, first remove the files from the folder. Once the folder
has made its bundle again, **Cancel** doesn't bring the deleted one back: its songs would be
in the library twice.

## Add songs from a folder

You can also add songs without the control window, through the app's `songs/` folder:

1. Copy the `.pptx` files into the `songs/` folder. Subfolders are fine too.
2. In the control window, open **Settings** → **App** and click **Rescan modules**.

Songs from the `songs/` folder go into the bundle named «Пісні» (Ukrainian for “songs”).
New and changed files in the same folder update that bundle after the rescan.

## How the app reads a .pptx file

- The song's number and title come from the file name, for example
  `123. Song title.pptx`. A period, a hyphen, or a parenthesis follows the number. A song
  without a number in its file name can be found only by its title.
- Every slide with text becomes a slide of the song; slides without text are skipped.
- The first slide is labeled **Title**, the stanzas **Stanza 1**, **Stanza 2**, and so on.
- A slide whose first line starts with the word “Chorus” (or «Приспів», «Припев»,
  “Refrain”) is labeled **Chorus**, and so is a slide with the same words and no label. If a
  song has several choruses with different words, they are numbered: **Chorus 1**,
  **Chorus 2**. If a chorus takes several slides in a row, the label adds the part:
  **Chorus · 1/2**. A label in the file that says more, such as «Приспів (до 5-го куплету)»,
  is shown as the file writes it.
- The lines and paragraphs of the text stay as they are in the file.
- For **As in the file**, the app takes the background color, the text's color and font,
  bold, alignment, the text box's place and size, the font size, and where the text sits
  in its box — top, middle, or bottom — from the file. Empty lines before or after the text
  move it as in PowerPoint: a title lifted above the authors with empty lines shows above
  them.
- If a slide has two text boxes, for example the title and the authors on the first slide
  or a “Chorus:” label over a chorus, **As in the file** shows each box in its own place
  and size. **Plain text** shows both as one text, top to bottom.
- When the app starts reading `.pptx` files more exactly, it reads a bundle from the
  `songs/` folder again by itself at the next start. A bundle made with **Import songs**
  changes only when you import the same files again.
- The app skips the `._…` files that a Mac makes next to the files it copies to an exFAT or
  FAT flash drive: they hold no slides. In the `songs/` folder, it also skips hidden folders,
  whose names start with a period, such as `.Trashes`.

## Show a song

To show a song:

1. At the top, click the **Songs** icon. The song search appears above the verses.
2. Type the song's number or a few letters of its title.
3. In the list, click the song. Its slides appear: **Title**, the stanzas, and the
   choruses.
4. Click a slide. It appears on screen at once.

While a song is open, the arrow keys, PageUp, and PageDown step through its slides, not the
verses. A clicker, the keys in the presentation window, and the speaker remote step through
the song too.

To show the chorus at once, press C or click the **To the chorus** icon above the song's
slides. It shows the nearest chorus after the current slide, so in a song with its own
chorus after each stanza, it is the one after that stanza. Past the last chorus of a song
that writes its chorus once, **To the chorus** goes back to it. The icon is there only in
songs with a chorus.

After the last stanza, **Next** shows an empty slide: the text disappears, the background
stays. The **End** line at the end of the list does the same.

To find another song, click **Back to search** — the arrow before the song's title. You can
also open a song from the command palette: press Ctrl+K (on macOS, ⌘K) and type its number
or title.

## Choose how a song looks

Above the song's slides there is a switch:

- **As in the file** (the default) — as in the `.pptx` file: the same font, text and
  background colors, the size and place of the text on the slide.
- **Plain text** — like the verses: the font, colors, background, and template from the
  [appearance settings](appearance.md).

If the file colors some of the words apart, such as an echo or a second part — “word
(word)” in yellow — **As in the file** keeps that color. **Plain text** shows those words
dimmer than the rest, and so do the viewers' phones.

## Show custom text

Custom text is a slide with any text of yours: an announcement, a note, a question. It
looks the same as the verses.

To show custom text:

1. At the top, click the **Custom text** icon. The **Text to screen** panel appears above
   the verses.
2. If you need a title, type it in the **Title (optional)** field. On the slide it stands
   where the reference stands for verses.
3. In the field below the title, type the slide's text.
4. Click **To screen** or press Ctrl+Enter (on macOS, ⌘↩). The text appears on screen at
   once.

![The Text to screen panel: the title “Announcement”, the text “Next meeting — on
Wednesday at 6 p.m.”, and the To the running order and To screen
buttons](../img/en/own-text.png)

The texts you showed go into the **Recent** list at the bottom of the panel. To show such a
text again, click it in the list — it goes back into the fields — and click **To screen**.
To remove a text from the list, click the trash icon **Remove from the list**.

**To the running order** doesn't show the text; it adds it to the
[running order](running-order.md).

## What's next

- [Running order](running-order.md): a program of passages, songs, texts, and images.
- [Slide appearance](appearance.md): font, colors, background, template, presets.
- [VerseOrchestrator documentation](README.md): the contents of all parts.
