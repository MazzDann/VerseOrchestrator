import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { normalizeForSearch } from '../normalize.js';
import { DOCS_SCHEMA_SQL } from '../library/schema.js';
import {
  DOC_READER,
  documentKind,
  documentTitle,
  parseDocument,
  type DocUnit,
  type ParsedDocument,
} from './parse.js';
import { bookResolver, scanReferences } from './refs.js';

/**
 * Documents on disk (1.17.0-beta.1). The truth is the folder `modules/documents`: a file put
 * there by hand or dropped into the app is read into the library's `documents` / `doc_units`;
 * a file taken away leaves it. Only what changed is read again (size, modification time, the
 * reader's version), so a rescan of an unchanged folder costs a directory listing.
 */

export const DOCUMENTS_FOLDER = 'documents';
export const documentsDir = (modulesDir: string): string => path.join(modulesDir, DOCUMENTS_FOLDER);

/** Deleted documents wait here for «Скасувати» (and a replaced one, for its undo). */
export const DOC_TRASH_DIR = '.trash';
const TRASH_KEEP = 20;
/** How deep subfolders are read: a folder per series or per year is enough. */
const DEPTH = 3;
/** A file over this is no document anyone shows a paragraph of (and would stall the read). */
export const DOC_FILE_MAX = 50 * 1024 * 1024;

export interface DocumentFile {
  /** the path inside the documents folder, with `/`, in one Unicode form */
  file: string;
  size: number;
  mtime: number;
}

/** The document files in the folder and its subfolders (never the trash or hidden ones). */
export function listDocumentFiles(dir: string): DocumentFile[] {
  const out: DocumentFile[] = [];
  const walk = (sub: string, depth: number) => {
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(path.join(dir, sub), { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names) {
      if (d.name.startsWith('.')) continue;
      const rel = sub ? `${sub}/${d.name}` : d.name;
      if (d.isDirectory()) {
        if (depth < DEPTH) walk(rel, depth + 1);
      } else if (d.isFile() && documentKind(d.name)) {
        const st = fs.statSync(path.join(dir, rel), { throwIfNoEntry: false });
        if (st && st.size <= DOC_FILE_MAX)
          out.push({ file: rel.normalize('NFC'), size: st.size, mtime: Math.floor(st.mtimeMs) });
      }
    }
  };
  walk('', 0);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** The file on disk for a stored name (a Mac may keep it in the decomposed form). */
export function documentPath(dir: string, file: string): string | null {
  const direct = path.join(dir, file);
  if (fs.existsSync(direct)) return direct;
  const d = path.join(dir, file.normalize('NFD'));
  return fs.existsSync(d) ? d : null;
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A document's id from its path, so a running-order item finds it again after a rescan. */
export function stableDocId(file: string): number {
  return (fnv1a(file.normalize('NFC').toLowerCase()) % 0x7ffffffe) + 1;
}

interface StoredDoc {
  id: number;
  file: string;
  size: number;
  mtime: number;
  reader: number;
}

export interface DocumentsRefresh {
  /** documents in the library now */
  documents: number;
  /** read (again) this time */
  read: number;
  removed: number;
  /** files that couldn't be read as a document */
  failed: string[];
  /** anything in the library changed */
  changed: boolean;
}

/** Each unit's section: the ord of the heading it stands under (a heading — its own), -1 before any. */
export function docSections(units: Pick<DocUnit, 'kind'>[]): number[] {
  let at = -1;
  return units.map((u, i) => (u.kind === 'heading' ? (at = i) : at));
}

/** A document read before the write (a PDF): its reading, and the file's size and time then. */
export interface PreRead {
  doc: ParsedDocument | null;
  size: number;
  mtime: number;
}

const stale = (d: StoredDoc | undefined, f: DocumentFile) =>
  !d || d.size !== f.size || d.mtime !== f.mtime || d.reader !== DOC_READER;

/**
 * The files of a kind the library doesn't hold as they are now — a PDF is read apart, in a child
 * process (1.17.0-beta.3): the caller reads these and hands them to writeLibraryDocuments.
 */
export function pendingDocuments(libraryPath: string, dir: string, kind: string): DocumentFile[] {
  const files = listDocumentFiles(dir).filter((f) => documentKind(f.file) === kind);
  if (files.length === 0) return [];
  const db = new Database(libraryPath, { readonly: true, fileMustExist: true });
  try {
    const has = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'documents'")
      .get();
    const stored = has
      ? (db.prepare('SELECT id, file, size, mtime, reader FROM documents').all() as StoredDoc[])
      : [];
    const byFile = new Map(stored.map((d) => [d.file, d]));
    return files.filter((f) => stale(byFile.get(f.file), f));
  } finally {
    db.close();
  }
}

/**
 * Bring the library's documents in line with the folder. `lib` is a writable connection to the
 * library (the builder's, inside or outside its transaction, or the server's short-lived one).
 * `pre`: documents read already (a PDF, by the server's child process) — a PDF not in it is left
 * as the library holds it (the builder reads none: the server reads them after a rebuild).
 */
export function writeLibraryDocuments(
  lib: Database.Database,
  dir: string,
  log: (msg: string) => void = () => {},
  pre?: ReadonlyMap<string, PreRead>,
): DocumentsRefresh {
  lib.exec(DOCS_SCHEMA_SQL);
  const stored = lib
    .prepare('SELECT id, file, size, mtime, reader FROM documents')
    .all() as StoredDoc[];
  const byFile = new Map(stored.map((d) => [d.file, d]));
  const files = listDocumentFiles(dir);
  const seen = new Set<string>();
  const toRead: DocumentFile[] = [];
  for (const f of files) {
    seen.add(f.file);
    if (documentKind(f.file) === 'pdf') {
      const p = pre?.get(f.file);
      // not read, or saved again while it was read: left for the next refresh
      if (!p || p.size !== f.size || p.mtime !== f.mtime) continue;
    }
    if (stale(byFile.get(f.file), f)) toRead.push(f);
  }
  const gone = stored.filter((d) => !seen.has(d.file));
  const failed: string[] = [];
  // read the files before taking the write lock: the server keeps reading meanwhile
  const parsed = toRead.flatMap((f) => {
    const p = documentPath(dir, f.file);
    let doc: ParsedDocument | null = null;
    try {
      if (pre?.has(f.file)) doc = pre.get(f.file)!.doc;
      else doc = p ? parseDocument(fs.readFileSync(p), f.file) : null;
    } catch {
      doc = null;
    }
    if (!doc) {
      failed.push(f.file);
      return [];
    }
    return [{ f, doc }];
  });
  // a file that was read before and now fails (half copied, saved by Word right now) keeps
  // nothing stale: its rows go too, the next change reads it again
  const drop = [
    ...gone,
    ...toRead.flatMap((f) => (byFile.has(f.file) ? [byFile.get(f.file)!] : [])),
  ];
  if (drop.length === 0 && parsed.length === 0) {
    return { documents: stored.length, read: 0, removed: 0, failed, changed: false };
  }
  const used = new Set(stored.map((d) => d.id));
  for (const d of drop) used.delete(d.id);
  const delDoc = lib.prepare('DELETE FROM documents WHERE id = ?');
  const delUnits = lib.prepare('DELETE FROM doc_units WHERE document_id = ?');
  const delRefs = lib.prepare('DELETE FROM doc_refs WHERE document_id = ?');
  const insRef = lib.prepare(
    'INSERT OR IGNORE INTO doc_refs (document_id, ord, pos, len, book_number, chapter, verse_from, verse_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  // Bible references by the library's own book names (1.17.0-beta.2); none without a Bible. The
  // names change only with a rebuild, and the builder reads every document again in it
  const hasBooks = !!lib
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'book_names'")
    .get();
  const bookOf = bookResolver(
    hasBooks
      ? (lib.prepare('SELECT DISTINCT book_number, name_norm FROM book_names').all() as {
          book_number: number;
          name_norm: string;
        }[])
      : [],
  );
  const insDoc = lib.prepare(
    'INSERT INTO documents (id, file, title, kind, units, size, mtime, reader) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const insUnit = lib.prepare(
    'INSERT INTO doc_units (document_id, ord, kind, level, section, text, text_norm) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  lib.transaction(() => {
    for (const d of drop) {
      delRefs.run(d.id);
      delUnits.run(d.id);
      delDoc.run(d.id);
    }
    for (const { f, doc } of parsed) {
      // the same file keeps its id; a new one takes its path's, the next free on a clash
      let id = byFile.get(f.file)?.id ?? stableDocId(f.file);
      while (used.has(id)) id = (id % 0x7ffffffe) + 1;
      used.add(id);
      insDoc.run(
        id,
        f.file,
        documentTitle(f.file),
        documentKind(f.file),
        doc.units.length,
        f.size,
        f.mtime,
        DOC_READER,
      );
      const sec = docSections(doc.units);
      doc.units.forEach((u, i) => {
        insUnit.run(id, i, u.kind, u.level, sec[i], u.text, normalizeForSearch(u.text));
        for (const r of scanReferences(u.text)) {
          const book = bookOf(r.token);
          if (book != null) insRef.run(id, i, r.start, r.len, book, r.chapter, r.from, r.to);
        }
      });
    }
  })();
  for (const { f, doc } of parsed) log(`documents: ${f.file} — ${doc.units.length} units`);
  for (const d of gone) log(`documents: ${d.file} — gone from the folder`);
  for (const f of failed) log(`documents: skipped ${f} (not a readable document)`);
  const count = lib.prepare('SELECT COUNT(*) AS n FROM documents').get() as { n: number };
  return {
    documents: count.n,
    read: parsed.length,
    removed: gone.length,
    failed,
    changed: true,
  };
}

/** The same on the library file (the server's read-only connection stays open meanwhile). */
export function refreshLibraryDocuments(
  libraryPath: string,
  dir: string,
  log?: (msg: string) => void,
  pre?: ReadonlyMap<string, PreRead>,
): DocumentsRefresh {
  const db = new Database(libraryPath, { fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000'); // the server may be reading
    return writeLibraryDocuments(db, dir, log, pre);
  } finally {
    db.close();
  }
}

// ── Adding, deleting, undoing ─────────────────────────────────────────────────────────────

/** A file name that's safe on every system the folder may travel to. */
export function safeDocumentName(name: string): string | null {
  const base = name.replace(/^.*[\\/]/, '').normalize('NFC');
  const kind = documentKind(base);
  if (!kind) return null;
  const clean = base
    // eslint-disable-next-line no-control-regex -- control characters are in no file name
    .replace(/[<>:"|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/, '')
    .trim();
  const stem = clean.replace(/\.[^.]+$/, '');
  if (!stem || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(stem)) return null;
  return clean.length > 180 ? `${stem.slice(0, 170)}${clean.slice(stem.length)}` : clean;
}

/** A trashed file's path in the folder waits beside it (`<name>.path`), never coded into its name. */
const PATH_NOTE = '.path';

/** Move a file into the trash; returns its name there (for «Скасувати»). */
export function trashDocument(dir: string, file: string): string | null {
  const from = documentPath(dir, file);
  if (!from) return null;
  const trash = path.join(dir, DOC_TRASH_DIR);
  fs.mkdirSync(trash, { recursive: true });
  const base = path.basename(file);
  let stamp = Date.now();
  while (fs.existsSync(path.join(trash, `${stamp}-${base}`))) stamp++;
  const name = `${stamp}-${base}`;
  fs.renameSync(from, path.join(trash, name));
  fs.writeFileSync(path.join(trash, name + PATH_NOTE), file);
  // the trash keeps the last few
  const old = fs
    .readdirSync(trash)
    .filter((n) => /^\d+-/.test(n) && !n.endsWith(PATH_NOTE))
    .sort()
    .reverse()
    .slice(TRASH_KEEP);
  for (const n of old) {
    fs.rmSync(path.join(trash, n), { force: true });
    fs.rmSync(path.join(trash, n + PATH_NOTE), { force: true });
  }
  return name;
}

/**
 * Bring a trashed file back to where it was; null when its place is taken, it's gone, or the
 * place it names is not a document inside the folder.
 */
export function restoreDocument(dir: string, trashed: string): string | null {
  if (!/^\d+-[^/\\]+$/.test(trashed) || trashed.endsWith(PATH_NOTE)) return null;
  const trash = path.join(dir, DOC_TRASH_DIR);
  const from = path.join(trash, trashed);
  if (!fs.existsSync(from)) return null;
  let file = trashed.replace(/^\d+-/, '');
  try {
    file = fs.readFileSync(path.join(trash, trashed + PATH_NOTE), 'utf8').trim() || file;
  } catch {
    /* no note: it lay right in the folder */
  }
  const root = path.resolve(dir);
  const to = path.resolve(root, file);
  const rel = path.relative(root, to);
  if (
    !documentKind(rel) ||
    rel.startsWith('..') ||
    path.isAbsolute(rel) ||
    rel.split(path.sep).some((part) => part.startsWith('.'))
  )
    return null;
  if (fs.existsSync(to)) return null;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  fs.rmSync(path.join(trash, trashed + PATH_NOTE), { force: true });
  return rel.split(path.sep).join('/').normalize('NFC');
}

export interface DocumentAdded {
  file: string;
  /** a file of that name was there with other content: it waits in the trash under this name */
  replaced: string | null;
  /** the same bytes were there already: nothing was written */
  same: boolean;
}

/**
 * Put a dropped file into the folder. A file of the same name with the same bytes stays; with
 * other bytes it's replaced (a newer copy of the same sermon), the old one going to the trash.
 */
export function addDocumentFile(
  dir: string,
  name: string,
  bytes: Uint8Array,
): DocumentAdded | null {
  const file = safeDocumentName(name);
  if (!file) return null;
  fs.mkdirSync(dir, { recursive: true });
  const at = documentPath(dir, file);
  if (at) {
    const old = fs.readFileSync(at);
    if (old.length === bytes.length && old.equals(Buffer.from(bytes)))
      return { file, replaced: null, same: true };
  }
  const replaced = at ? trashDocument(dir, file) : null;
  const tmp = path.join(dir, `.${file}.part`);
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, path.join(dir, file));
  return { file, replaced, same: false };
}
