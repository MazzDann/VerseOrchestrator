import { normalizeForSearch } from '../normalize.js';
import type { SongSlide } from './pptx.js';

/**
 * Song bundles (0.10.0): a songbook in a file of its own — `data/songs/NAME.vosongs`, a small
 * SQLite database with the plain text and the look of every slide — so it can be copied to
 * another computer or handed to someone, and the .pptx files it came from aren't needed any
 * more. The library takes the songs of every bundle. A song's id there comes from its
 * bundle's id and its key, so it stays the same across rebuilds and the running order keeps
 * pointing at the right song (sequential ids shifted whenever a file was added before others).
 *
 * The helpers take a synchronous database (better-sqlite3 on the server and in the builder)
 * through `SyncDb`, so this file stays free of Node-only imports.
 */

export const BUNDLE_EXT = '.vosongs';
export const BUNDLE_FORMAT = 1;

export const BUNDLE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- one row per song; key = the source file's name without .pptx (a re-import replaces it)
CREATE TABLE IF NOT EXISTS songs (
  key    TEXT PRIMARY KEY,
  number INTEGER,
  title  TEXT NOT NULL,
  slides TEXT NOT NULL      -- JSON [{text, style}], style as in pptx.ts or null
);
`;

export interface BundleMeta {
  /** Never changes, also when the bundle is renamed: song ids come from it. */
  id: string;
  name: string;
  format: number;
  created: string;
  /** The .pptx folder (its name, not its path) that keeps this bundle up to date, if any. */
  source?: string;
  /**
   * The .pptx reader (`PPTX_READER`) that last read the folder into it — a folder-fed bundle
   * written by an older one is read again (1.2.1). Absent: before 1.2.1.
   */
  reader?: number;
}

export interface BundleSong {
  key: string;
  number: number | null;
  title: string;
  slides: SongSlide[];
}

export interface Bundle {
  meta: BundleMeta;
  songs: BundleSong[];
}

/** The part of a better-sqlite3 `Database` the helpers use. */
export interface SyncDb {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  transaction(fn: () => void): () => void;
}

/** FNV-1a (32-bit) of a string. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A song's library id: stable for (bundle, key), positive, 31-bit. */
export function stableSongId(bundleId: string, key: string): number {
  return fnv1a(`${bundleId}\n${key}`) & 0x7fffffff || 1;
}

/**
 * Do two bundle names name the same bundle? The library tells bundles apart by name, so
 * «ПС» and « пс» must not become two (case, outer spaces and the Unicode form don't count).
 */
export function sameBundleName(a: string, b: string): boolean {
  const norm = (s: string) => s.normalize('NFC').trim().toLocaleLowerCase('uk');
  return norm(a) === norm(b);
}

/** A file name for a bundle called `name`, not one of `taken` (lower-cased names). */
export function bundleFileName(name: string, taken: Iterable<string> = []): string {
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  const base =
    name
      .normalize('NFC')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'songs';
  for (let n = 1; ; n++) {
    const file = `${n === 1 ? base : `${base}-${n}`}${BUNDLE_EXT}`;
    if (!used.has(file.toLowerCase())) return file;
  }
}

/** Create the tables (a new or an existing bundle file). */
export function prepareBundle(db: SyncDb): void {
  db.exec(BUNDLE_SCHEMA_SQL);
}

export function writeBundleMeta(db: SyncDb, meta: BundleMeta): void {
  const put = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
  db.transaction(() => {
    put.run('id', meta.id);
    put.run('name', meta.name);
    put.run('format', String(meta.format));
    put.run('created', meta.created);
    if (meta.source) put.run('source', meta.source);
    if (meta.reader) put.run('reader', String(meta.reader));
  })();
}

/** The bundle's meta, or null when the file isn't a bundle. */
export function readBundleMeta(db: SyncDb): BundleMeta | null {
  let rows: { key: string; value: string }[];
  try {
    rows = db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[];
  } catch {
    return null;
  }
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const id = m.get('id');
  const name = m.get('name');
  if (!id || !name) return null;
  const source = m.get('source');
  const reader = Number(m.get('reader'));
  return {
    id,
    name,
    format: Number(m.get('format') ?? 1),
    created: m.get('created') ?? '',
    ...(source ? { source } : {}),
    ...(reader > 0 ? { reader } : {}),
  };
}

/**
 * A bundle's songs, keys and titles composed (NFC) — see `songKey`. A bundle written before
 * that may hold one song under two spellings of its key (1.3.0 on a Mac: a Windows reading
 * plus the Mac's); it reads as one song, the row written last.
 */
export function readBundleSongs(db: SyncDb): BundleSong[] {
  const rows = db.prepare('SELECT key, number, title, slides FROM songs ORDER BY rowid').all() as {
    key: string;
    number: number | null;
    title: string;
    slides: string;
  }[];
  const byKey = new Map<string, BundleSong>();
  for (const r of rows) {
    const key = r.key.normalize('NFC');
    byKey.delete(key); // keep the order of the row that wins
    byKey.set(key, {
      key,
      number: r.number,
      title: r.title.normalize('NFC'),
      slides: JSON.parse(r.slides) as SongSlide[],
    });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      (a.number === null ? 1 : 0) - (b.number === null ? 1 : 0) ||
      (a.number ?? 0) - (b.number ?? 0) ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
}

/** How many songs a bundle holds — two spellings of one key count once. */
export function countBundleSongs(db: SyncDb): number {
  const rows = db.prepare('SELECT key FROM songs').all() as { key: string }[];
  return new Set(rows.map((r) => r.key.normalize('NFC'))).size;
}

/**
 * Add songs, replacing the ones with the same key — under any spelling of it: the key is
 * stored composed (NFC), another spelling of it already in the bundle goes.
 */
export function upsertBundleSongs(
  db: SyncDb,
  songs: BundleSong[],
): { added: number; updated: number } {
  const spellings = new Map<string, string[]>();
  for (const { key } of db.prepare('SELECT key FROM songs').all() as { key: string }[]) {
    const nfc = key.normalize('NFC');
    spellings.set(nfc, [...(spellings.get(nfc) ?? []), key]);
  }
  const drop = db.prepare('DELETE FROM songs WHERE key = ?');
  const put = db.prepare(
    'INSERT OR REPLACE INTO songs (key, number, title, slides) VALUES (?, ?, ?, ?)',
  );
  let added = 0;
  let updated = 0;
  db.transaction(() => {
    for (const s of songs) {
      const key = s.key.normalize('NFC');
      const old = spellings.get(key);
      if (old?.length) updated++;
      else added++;
      for (const k of old ?? []) if (k !== key) drop.run(k);
      spellings.set(key, [key]);
      put.run(key, s.number, s.title.normalize('NFC'), JSON.stringify(s.slides));
    }
  })();
  return { added, updated };
}

/**
 * Replace the library's songs with those of `bundles` (in the order given): stable ids,
 * each song tagged with its bundle's name. Returns how many songs went in.
 */
export function writeLibrarySongs(lib: SyncDb, bundles: Bundle[]): number {
  // a library built before bundles has no `bundle` column yet
  const cols = lib.prepare('PRAGMA table_info(songs)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'bundle')) lib.exec('ALTER TABLE songs ADD COLUMN bundle TEXT');
  const insSong = lib.prepare(
    'INSERT INTO songs (id, number, title, title_norm, bundle) VALUES (?, ?, ?, ?, ?)',
  );
  const insSlide = lib.prepare(
    'INSERT INTO song_slides (song_id, ord, text, render) VALUES (?, ?, ?, ?)',
  );
  const used = new Set<number>();
  let count = 0;
  lib.transaction(() => {
    lib.exec('DELETE FROM song_slides; DELETE FROM songs;');
    for (const b of bundles) {
      for (const s of b.songs) {
        let id = stableSongId(b.meta.id, s.key);
        while (used.has(id)) id = (id % 0x7fffffff) + 1; // a hash collision: the next free id
        used.add(id);
        insSong.run(id, s.number, s.title, normalizeForSearch(s.title), b.meta.name);
        s.slides.forEach((sl, i) =>
          insSlide.run(id, i, sl.text, sl.style ? JSON.stringify(sl.style) : null),
        );
        count++;
      }
    }
  })();
  return count;
}
