import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { BUNDLE_EXT, type BundleSong, type SlideStyleSpec } from '@vo/shared';
import { ApiError } from './db.js';
import {
  bundlesDir,
  legacySongsDir,
  syncFolderBundle,
  refreshLibrarySongs,
} from '@vo/shared/songs-node';

/**
 * Song bundles at the server's start (0.10.0): a library built before bundles — or bundles
 * changed since the library was built — gets its songs from the bundles again, without a
 * full rebuild. A folder of .pptx songs (the way songs came in before bundles) feeds its
 * bundle first — made from it the first time, updated when a file in it is newer.
 */

const mtime = (file: string): number => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
};

/** Does the library's songs table have the `bundle` column (0.10.0)? */
function hasBundleColumn(libraryPath: string): boolean {
  const db = new Database(libraryPath, { readonly: true, fileMustExist: true });
  try {
    const cols = db.prepare('PRAGMA table_info(songs)').all() as { name: string }[];
    return cols.some((c) => c.name === 'bundle');
  } finally {
    db.close();
  }
}

export function syncSongsAtStart(opts: {
  dataDir: string;
  repoRoot: string;
  libraryPath: string;
  log: (msg: string) => void;
}): void {
  const { dataDir, repoRoot, libraryPath, log } = opts;
  if (!fs.existsSync(libraryPath)) return;
  const dir = bundlesDir(dataDir);
  const started = Date.now();
  syncFolderBundle(dir, legacySongsDir(repoRoot), log);
  const newest = fs.existsSync(dir)
    ? Math.max(
        0,
        ...fs
          .readdirSync(dir)
          .filter((f) => f.toLowerCase().endsWith(BUNDLE_EXT))
          .map((f) => mtime(path.join(dir, f))),
      )
    : 0;
  if (newest === 0) return;
  const built = Math.max(mtime(libraryPath), mtime(`${libraryPath}-wal`));
  if (newest <= built && hasBundleColumn(libraryPath)) return;
  const n = refreshLibrarySongs(libraryPath, dir);
  log(`songs: ${n} from the bundles into the library (${Date.now() - started} ms)`);
}

const bad = (why: string) => new ApiError(400, `Імпорт пісень: ${why}`);
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const ALIGNS = new Set(['left', 'center', 'right']);

/** A slide's faithful style as the browser's .pptx reader makes it, or null. */
function parseStyle(v: unknown): SlideStyleSpec | null {
  if (v === null || v === undefined) return null;
  const s = v as Record<string, unknown>;
  const ok =
    isText(s.bg, 32) &&
    isText(s.color, 32) &&
    isText(s.font, 200) &&
    typeof s.bold === 'boolean' &&
    ALIGNS.has(s.align as string) &&
    ['x', 'y', 'w', 'h', 'size'].every((k) => isNum(s[k]));
  if (!ok) throw bad('незрозумілий вигляд слайда');
  return {
    bg: s.bg as string,
    color: s.color as string,
    font: s.font as string,
    bold: s.bold as boolean,
    align: s.align as SlideStyleSpec['align'],
    x: s.x as number,
    y: s.y as number,
    w: s.w as number,
    h: s.h as number,
    size: s.size as number,
  };
}

/**
 * The body of `POST /api/song-bundles/import` (0.10.1): where to (an existing bundle's id,
 * or a name for a new one) and the songs the browser read from .pptx files.
 */
export function parseSongImport(body: unknown): {
  target: { id: string } | { name: string };
  songs: BundleSong[];
} {
  const b = (body ?? {}) as { target?: { id?: unknown; name?: unknown }; songs?: unknown };
  const t = b.target ?? {};
  let target: { id: string } | { name: string };
  if (isText(t.id, 100) && t.id) target = { id: t.id };
  else if (isText(t.name, 100) && t.name.trim()) target = { name: t.name.trim() };
  else throw bad('вкажіть бандл або назву нового');
  if (!Array.isArray(b.songs) || b.songs.length === 0) throw bad('немає пісень');
  if (b.songs.length > 5000) throw bad('забагато пісень за раз (до 5000)');
  const songs = b.songs.map((raw) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    if (!isText(s.key, 300) || !s.key.trim()) throw bad('пісня без назви файлу');
    if (!isText(s.title, 300)) throw bad(`«${s.key}»: назва`);
    if (s.number !== null && !(Number.isInteger(s.number) && (s.number as number) >= 0))
      throw bad(`«${s.key}»: номер`);
    if (!Array.isArray(s.slides) || s.slides.length === 0 || s.slides.length > 500)
      throw bad(`«${s.key}»: слайди`);
    return {
      key: s.key.trim(),
      number: s.number as number | null,
      title: s.title,
      slides: s.slides.map((sl) => {
        const x = (sl ?? {}) as { text?: unknown; style?: unknown };
        if (!isText(x.text, 20000)) throw bad(`«${s.key}»: текст слайда`);
        return { text: x.text, style: parseStyle(x.style) };
      }),
    };
  });
  return { target, songs };
}
