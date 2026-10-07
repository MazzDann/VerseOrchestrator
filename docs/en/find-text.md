# Find a text

[Українською](../find-text.md) · English

This page is for the operator: how to choose translations, get to the right place, find a
word or a phrase, and go back to recent passages. How to show what you found is in
[Show a text](show-text.md).

## Choose translations

You choose translations in the **Translations** list at the top left:

- Select one translation or several — up to five. The counter next to the heading shows
  how many are selected, for example **2/5**.
- The first selected translation is the main one. The list of books and chapters, the
  search, and the verse list follow it. To make another translation the main one, click
  the star next to it.
- The other selected translations stand on the slide below the main one, each with its own
  label.
- The letter **S** next to a name means the translation has Strong's numbers.
- To find a translation in a long list quickly, type part of its name in the
  **Filter translations…** field.

![The control window with two translations: KJV in the verse list, KJV and Kulish's
Ukrainian one below the other on the preview slide](../img/en/find-parallel.png)

## Go to a book, a chapter, and a verse

To go to a place in the Bible:

1. In the book list, click the book — its first chapter opens. To find a book quickly, type
   part of its name in the **Filter books…** field above the list. The open book, clicked
   again, stays at its chapter.
2. To go to another chapter, click its number above the verses.
3. In the verse list, click the verse. To add more verses, click while holding Ctrl (on
   macOS, ⌘) or Shift.

The chosen passage appears at once on the **Preview** monitor on the right.

To follow a reference, type it in the **Search** field at the top and press Enter. The
field understands references such as `John 3:16`, `Genesis 2 3`, or `John 3:16-18`. A book
name can be in the language of any translation in the library.

To move inside the open book, numbers are enough. When the cursor isn't in a text field,
type them straight into the control window: `16` — a verse of the open chapter, `3:16` —
a chapter and a verse, `3:16-18` — a few verses, `3:` — the start of a chapter. A period,
a comma, or a space works instead of the colon; on a Ukrainian layout the Ю and Б keys do
too (where the English layout has the period and the comma). What you type shows at the
bottom of the window. Enter goes there and the verse becomes the selected one, so Enter
again shows it on screen. ⌘↩ on macOS (Ctrl+Enter elsewhere) or the **To screen** key goes
there and shows it on screen at once. Esc cancels. The **Search** field understands numbers
without a book name too.

## Search the text

To find a word or a phrase:

1. Click the **Search** field at the top, or press `/`, Ctrl+F, or F3 to search the main
   translation, or F4 to search every translation in the library. On macOS, ⌘F and ⇧⌘F. If the
   browser keeps Ctrl+F for itself (Firefox, LibreWolf), press `/`.
2. Type the query. The results appear under the header as you type, with the matches
   highlighted. If the main translation has nothing, the app searches the others and says so.
3. Click a result, or choose it with ↓ and ↑ and press Enter. The results close, and the verse
   you found becomes the selection.

The first Esc closes the results, the second clears the field. You can also switch where to
search above the results: **Current (F3)** or **All (F4)**. When you search all translations,
a verse found in several of them is one row: in the main translation's words, with “also:” and
the other translations' names next to it. This holds even when translations number the verse
differently: for example, Psalm 22 of the Synodal translation is Psalm 23 in the KJV, and
Malachi 3:19 in the Hebrew numbering is Malachi 4:1. The app aligns the numberings from the
length of each book's chapters; the verses themselves don't change.

While the field is empty, the arrow keys and PageUp/PageDown in it step through the verses as
usual.

In **Settings** → **Search** you can choose where to search words first, whether to show the
same verse from different translations as one row, and whether to put the cursor in the search
field when you come back to the control window. In a narrow window the field at the top hides:
then `/`, Ctrl+F, F3, and F4 open the search above the verses with a field of its own.

![A search for the word “love” in the King James Version: below the field, verses with the
matches highlighted](../img/en/find-search.png)

A query can combine these parts:

| Query                      | What it finds                                                   |
| -------------------------- | --------------------------------------------------------------- |
| `love`                     | verses with words that begin like that: “love”, “loved”         |
| `love faith`               | verses that have both words                                     |
| `"light of life"`          | exactly this phrase, word by word                               |
| `light -darkness`          | verses with the word “light” but without the word “darkness”    |
| `John 3:16`, `Genesis 2 3` | this place in the Bible                                         |
| `G2424`, `H0430`           | verses with this Strong's number (in translations marked **S**) |

Uppercase and lowercase letters and accents don't matter.

## Use the command palette

The command palette opens anything from one line: a book, a reference, a song, or a
command of the app. To open it, press Ctrl+K (on macOS, ⌘K), start typing the name, and
choose a line with the arrow keys and Enter.

## Go back to something recent

Below the book list there are two tabs:

- **History** — passages you opened, the latest at the top. Click a line to go back to the
  passage, or × next to it to remove it. To clear the whole history, click **Clear**.
- **Saved** — passages you saved. To save the current passage, click the bookmark icon to
  the right of the **Preview** label above the monitor. **Export** and **Import** save the
  list to a file and open it on another computer.

## Study the text

On the right, above the monitors, there are tabs for studying the chosen verse. They work
when the library has the matching MyBible modules:

- **Strong's** — appears when the main translation has Strong's numbers. Click a word of
  the chosen verse to see its meaning from the dictionary. **To screen with Strong's**
  shows the verse with that word and its meaning, and **Where else it is used** — other
  verses with the same number.
- **Context** — cross-references and commentaries on the chosen verse.

## What's next

- [Show a text](show-text.md): the preview and the screen, output windows, the stage
  display.
- [VerseOrchestrator documentation](README.md): the contents of all parts.
