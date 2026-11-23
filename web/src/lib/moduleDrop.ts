import {
  detectTextFormat,
  packUsfm,
  TEXT_MODULE_HEAD,
  TEXT_MODULE_MAX,
  TEXT_MODULE_SURE_EXT,
  TEXT_MODULE_ZIP_MAX,
} from '@vo/shared';

/**
 * Dropped modules in the text formats — USFM, OSIS, Zefania, VPL (1.25.0-beta.6): told from other
 * files (a .txt may be a document, a .zip anything), USFM books brought together made one module.
 */
const USFM = /\.(usfm|sfm)$/i;
/** Extensions a module shares with other files: the content tells. */
const SHARED_EXT = /\.(xml|txt|zip)$/i;

/** Is the file a module in a text format? */
export async function isTextModuleFile(file: File): Promise<boolean> {
  if (TEXT_MODULE_SURE_EXT.test(file.name)) return true;
  if (!SHARED_EXT.test(file.name) || file.size > TEXT_MODULE_MAX) return false;
  if (/\.zip$/i.test(file.name) && file.size > TEXT_MODULE_ZIP_MAX) return false;
  // a .zip's list of files is at its end: read whole
  const part = /\.zip$/i.test(file.name) ? file : file.slice(0, TEXT_MODULE_HEAD);
  try {
    return detectTextFormat(file.name, new Uint8Array(await part.arrayBuffer())) !== null;
  } catch {
    return false;
  }
}

async function packed(books: File[]): Promise<File[]> {
  const zips = packUsfm(
    await Promise.all(
      books.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    ),
  );
  return zips.map(
    (z) => new File([z.bytes as Uint8Array<ArrayBuffer>], z.name, { type: 'application/zip' }),
  );
}

/** Modules dropped together: several USFM books are one module (a .zip), the rest stay as they are. */
export async function joinUsfm(files: File[]): Promise<File[]> {
  const books = files.filter((f) => USFM.test(f.name));
  if (books.length < 2) return files;
  return [...files.filter((f) => !USFM.test(f.name)), ...(await packed(books))];
}

/** A folder with more entries than this is photos, not a Bible's books. */
const ENTRIES_MAX = 400;

async function entriesOf(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  while (all.length < ENTRIES_MAX) {
    const batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail));
    if (batch.length === 0) break;
    all.push(...batch);
  }
  return all.filter((e) => !e.name.startsWith('.'));
}

const booksIn = (entries: FileSystemEntry[]) =>
  entries.filter((e): e is FileSystemFileEntry => e.isFile && USFM.test(e.name));

/**
 * A dropped folder of USFM books (or with a folder of them in it) as one module, named as the folder;
 * null when it is none.
 */
export async function usfmFolder(dir: FileSystemDirectoryEntry): Promise<File | null> {
  const entries = await entriesOf(dir);
  let books = booksIn(entries);
  for (const e of entries) {
    if (books.length > 0) break;
    if (e.isDirectory) books = booksIn(await entriesOf(e as FileSystemDirectoryEntry));
  }
  if (books.length === 0) return null;
  const files = await Promise.all(
    books.map((e) => new Promise<File>((ok, fail) => e.file(ok, fail))),
  );
  const zip = packUsfm(
    await Promise.all(
      files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    ),
    '',
    true,
  )[0];
  return new File([zip.bytes as Uint8Array<ArrayBuffer>], `${dir.name}.zip`, {
    type: 'application/zip',
  });
}
