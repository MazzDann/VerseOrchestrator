# Statistics

The app records everything that goes on screen: passages, presentations, documents, pictures, videos,
text, the cover and the countdown — with the time and how long it stayed. The
statistics show which presentations are shown most, which haven’t been shown for a while, which books of the
Bible are read, and what exactly was on screen on a given day.

The app's server keeps the statistics, so showings are recorded when the app runs the usual way
(`start.cmd`, `start.command` or `start.sh`). In the “in the browser” mode without a server,
nothing is recorded. The statistics stay on this computer in `data/stats.db` and are never sent
anywhere.

## What counts as a showing

One showing is one thing on screen from when it appears until something else replaces it:

- a passage — with all its pages and reveal steps;
- a presentation — with all its slides;
- a document — with all its paragraphs.

If you take the text away (**Hide text**, **Clear**) and bring the same thing back within two
minutes, the showing goes on. Moving to another verse or another presentation starts a new showing.

## Open the statistics

1. Open **Settings** → **Data**.
2. Click **Open the statistics**. The statistics open in a window of their own.
3. At the top, choose a period: **7 days**, **30 days**, **Year** or **All**.

On the page:

- **Showings**, **On screen**, **Days with showings** — the period's totals.
- **Showings by day** (or by month for a year) — how many showings each day had.
- **Presentations** — the presentations shown most. Point at a row to see how long the presentation was on screen and when
  it was last shown. **Not shown for a while** — presentations shown before, but not in the last eight
  weeks.
- **The Bible's books** — a cell per book: the darker, the more it was read. Below it, **Most
  shown passages**.
- **Documents** and **What was shown** — documents and kinds of showings by count.
- **Show report** — everything that was on screen on the chosen day, in order: the time, what, how
  long. If a speaker remote put it there, the remote's name stands beside it.

## What the library holds

The **Library** tab on the same page counts what the library holds:

- how many translations, verses and words, dictionary entries, presentations and documents;
- **Translations** — each translation: language, books, verses, words, Strong's numbers and
  section titles;
- **Dictionaries**, **Presentations** (by bundle), **Commentaries and references**, **Documents** (their
  paragraphs and Bible references);
- **On disk** — how much space the library, modules, segments, vectors, pictures and statistics
  take.

The first time, a big library needs a second or two to count the words; after that the answer
comes at once until the library changes. In the “in the browser” mode, the tab counts the
browser's library.

## Save or clear

- **Export CSV** saves the period's showings to a file for spreadsheets (Excel, LibreOffice Calc,
  Google Sheets): start, end, length, kind, name.
- The trash button **Clear the statistics** deletes every showing. The app asks first, because the
  statistics can't be brought back.

**Disk space** in **Settings** → **Data** shows the statistics' size but doesn't
clean them up.
