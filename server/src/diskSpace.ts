import fs from 'node:fs';
import path from 'node:path';

/**
 * «Дані → Місце на диску» (1.17.0-beta.4, the Mac's idea of 2026-10-12): what the app keeps on
 * disk, part by part, and «Прибрати» for what can go — what the app makes again by itself (small
 * copies, posters), what only waits for an undo (the trashes, old backups, the previous version),
 * and what is heavy and optional (a model's files, the vectors). The user's own data (settings,
 * songs, pictures, documents, the library) is shown, never removed here.
 */

export type DiskPartId =
  | 'app'
  | 'previous'
  | 'updates'
  | 'library'
  | 'segments'
  | 'modules'
  | 'vectors'
  | 'models'
  | 'album-cache'
  | 'video-cache'
  | 'images'
  | 'images-trash'
  | 'documents-trash'
  | 'backups'
  | 'backups-old'
  | 'logs-old'
  /** the rest of the data folder: settings, songs, the running orders, the UI's state */
  | 'data-other';

export interface DiskPart {
  id: DiskPartId;
  /** for a model: its id */
  sub?: string;
  bytes: number;
  /** can «Прибрати» take it (the server may still refuse while busy) */
  removable: boolean;
}

/**
 * A folder's (or a file's) size: every file under it, links inside not followed (the folder
 * itself may be one — modules/ linked to another drive).
 */
export async function sizeOf(p: string, root = true): Promise<number> {
  let st: fs.Stats;
  try {
    st = await (root ? fs.promises.stat(p) : fs.promises.lstat(p));
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.isFile() ? st.size : 0;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(p, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  // a few at a time: node_modules holds tens of thousands of files
  for (let i = 0; i < entries.length; i += 64) {
    const sizes = await Promise.all(
      entries.slice(i, i + 64).map((e) => sizeOf(path.join(p, e.name), false)),
    );
    for (const s of sizes) total += s;
  }
  return total;
}

const inside = (dir: string, file: string) => !path.relative(dir, file).startsWith('..');

/** A SQLite file with its -wal and -shm. */
export const dbFiles = (file: string) => [file, `${file}-wal`, `${file}-shm`];

export interface DiskPlaces {
  dataDir: string;
  modulesDir: string;
  documentsDir: string;
  libraryPath: string;
  /** the release folder (app/ next to data/ and modules/); null in a repository clone */
  top: string | null;
}

/** Every part with its size. */
export async function diskParts(p: DiskPlaces): Promise<DiskPart[]> {
  const d = (...parts: string[]) => path.join(p.dataDir, ...parts);
  const sum = async (files: string[]) =>
    (await Promise.all(files.map((f) => sizeOf(f)))).reduce((a, b) => a + b, 0);
  const parts: DiskPart[] = [];
  const add = (id: DiskPartId, bytes: number, removable: boolean, sub?: string) => {
    if (bytes > 0) parts.push({ id, bytes, removable, ...(sub ? { sub } : {}) });
  };
  if (p.top) {
    add('app', await sizeOf(path.join(p.top, 'app')), false);
    add(
      'previous',
      await sum(
        ['app.previous', 'app.previous.old', 'app.failed'].map((f) => path.join(p.top!, f)),
      ),
      true,
    );
    add('updates', await sum([d('updates'), path.join(p.top, 'app.next.part')]), true);
  }
  add('library', await sum(dbFiles(p.libraryPath)), false);
  const docsTrash = await sizeOf(path.join(p.documentsDir, '.trash'));
  // the documents' trash is shown apart (it sits inside modules/documents)
  add('modules', (await sizeOf(p.modulesDir)) - docsTrash, false);
  add('segments', await sizeOf(d('segments')), false);
  add('vectors', await sum(dbFiles(d('vectors.db'))), true);
  try {
    for (const m of fs.readdirSync(d('models'), { withFileTypes: true }))
      if (m.isDirectory()) add('models', await sizeOf(d('models', m.name)), true, m.name);
  } catch {
    /* no models */
  }
  add('album-cache', await sizeOf(d('album-cache')), true);
  add('video-cache', await sizeOf(d('video-cache')), true);
  const imagesTrash = await sizeOf(d('images', '.trash'));
  add('images', (await sizeOf(d('images'))) - imagesTrash, false);
  add('images-trash', imagesTrash, true);
  add('documents-trash', docsTrash, true);
  const old = await oldBackups(d('backups'));
  const oldBytes = await sum(old);
  add('backups', (await sizeOf(d('backups'))) - oldBytes, false);
  add('backups-old', oldBytes, true);
  add('logs-old', await sizeOf(d('standby.log.old')), true);
  // what the parts above leave of the data folder («updates» counts app.next.part beside app/ too)
  const inData = (x: DiskPart) =>
    x.id === 'library'
      ? inside(p.dataDir, p.libraryPath)
      : x.id === 'modules' || x.id === 'documents-trash'
        ? inside(p.dataDir, p.modulesDir)
        : x.id !== 'app' && x.id !== 'previous';
  const counted = parts.filter(inData).reduce((a, x) => a + x.bytes, 0);
  const appNextPart = p.top ? await sizeOf(path.join(p.top, 'app.next.part')) : 0;
  add('data-other', Math.max(0, (await sizeOf(p.dataDir)) - counted + appNextPart), false);
  return parts;
}

/**
 * The backups that may go: every automatic copy but the newest of each kind (daily, before an
 * update), every state kept before a restore but the newest; never the files of an undo that may
 * still come (pending.*, last-restore.json).
 */
export async function oldBackups(dir: string): Promise<string[]> {
  const out: string[] = [];
  const keepNewest = (names: string[], kindOf: (n: string) => string) => {
    const newest = new Map<string, string>();
    for (const n of names) {
      const k = kindOf(n);
      const had = newest.get(k);
      if (!had || n > had) newest.set(k, n);
    }
    return names.filter((n) => newest.get(kindOf(n)) !== n);
  };
  const auto = path.join(dir, 'auto');
  try {
    const zips = fs.readdirSync(auto).filter((n) => n.endsWith('.zip'));
    // «auto-daily-<time>-…» / «auto-update-<time>-…»: the time sorts them
    for (const n of keepNewest(zips, (x) => /^auto-([a-z]+)-/.exec(x)?.[1] ?? x))
      out.push(path.join(auto, n));
  } catch {
    /* no automatic copies */
  }
  try {
    // «before-restore-<time>», «before-undo-<time>»… (backup.ts)
    const states = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^before-[a-z]+-/.test(e.name))
      .map((e) => e.name);
    for (const n of keepNewest(states, (x) => /^before-([a-z]+)-/.exec(x)?.[1] ?? x))
      out.push(path.join(dir, n));
  } catch {
    /* no backups */
  }
  return out;
}

/** Remove files and folders; returns the bytes freed (what Windows still holds stays, uncounted). */
export async function removeAll(paths: string[]): Promise<number> {
  let freed = 0;
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    const bytes = await sizeOf(p);
    try {
      fs.rmSync(p, { recursive: true, force: true });
      freed += bytes;
    } catch {
      freed += bytes - (await sizeOf(p)); // in use (Windows): the rest next time
    }
  }
  return freed;
}
