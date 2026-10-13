import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * «Статистика показу» (1.18.0-beta.4): what was on screen, when and how long — in data/stats.db,
 * a file of its own (library.db is built again; this one is the operator's history). The server
 * writes it from the screen frames the control window in charge already sends the hub for the
 * remotes (live.ts): one row per showing — a passage, a song, a document, a picture … — not per
 * stanza, page or paragraph, so the counts are what people mean by «we sang it twice».
 */

/** The control window's screen summary (web lib/slide.ts ScreenSummary), as far as stats read it. */
interface ScreenLike {
  status?: unknown;
  reference?: unknown;
  text?: unknown;
  kind?: unknown;
  source?: unknown;
}

export type ShownKind =
  | 'verses'
  | 'song'
  | 'doc'
  | 'text'
  | 'picture'
  | 'album'
  | 'video'
  | 'cover'
  | 'countdown'
  | 'qr';

export interface ShownItem {
  kind: ShownKind;
  /** what makes two showings the same thing (a passage, a song …) */
  key: string;
  label: string;
  /** the first words of a free text */
  detail?: string;
  book?: number;
  chapter?: number;
  from?: number;
  to?: number;
  songId?: number;
  docId?: number;
  /** a speaker's remote put it there: its name */
  by?: string;
}

const str = (x: unknown, max = 200) => (typeof x === 'string' ? x.slice(0, max) : '');
const int = (x: unknown) => (Number.isInteger(x) ? (x as number) : undefined);

/** What a screen summary shows, as a row of statistics; null for an empty, blank or black screen. */
export function shownOf(screen: unknown): ShownItem | null {
  if (!screen || typeof screen !== 'object') return null;
  const s = screen as ScreenLike;
  if (s.status !== 'live') return null;
  const label = str(s.reference) || str(s.text, 120);
  const src = (s.source && typeof s.source === 'object' ? s.source : {}) as Record<string, unknown>;
  const by = str(src.by, 60) || undefined;
  if (s.kind === 'qr') return { kind: 'qr', key: 'qr', label: '' };
  if (s.kind === 'countdown') return { kind: 'countdown', key: 'countdown', label: '' };
  if (s.kind === 'cover') return { kind: 'cover', key: 'cover', label: '' };
  if (src.kind === 'verses') {
    const book = int(src.bookNumber);
    const chapter = int(src.chapter);
    const verses = Array.isArray(src.verses) ? src.verses.filter(Number.isInteger) : [];
    if (book === undefined || chapter === undefined) return null;
    const from = verses.length ? Math.min(...(verses as number[])) : undefined;
    const to = verses.length ? Math.max(...(verses as number[])) : undefined;
    return {
      kind: 'verses',
      key: `v:${book}:${chapter}:${from ?? ''}-${to ?? ''}`,
      label,
      book,
      chapter,
      from,
      to,
      by,
    };
  }
  if (src.kind === 'song' && int(src.songId) !== undefined)
    return { kind: 'song', key: `s:${src.songId}`, label, songId: int(src.songId), by };
  if (src.kind === 'doc' && int(src.docId) !== undefined)
    return { kind: 'doc', key: `d:${src.docId}`, label, docId: int(src.docId), by };
  if (src.kind === 'album' && typeof src.albumId === 'string')
    return { kind: 'album', key: `a:${src.albumId}`, label: label || str(src.name), by };
  if (src.kind === 'video' || s.kind === 'video')
    return { kind: 'video', key: `vid:${str(src.videoId) || str(s.text)}`, label: str(s.text), by };
  if (s.kind === 'picture') return { kind: 'picture', key: `p:${str(s.text)}`, label: str(s.text) };
  // free text, a custom slide: the same words are the same thing
  const detail = str(s.text, 120);
  return { kind: 'text', key: `t:${label}\n${detail}`, label, detail };
}

/** Back on screen within this long after it went: the same showing goes on (a «Очистити» and back). */
export const RESUME_MS = 2 * 60_000;
/** «Давно не співали»: a song shown before, but not in this long. */
export const FORGOTTEN_MS = 8 * 7 * 24 * 3600_000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS shown (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  until INTEGER,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT,
  book INTEGER,
  chapter INTEGER,
  verse_from INTEGER,
  verse_to INTEGER,
  song_id INTEGER,
  doc_id INTEGER,
  by TEXT,
  gap INTEGER NOT NULL DEFAULT 0,
  seen INTEGER
);
CREATE INDEX IF NOT EXISTS shown_at ON shown(at);
CREATE INDEX IF NOT EXISTS shown_song ON shown(song_id) WHERE song_id IS NOT NULL;
`;

export interface ShownRow {
  id: number;
  at: number;
  until: number | null;
  kind: ShownKind;
  label: string;
  detail: string | null;
  book: number | null;
  chapter: number | null;
  verse_from: number | null;
  verse_to: number | null;
  song_id: number | null;
  doc_id: number | null;
  by: string | null;
  /** the time it was off screen in between (a «Очистити» and back within RESUME_MS) */
  gap: number;
}

/** How long a showing was on screen, without the gaps it went on across. */
export const shownMs = (r: Pick<ShownRow, 'at' | 'until' | 'gap'>, now: number) =>
  (r.until ?? now) - r.at - r.gap;

/** How often the open showing marks itself as still on screen — what a crash keeps of its length. */
export const SEEN_MS = 30_000;

export interface StatsSummary {
  from: number;
  to: number;
  total: { shows: number; ms: number; days: number };
  kinds: { kind: ShownKind; shows: number; ms: number }[];
  songs: { songId: number; label: string; shows: number; ms: number; last: number }[];
  books: { book: number; shows: number; ms: number }[];
  passages: { label: string; book: number; shows: number; last: number }[];
  docs: { docId: number; label: string; shows: number; ms: number; last: number }[];
  days: { day: string; shows: number; ms: number }[];
  /** songs shown before, but not in the last eight weeks — the most shown first */
  forgotten: { songId: number; label: string; shows: number; last: number }[];
}

export const statsPath = (dataDir: string) => path.join(dataDir, 'stats.db');

/** The day of a moment on this computer's clock, «2026-10-13». */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function createStats(file: string, now: () => number = Date.now) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  // a file from before the columns (a test copy of this beta): they come with their defaults
  const cols = new Set(
    (db.prepare('PRAGMA table_info(shown)').all() as { name: string }[]).map((c) => c.name),
  );
  if (!cols.has('gap')) db.exec('ALTER TABLE shown ADD COLUMN gap INTEGER NOT NULL DEFAULT 0');
  if (!cols.has('seen')) db.exec('ALTER TABLE shown ADD COLUMN seen INTEGER');
  // a showing left open by a stop the server didn't see (a crash, power, a process killed): it was
  // on screen until its last mark at least
  db.prepare('UPDATE shown SET until = MAX(at, COALESCE(seen, at)) WHERE until IS NULL').run();

  let open: { id: number; key: string } | null = null;
  let last: { id: number; key: string; until: number } | null = null;
  const insert = db.prepare(`INSERT INTO shown
    (at, kind, key, label, detail, book, chapter, verse_from, verse_to, song_id, doc_id, by)
    VALUES (@at, @kind, @key, @label, @detail, @book, @chapter, @from, @to, @songId, @docId, @by)`);
  const closeRow = db.prepare('UPDATE shown SET until = ? WHERE id = ?');
  const reopenRow = db.prepare('UPDATE shown SET until = NULL, gap = gap + ? WHERE id = ?');
  const seenRow = db.prepare('UPDATE shown SET seen = ? WHERE id = ?');
  // the open showing's mark (SEEN_MS): an exit nobody handles (a kill, a crash) loses at most that
  const beat = setInterval(() => {
    if (open) seenRow.run(now(), open.id);
  }, SEEN_MS);
  beat.unref();

  function close(at = now()): void {
    if (!open) return;
    closeRow.run(at, open.id);
    last = { ...open, until: at };
    open = null;
  }

  /** What is on screen now (null: nothing) — a new row when it changed. */
  function note(item: ShownItem | null, at = now()): void {
    if (item && open?.key === item.key) return;
    close(at);
    if (!item) return;
    if (last && last.key === item.key && at - last.until < RESUME_MS) {
      // the same showing goes on; the time it was away isn't time on screen (review)
      reopenRow.run(at - last.until, last.id);
      open = { id: last.id, key: item.key };
      return;
    }
    const r = insert.run({
      at,
      kind: item.kind,
      key: item.key,
      label: item.label,
      detail: item.detail ?? null,
      book: item.book ?? null,
      chapter: item.chapter ?? null,
      from: item.from ?? null,
      to: item.to ?? null,
      songId: item.songId ?? null,
      docId: item.docId ?? null,
      by: item.by ?? null,
    });
    open = { id: Number(r.lastInsertRowid), key: item.key };
  }

  /** a showing still on screen counts up to now */
  const LEN = '(COALESCE(until, @now) - at - gap)';

  function summary(from: number, to: number): StatsSummary {
    const p = { from, to, now: now() };
    const where = 'at >= @from AND at < @to';
    const total = db
      .prepare(`SELECT COUNT(*) AS shows, COALESCE(SUM(${LEN}), 0) AS ms FROM shown WHERE ${where}`)
      .get(p) as { shows: number; ms: number };
    const dayMap = new Map<string, { shows: number; ms: number }>();
    const lens = db
      .prepare(`SELECT at, ${LEN} AS ms FROM shown WHERE ${where} ORDER BY at`)
      .all(p) as { at: number; ms: number }[];
    for (const r of lens) {
      const d = localDay(r.at);
      const e = dayMap.get(d) ?? { shows: 0, ms: 0 };
      e.shows++;
      e.ms += r.ms;
      dayMap.set(d, e);
    }
    const days = [...dayMap].map(([day, v]) => ({ day, ...v }));
    const forgotten = db
      .prepare(
        `SELECT song_id AS songId, label, COUNT(*) AS shows, MAX(at) AS last FROM shown
         WHERE song_id IS NOT NULL GROUP BY song_id HAVING MAX(at) < @before
         ORDER BY shows DESC, last DESC LIMIT 20`,
      )
      .all({ before: p.now - FORGOTTEN_MS }) as StatsSummary['forgotten'];
    return {
      from,
      to,
      total: { shows: total.shows, ms: total.ms, days: dayMap.size },
      kinds: db
        .prepare(
          `SELECT kind, COUNT(*) AS shows, SUM(${LEN}) AS ms FROM shown WHERE ${where}
           GROUP BY kind ORDER BY shows DESC`,
        )
        .all(p) as StatsSummary['kinds'],
      // the label of the latest showing: a song renamed since is called by its name now
      songs: db
        .prepare(
          `SELECT song_id AS songId,
             (SELECT label FROM shown s2 WHERE s2.song_id = shown.song_id ORDER BY at DESC LIMIT 1) AS label,
             COUNT(*) AS shows, SUM(${LEN}) AS ms, MAX(at) AS last
           FROM shown WHERE ${where} AND song_id IS NOT NULL
           GROUP BY song_id ORDER BY shows DESC, ms DESC LIMIT 50`,
        )
        .all(p) as StatsSummary['songs'],
      books: db
        .prepare(
          `SELECT book, COUNT(*) AS shows, SUM(${LEN}) AS ms FROM shown
           WHERE ${where} AND book IS NOT NULL GROUP BY book`,
        )
        .all(p) as StatsSummary['books'],
      passages: db
        .prepare(
          `SELECT MAX(label) AS label, book, COUNT(*) AS shows, MAX(at) AS last FROM shown
           WHERE ${where} AND kind = 'verses' GROUP BY key ORDER BY shows DESC, last DESC LIMIT 20`,
        )
        .all(p) as StatsSummary['passages'],
      docs: db
        .prepare(
          `SELECT doc_id AS docId, MAX(label) AS label, COUNT(*) AS shows, SUM(${LEN}) AS ms,
             MAX(at) AS last
           FROM shown WHERE ${where} AND doc_id IS NOT NULL
           GROUP BY doc_id ORDER BY shows DESC, ms DESC LIMIT 20`,
        )
        .all(p) as StatsSummary['docs'],
      days,
      forgotten,
    };
  }

  /** The showings that began in [from, to), oldest first (a day's report, the export). */
  function rows(from: number, to: number): ShownRow[] {
    return db
      .prepare(
        `SELECT id, at, until, kind, label, detail, book, chapter, verse_from, verse_to, song_id,
           doc_id, by, gap FROM shown WHERE at >= ? AND at < ? ORDER BY at`,
      )
      .all(from, to) as ShownRow[];
  }

  /** Every showing gone (the operator's «Очистити статистику»); what is on screen starts again. */
  function clear(): void {
    db.prepare('DELETE FROM shown').run();
    open = null;
    last = null;
  }

  function shutdown(): void {
    clearInterval(beat);
    close();
    db.close();
  }

  return { note, close, summary, rows, clear, shutdown };
}

export type Stats = ReturnType<typeof createStats>;

/** CSV for a spreadsheet: UTF-8 with a BOM (Excel reads Cyrillic then), one showing per line. */
export function statsCsv(rows: ShownRow[]): string {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // words from a slide («- пункт», «=Сума») never run as a spreadsheet's formula (review)
  const text = (v: string | null) => (v && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
  const time = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${localDay(ms)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const head = [
    'start',
    'end',
    'seconds',
    'kind',
    'label',
    'text',
    'book',
    'chapter',
    'from',
    'to',
    'song',
    'document',
    'remote',
  ];
  const lines = rows.map((r) =>
    [
      time(r.at),
      r.until === null ? '' : time(r.until),
      r.until === null ? '' : Math.round(shownMs(r, r.until) / 1000),
      r.kind,
      text(r.label),
      text(r.detail),
      r.book,
      r.chapter,
      r.verse_from,
      r.verse_to,
      r.song_id,
      r.doc_id,
      text(r.by),
    ]
      .map(cell)
      .join(','),
  );
  return '﻿' + [head.join(','), ...lines].join('\r\n') + '\r\n';
}
