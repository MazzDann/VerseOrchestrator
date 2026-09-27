import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { normalizeForSearch, SCHEMA_SQL, type SegmentManifest, type SegmentInfo } from '@vo/shared';

/**
 * Split a built library into SEGMENTS — small, self-contained SQLite files (same schema)
 * that a browser engine downloads only as needed and merges into one working database:
 *
 *   t-<id>.vodb.gz        one translation: translations/books/book_names/verses rows,
 *                         its slice of the segmented FTS and of verse_strongs
 *   d-<id>.vodb.gz        one dictionary (they're big: 111 MB together)
 *   study.vodb.gz         cross-references + commentaries
 *   songs.vodb.gz         hymns
 *
 * Verse ids stay GLOBAL (as in the source library), so any set of translation segments
 * merges by plain INSERTs — no renumbering. Files are gzip-compressed (SQLite pages
 * compress ~3×); the browser inflates them with DecompressionStream. manifest.json lists
 * each segment with its size and SHA-256 (the cache key).
 */

export const SEGMENT_FORMAT = 1;

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Create an empty segment database with the library schema. */
function newSegment(file: string): Database.Database {
  fs.rmSync(file, { force: true });
  const db = new Database(file);
  db.pragma('journal_mode = OFF');
  db.pragma('synchronous = OFF');
  db.exec(SCHEMA_SQL);
  return db;
}

/** Finish a segment: VACUUM, gzip next to it, return its manifest entry. */
function seal(
  db: Database.Database,
  file: string,
  info: Omit<SegmentInfo, 'file' | 'bytes' | 'rawBytes' | 'sha256'>,
): SegmentInfo {
  db.exec("INSERT INTO verses_fts(verses_fts) VALUES('optimize')");
  db.exec('VACUUM');
  db.close();
  const raw = fs.readFileSync(file);
  const gz = zlib.gzipSync(raw, { level: 9 });
  const out = `${file}.gz`;
  fs.writeFileSync(out, gz);
  fs.rmSync(file);
  return {
    ...info,
    file: path.basename(out),
    bytes: gz.length,
    rawBytes: raw.length,
    sha256: sha256(gz),
  };
}

export function buildSegments(libraryPath: string, outDir: string): SegmentManifest {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.vodb.gz') || f === 'manifest.json') fs.rmSync(path.join(outDir, f));
  }
  const lib = new Database(libraryPath, { readonly: true, fileMustExist: true });
  const has = (t: string) =>
    !!lib.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table') AND name = ?").get(t);
  const segments: SegmentInfo[] = [];

  // --- one segment per translation
  const translations = lib.prepare('SELECT * FROM translations ORDER BY id').all() as Record<
    string,
    unknown
  >[];
  for (const t of translations) {
    const id = Number(t.id);
    const file = path.join(outDir, `t-${id}.vodb`);
    const seg = newSegment(file);
    const copy = (table: string, where: string, params: unknown[]) => {
      const rows = lib.prepare(`SELECT * FROM ${table} WHERE ${where}`).all(...params) as Record<
        string,
        unknown
      >[];
      if (rows.length === 0) return 0;
      const cols = Object.keys(rows[0]);
      const ins = seg.prepare(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      );
      seg.transaction(() => {
        for (const r of rows) ins.run(...cols.map((c) => r[c]));
      })();
      return rows.length;
    };
    copy('translations', 'id = ?', [id]);
    copy('books', 'translation_id = ?', [id]);
    copy('book_names', 'translation_id = ?', [id]);
    const verses = copy('verses', 'translation_id = ?', [id]);
    if (has('verse_strongs')) copy('verse_strongs', 'translation_id = ?', [id]);
    // FTS is contentless in the library, so rebuild this translation's slice from the
    // verse text (same normalization the builder used).
    const insFts = seg.prepare('INSERT INTO verses_fts (rowid, text_norm, tr) VALUES (?, ?, ?)');
    seg.transaction(() => {
      for (const v of lib
        .prepare('SELECT id, text, text_raw FROM verses WHERE translation_id = ?')
        .iterate(id) as Iterable<{
        id: number;
        text: string;
        text_raw: string | null;
      }>) {
        insFts.run(v.id, normalizeForSearch(v.text_raw ?? v.text ?? ''), `t${id}`);
      }
    })();
    segments.push(
      seal(seg, file, {
        kind: 'translation',
        id,
        abbr: String(t.abbr ?? ''),
        title: String(t.title ?? ''),
        language: String(t.language ?? ''),
        items: verses,
      }),
    );
  }

  // --- one segment per dictionary
  if (has('dictionaries')) {
    const dicts = lib.prepare('SELECT * FROM dictionaries ORDER BY id').all() as Record<
      string,
      unknown
    >[];
    for (const d of dicts) {
      const id = Number(d.id);
      const file = path.join(outDir, `d-${id}.vodb`);
      const seg = newSegment(file);
      seg
        .prepare(
          'INSERT INTO dictionaries (id, abbr, name, language, type, is_strong) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, d.abbr, d.name, d.language, d.type, d.is_strong);
      const ins = seg.prepare(
        'INSERT INTO dictionary_entries (dictionary_id, topic, topic_norm, strong_lang, definition) VALUES (?, ?, ?, ?, ?)',
      );
      let n = 0;
      seg.transaction(() => {
        for (const e of lib
          .prepare(
            'SELECT topic, topic_norm, strong_lang, definition FROM dictionary_entries WHERE dictionary_id = ?',
          )
          .iterate(id) as Iterable<Record<string, unknown>>) {
          ins.run(id, e.topic, e.topic_norm, e.strong_lang, e.definition);
          n += 1;
        }
      })();
      segments.push(
        seal(seg, file, {
          kind: 'dictionary',
          id,
          abbr: String(d.abbr ?? ''),
          title: String(d.name ?? ''),
          language: String(d.language ?? ''),
          items: n,
        }),
      );
    }
  }

  // --- study helpers and songs: small, shared across translations
  const bundle = (name: string, kind: SegmentInfo['kind'], tables: string[], title: string) => {
    const present = tables.filter(has);
    if (present.length === 0) return;
    const file = path.join(outDir, `${name}.vodb`);
    const seg = newSegment(file);
    let items = 0;
    for (const table of present) {
      const rows = lib.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      if (rows.length === 0) continue;
      const cols = Object.keys(rows[0]);
      const ins = seg.prepare(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      );
      seg.transaction(() => {
        for (const r of rows) ins.run(...cols.map((c) => r[c]));
      })();
      items += rows.length;
    }
    segments.push(seal(seg, file, { kind, abbr: name, title, language: '', items }));
  };
  bundle(
    'study',
    'study',
    ['cross_references', 'commentaries'],
    'Перехресні посилання й коментарі',
  );
  bundle('songs', 'songs', ['songs', 'song_slides'], 'Пісні');

  lib.close();
  const manifest: SegmentManifest = {
    format: SEGMENT_FORMAT,
    createdAt: new Date().toISOString(),
    segments,
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
