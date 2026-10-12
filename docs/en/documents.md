# Documents

A document is a text file of yours that the app shows one paragraph at a time: a sermon, a
lecture, a talk, notes. The document's headings split it into sections, and each paragraph,
quote or list item becomes a slide of its own — the way a song's stanza does.

The app reads three formats:

- **Word** (`.docx`): headings are paragraphs in the “Heading 1”, “Heading 2” and other
  heading styles, and in “Title” and “Subtitle”. Paragraphs in a “Quote” style become quotes,
  numbered and bulleted lists become items.
- **Markdown** (`.md`): `#` headings, `>` quotes, `-`, `*` or `1.` items.
- **Plain text** (`.txt`): an empty line separates paragraphs. With no empty lines at all, each
  line is a paragraph. Files in UTF-8, UTF-16 and Windows-1251 read the same.

The app splits a very long paragraph into parts at sentence ends, so a slide never holds a
whole page.

## Where documents are kept

Documents are the files in the `modules/documents` folder next to the Bible modules. That folder
is the source: the app watches it and adds a new file, updates a changed one and drops a deleted
one by itself within a second or two. You can sort the files into subfolders, by year or topic
for example; the app reads three levels of subfolders and shows a subfolder's name next to the
document's title in the list.

A document's title is its file name without the extension. To rename a document, rename the
file.

## Add documents

There are three ways to add a document:

- Put the files into the documents folder. To open it, click **Documents** at the top, then the
  folder icon **Open the documents folder** on the left.
- Drag `.docx`, `.md` or `.txt` files into the control window. The app copies them into the
  documents folder and opens the last one.
- Click **Documents** at the top, then **Add…**, and choose the files.

If a file of that name is already there with other content, the app replaces it with the newer
one and puts the old copy aside in the hidden `.trash` folder inside the documents folder. It
keeps the last 20 deleted or replaced files.

If a document doesn't show up, click **Read the documents folder again** (the arrows icon next
to the folder): the app reads the folder at once and says which files it couldn't read.

## Show a document

1. Click **Documents** at the top. The list of documents appears on the left, with a search by
   title above it.
2. Click a document. Its paragraphs appear in the middle: headings in bold, quotes in italics,
   items with a bullet. The number on the left is the paragraph's place in the document.
3. Click a paragraph, or select it and press Enter. The paragraph goes on screen, and the
   document's title stands on the slide where a passage's reference does.
4. To go to the next or the previous paragraph, press ↓ and ↑ (or → and ←, Page Down and Page
   Up), or **Next** and **Back** on a speaker remote.

After the last paragraph, the next **Next** shows an empty slide: the text goes, the background
stays. On the **stage**, the speaker sees which paragraph is on screen, for example
“paragraph 3 of 8”.

The **Add to the running order** button (the list-with-a-plus icon above the paragraphs) adds the
document to the [running order](running-order.md). The item opens the document and shows its
first paragraph.

## Show a verse from a document

The app underlines Bible references in a document's text — «Ів 3:16», «1 Кор 13:4-7», «Рим.
8:28». Click a reference: those verses go on screen in the translations ticked in **Біблія**
(Bible) mode, and the document stays open — the next ↓ shows the next paragraph.

The app recognizes a reference that starts with a capital letter and reads “book
chapter:verse” or “book chapter:verse-verse”, and the book by the names in your translations.
A time such as “о 10:30” doesn't become a reference.

In **Біблія** mode, on the **Context** tab on the right, **In documents** lists the paragraphs
that refer to the selected verse. Click one to open the document with that paragraph marked.

## Find words in documents

Start typing into the search field above the list of documents. Besides titles, from three
letters on the app searches the text too: **In the documents' text** appears under the list —
the paragraphs that hold every word you typed. Click one to open the document at it.

The search at the top finds documents' paragraphs too: **In documents** under the verses.

## Delete a document

To delete a document, open it and click the trash icon **Delete the document**. The file moves
to the `.trash` folder inside the documents folder, and **Deleted: …** appears above the list
with a **Cancel** button that puts the file back.

## What's next

- [Songs and custom text](songs-and-text.md): songs from `.pptx` and any text of your own.
- [Running order](running-order.md): a program of passages, songs, documents and pictures.
- [Slide appearance](appearance.md): font, colors, background, template.
