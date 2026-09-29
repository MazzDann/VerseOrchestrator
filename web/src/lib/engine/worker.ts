/// <reference lib="webworker" />
import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import {
  convertMyBible,
  droppedId,
  FTS_INSERT_SQL,
  ftsFillSql,
  ftsRow,
  ftsSourceSql,
  loadSegmentPg,
  mergeSql,
  moduleHash,
  N_,
  PG_SCHEMA_SQL,
  pgPlaceholders,
  SCHEMA_SQL,
  SEGMENT_NORM_TABLE_SQL,
  type SqlParam,
  type SyncConn,
  type Vars,
} from '@vo/shared';
import type { PGlite } from '@electric-sql/pglite';
import {
  PG_SNAPSHOT_DB,
  type ConvertResult,
  type EngineInfo,
  type EngineKind,
  type EngineRequest,
  type EngineResponse,
  type ReopenResult,
  type SegmentCounts,
  type SegmentUnit,
} from './protocol';

/**
 * The browser database engine, off the main thread (a big merge must not freeze the
 * operator's UI — same reason the builder is a separate process). Official SQLite WASM
 * build (FTS5 + fts5vocab — the default sql.js build has no FTS5), one in-memory working
 * DB assembled from library segments — or, when `init` picks it, PostgreSQL (PGlite):
 *   add     → inflate gzip (DecompressionStream) → ATTACH ':memory:' + sqlite3_deserialize
 *             the bytes into it → copy tables (mergeSql) → rebuild its FTS rows → DETACH;
 *             PGlite: the segment is read with SQLite and COPY'd in (loadSegmentPg)
 *   convert → a raw MyBible module (.SQLite3) → a segment, with the builder's rules
 *             (@vo/shared convertMyBible), for the main thread to cache and `add`
 *   query   → rows as plain objects, for the main thread's SqlDriver
 */

let engine: EngineKind = 'sqlite';
/** false for throwaway engines (the benchmark): never read or write the PGlite snapshot */
let persist = true;
let sqlite3: Sqlite3Static | null = null;
let db: Database | null = null;
let pg: PGlite | null = null;
const loaded = new Map<string, SegmentCounts>();

/**
 * The PostgreSQL engine (PGlite, loaded only when chosen — ~3 MB of WASM). SQLite stays
 * in the worker either way: it reads the segments (SQLite files) and converts modules.
 *
 * Unlike the SQLite engine (rebuilt from cached segments in about a second), Postgres
 * loads slowly (COPY + tsvector + GIN: seconds per Bible), so it is SNAPSHOTTED: once
 * loading goes quiet, its whole data directory is dumped (dumpDataDir) into IndexedDB,
 * and the next start opens that (loadDataDir) — `vo_segments` inside it records what it
 * holds, so restore only loads what's missing. The dump runs in the worker's queue, so
 * no query can change files halfway through it (PGlite's own idb:// storage syncs in the
 * background while queries run — a snapshot from such a race could miss new files).
 *
 * The dump is the data directory, WAL included — and bulk COPYs write a lot of WAL.
 * Measured for KJV+ & UKRK (99 MB of tables): default settings 274 MB; small WAL limits
 * + a CHECKPOINT before the dump 178 MB; plus 1 MB WAL segments (initdb) 130 MB.
 * full_page_writes guards against torn page writes on a disk — this "disk" is memory.
 */
const PG_CONF = 'max_wal_size = 16MB\nmin_wal_size = 2MB\nfull_page_writes = off';

async function openPg(): Promise<PGlite> {
  if (pg) return pg;
  const { PGlite } = await import('@electric-sql/pglite');
  let p: PGlite | null = null;
  const snapshot = persist ? await snapshotStore('get').catch(() => null) : null;
  if (snapshot instanceof Blob) {
    try {
      p = await PGlite.create({ loadDataDir: snapshot, postgresqlconf: PG_CONF });
    } catch {
      await snapshotStore('delete').catch(() => undefined); // unreadable: start over
    }
  }
  p ??= await PGlite.create({ initDbStartParams: ['--wal-segsize=1'], postgresqlconf: PG_CONF });
  const fresh = !(
    await p.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'translations'")
  ).rows.length;
  if (fresh) await p.exec(PG_SCHEMA_SQL);
  await p.exec(
    'CREATE TABLE IF NOT EXISTS vo_segments (key TEXT PRIMARY KEY, verses INTEGER, items INTEGER, unit TEXT, bytes BIGINT)',
  );
  for (const r of (await p.query<SegmentCounts & { key: string }>('SELECT * FROM vo_segments'))
    .rows) {
    loaded.set(r.key, { verses: r.verses, items: r.items, unit: r.unit, bytes: Number(r.bytes) });
  }
  pg = p;
  return p;
}

/** The one-Blob snapshot store: read, write or delete it (IndexedDB works in any context). */
function snapshotStore(op: 'get' | 'delete'): Promise<unknown>;
function snapshotStore(op: 'put', blob: Blob): Promise<unknown>;
function snapshotStore(op: 'get' | 'put' | 'delete', blob?: Blob): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(PG_SNAPSHOT_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('snapshot');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const idb = open.result;
      const tx = idb.transaction('snapshot', op === 'get' ? 'readonly' : 'readwrite');
      const store = tx.objectStore('snapshot');
      const req =
        op === 'get'
          ? store.get('datadir')
          : op === 'put'
            ? store.put(blob, 'datadir')
            : store.delete('datadir');
      tx.oncomplete = () => {
        idb.close();
        resolve(req.result);
      };
      tx.onerror = tx.onabort = () => {
        idb.close();
        reject(tx.error);
      };
    };
  });
}

let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
/** Snapshot once loading has been quiet for a moment (a restore adds many segments). */
function snapshotSoon(): void {
  if (!persist) return;
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => {
    snapshotTimer = null;
    enqueue(async () => {
      if (!pg) return;
      await pg.exec('CHECKPOINT'); // lets Postgres drop the WAL it no longer needs
      await snapshotStore('put', await pg.dumpDataDir('none'));
    });
  }, 1500);
}

/** Forget the Postgres database: close it and drop the snapshot (reset / clear). */
async function deletePg(): Promise<void> {
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = null;
  await pg?.close();
  pg = null;
  await snapshotStore('delete').catch(() => undefined);
}

async function init(): Promise<Sqlite3Static> {
  sqlite3 ??= await sqlite3InitModule();
  return sqlite3;
}

async function open(): Promise<Database> {
  if (db) return db;
  const s3 = await init();
  db = new s3.oo1.DB(':memory:');
  db.exec(SCHEMA_SQL);
  return db;
}

const isGzip = (b: Uint8Array) => b[0] === 0x1f && b[1] === 0x8b;
const isSqlite = (b: Uint8Array) =>
  new TextDecoder().decode(b.subarray(0, 15)) === 'SQLite format 3';

async function inflate(bytes: ArrayBuffer): Promise<Uint8Array> {
  if (!isGzip(new Uint8Array(bytes, 0, 2))) return new Uint8Array(bytes); // already raw SQLite
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Load a database image into `schema` of `conn` (the bytes are copied into WASM memory). */
function deserialize(s3: Sqlite3Static, conn: Database, schema: string, raw: Uint8Array): void {
  // A WAL-mode file (header bytes 18/19 = 2) can't be opened from memory: there is no
  // -shm to go with it. Mark the image rollback-journal — the data pages are the same.
  if (raw[18] === 2) raw[18] = 1;
  if (raw[19] === 2) raw[19] = 1;
  const p = s3.wasm.allocFromTypedArray(raw);
  const rc = s3.capi.sqlite3_deserialize(
    conn.pointer!,
    schema,
    p,
    raw.byteLength,
    raw.byteLength,
    s3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | s3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );
  if (rc) throw new Error(`sqlite3_deserialize: ${s3.capi.sqlite3_js_rc_str(rc)}`);
}

// shown by the page through tr (lib/engine/index.ts): the worker has no interface language
const NOT_SQLITE = N_(
  'Це не файл бази SQLite (очікується модуль MyBible .SQLite3 або сегмент .vodb / .vodb.gz)',
);

/** What the attached segment mostly holds — for the UI («31 102 вірші», «14 250 статей»). */
function counts(conn: Database, alias: string, bytes: number): SegmentCounts {
  const n = (table: string) => {
    try {
      return Number(conn.selectValue(`SELECT COUNT(*) FROM ${alias}.${table}`) ?? 0);
    } catch {
      return 0; // table absent in an older segment
    }
  };
  const verses = n('verses');
  const order: [SegmentUnit, string][] = [
    ['verses', 'verses'],
    ['entries', 'dictionary_entries'],
    ['notes', 'commentaries'],
    ['refs', 'cross_references'],
    ['songs', 'songs'],
  ];
  for (const [unit, table] of order) {
    const items = unit === 'verses' ? verses : n(table);
    if (items > 0) return { verses, items, unit, bytes };
  }
  return { verses, items: 0, unit: 'verses', bytes };
}

const NOT_SEGMENT = N_('Це не сегмент бібліотеки — модулі MyBible спершу перетворюються (convert)');

async function add(key: string, gz: ArrayBuffer): Promise<SegmentCounts> {
  if (engine === 'pglite') await openPg(); // brings back what the persisted DB holds
  if (loaded.has(key)) return loaded.get(key)!;
  const info = engine === 'pglite' ? await addPg(gz) : await addSqlite(gz);
  if (engine === 'pglite') {
    // Recorded after the load's own transaction: if the two ever disagree, the segment
    // is simply loaded again and its duplicates skipped (loadSegmentPg's fallback).
    await pg!.query(
      `INSERT INTO vo_segments (key, verses, items, unit, bytes) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO NOTHING`,
      [key, info.verses, info.items, info.unit, info.bytes],
    );
    snapshotSoon();
  }
  loaded.set(key, info);
  return info;
}

/** PostgreSQL: open the segment in a throwaway SQLite DB, bulk-load it (COPY) into PGlite. */
async function addPg(gz: ArrayBuffer): Promise<SegmentCounts> {
  const p = await openPg();
  const raw = await inflate(gz);
  if (!isSqlite(raw)) throw new Error(NOT_SQLITE);
  const s3 = await init();
  const seg = new s3.oo1.DB(':memory:');
  try {
    deserialize(s3, seg, 'main', raw);
    if (!seg.selectValue("SELECT 1 FROM sqlite_master WHERE name = 'translations'")) {
      throw new Error(NOT_SEGMENT);
    }
    await loadSegmentPg(syncConn(seg), p);
    return counts(seg, 'main', raw.byteLength);
  } finally {
    seg.close();
  }
}

async function addSqlite(gz: ArrayBuffer): Promise<SegmentCounts> {
  const conn = await open();
  const raw = await inflate(gz);
  if (!isSqlite(raw)) throw new Error(NOT_SQLITE);
  const s3 = sqlite3!;
  conn.exec("ATTACH ':memory:' AS seg");
  try {
    deserialize(s3, conn, 'seg', raw);
    if (!conn.selectValue("SELECT 1 FROM seg.sqlite_master WHERE name = 'translations'")) {
      throw new Error(NOT_SEGMENT);
    }
    let info!: SegmentCounts;
    conn.transaction(() => {
      for (const sql of mergeSql('seg')) {
        try {
          conn.exec(sql);
        } catch {
          /* table absent in an older segment — nothing to copy */
        }
      }
      const hasNorm = !!conn.selectValue(
        "SELECT 1 FROM seg.sqlite_master WHERE type = 'table' AND name = 'verses_norm'",
      );
      info = counts(conn, 'seg', raw.byteLength);
      if (hasNorm) {
        // Segment format ≥ 2: normalized text shipped → fill FTS with one SQL statement,
        // entirely inside SQLite (≈4× faster than feeding rows from JS).
        conn.exec(ftsFillSql('seg'));
      } else {
        // Older segments: normalize in JS, one insert per verse.
        const ins = conn.prepare(FTS_INSERT_SQL);
        try {
          conn.exec({
            sql: ftsSourceSql('seg'),
            rowMode: 'object',
            callback: (row) => {
              ins.bind(ftsRow(row as Parameters<typeof ftsRow>[0])).stepReset();
            },
          });
        } finally {
          ins.finalize();
        }
      }
    });
    return info;
  } finally {
    conn.exec('DETACH seg');
  }
}

/** oo1 connection → the converter's tiny synchronous interface. */
function syncConn(conn: Database): SyncConn {
  return {
    all: (sql, params = []) =>
      conn.exec({
        sql,
        ...(params.length ? { bind: params as SqlParam[] } : {}),
        rowMode: 'object',
        returnValue: 'resultRows',
      }),
    prepare: (sql) => {
      const st = conn.prepare(sql);
      return {
        run: (params) => void st.bind(params as SqlParam[]).stepReset(),
        done: () => void st.finalize(),
      };
    },
  };
}

/**
 * A dropped file → segment bytes for `add`. Segments pass through untouched; a MyBible
 * module is converted in two throwaway in-memory databases (the module, and the new
 * segment with our schema), then exported — so the main thread caches the CONVERTED
 * segment and a reload never converts again.
 */
async function convert(name: string, bytes: ArrayBuffer): Promise<Omit<ConvertResult, 'ms'>> {
  const head = new Uint8Array(bytes);
  if (isGzip(head)) return { bytes, converted: null }; // our segments ship gzip'd
  if (!isSqlite(head)) throw new Error(NOT_SQLITE);
  const s3 = await init();
  const id = droppedId(moduleHash(head)); // before deserialize() touches the header
  const src = new s3.oo1.DB(':memory:');
  try {
    deserialize(s3, src, 'main', head);
    const tables = src
      .selectValues("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map(String);
    if (tables.includes('translations')) return { bytes, converted: null }; // a raw .vodb
    const out = new s3.oo1.DB(':memory:');
    try {
      out.exec(SCHEMA_SQL);
      out.exec(SEGMENT_NORM_TABLE_SQL);
      let converted!: ReturnType<typeof convertMyBible>;
      out.transaction(() => {
        converted = convertMyBible(syncConn(src), syncConn(out), { fileName: name, id });
      });
      const img = s3.capi.sqlite3_js_db_export(out);
      // Not gzip'd: CompressionStream managed ~35 MB/s here (a 118 MB dictionary: 3.3 s),
      // and a raw image also skips inflating on every reload. Costs ~3× cache space.
      const exact = img.byteOffset === 0 && img.byteLength === img.buffer.byteLength;
      return { bytes: exact ? img.buffer : img.slice().buffer, converted };
    } finally {
      out.close();
    }
  } finally {
    src.close();
  }
}

async function query(kind: 'all' | 'get', sql: string, params: unknown[]) {
  let rows: unknown[];
  if (engine === 'pglite') {
    rows = (await (await openPg()).query(pgPlaceholders(sql), params)).rows;
  } else {
    rows = (await open()).exec({
      sql,
      bind: params as (string | number | null)[],
      rowMode: 'object',
      returnValue: 'resultRows',
    });
  }
  return kind === 'all' ? rows : rows[0];
}

/** Engine files this worker downloaded (.wasm, PGlite's .data), from Resource Timing. */
function assets(): EngineInfo['assets'] {
  return (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter((e) => /\.(wasm|data)(\?|$)/.test(e.name))
    .map((e) => ({
      name: new URL(e.name).pathname.split('/').pop() ?? e.name,
      transferBytes: e.transferSize,
      bodyBytes: e.decodedBodySize,
    }));
}

async function info(): Promise<EngineInfo> {
  if (engine === 'pglite') {
    const p = await openPg();
    const r = await p.query<{ v: string; n: number }>(
      "SELECT split_part(version(), ' on ', 1) AS v, pg_database_size(current_database()) AS n",
    );
    // PGlite doesn't expose its WASM memory publicly; its Emscripten module does.
    const mod = (p as unknown as { mod?: { HEAPU8?: Uint8Array } }).mod;
    return {
      engine,
      version: r.rows[0].v,
      dbBytes: Number(r.rows[0].n),
      wasmBytes: mod?.HEAPU8?.byteLength ?? null,
      assets: assets(),
    };
  }
  const conn = await open();
  const pages = Number(conn.selectValue('PRAGMA page_count') ?? 0);
  const size = Number(conn.selectValue('PRAGMA page_size') ?? 0);
  return {
    engine,
    version: `SQLite ${sqlite3!.version.libVersion}`,
    dbBytes: pages * size,
    wasmBytes: sqlite3!.wasm.heap8u().byteLength,
    assets: assets(),
  };
}

/**
 * Benchmark: what a snapshot-based reload costs — the whole database saved as one image,
 * then a fresh engine opened from it (and one query run, so it's really usable).
 */
async function reopen(): Promise<ReopenResult> {
  if (engine === 'pglite') {
    const { PGlite } = await import('@electric-sql/pglite');
    const p = await openPg();
    let t0 = performance.now();
    await p.exec('CHECKPOINT');
    const image = await p.dumpDataDir('none');
    const dumpMs = performance.now() - t0;
    await p.close();
    pg = null;
    t0 = performance.now();
    const fresh = await PGlite.create({ loadDataDir: image, postgresqlconf: PG_CONF });
    await fresh.query('SELECT count(*) FROM verses');
    pg = fresh;
    return { dumpMs, dumpBytes: image.size, reopenMs: performance.now() - t0 };
  }
  const s3 = await init();
  const conn = await open();
  let t0 = performance.now();
  const image = s3.capi.sqlite3_js_db_export(conn);
  const dumpMs = performance.now() - t0;
  t0 = performance.now();
  const fresh = new s3.oo1.DB(':memory:');
  deserialize(s3, fresh, 'main', image);
  fresh.selectValue('SELECT count(*) FROM verses');
  const reopenMs = performance.now() - t0;
  conn.close();
  db = fresh;
  return { dumpMs, dumpBytes: image.byteLength, reopenMs };
}

async function handle(req: EngineRequest): Promise<void> {
  type Reply =
    | { ok: true; result: unknown }
    | { ok: false; error: string; key?: string; vars?: Vars };
  const reply = (r: Reply, transfer: Transferable[] = []) =>
    (self as unknown as Worker).postMessage({ id: req.id, ...r } as EngineResponse, transfer);
  try {
    if (req.op === 'init') {
      engine = req.engine;
      persist = req.persist;
      reply({ ok: true, result: null });
    } else if (req.op === 'info') {
      reply({ ok: true, result: await info() });
    } else if (req.op === 'reopen') {
      reply({ ok: true, result: await reopen() });
    } else if (req.op === 'add') {
      const t0 = performance.now();
      const info = await add(req.key, req.bytes);
      reply({ ok: true, result: { ...info, ms: Math.round(performance.now() - t0) } });
    } else if (req.op === 'convert') {
      const t0 = performance.now();
      const r = await convert(req.name, req.bytes);
      const result: ConvertResult = { ...r, ms: Math.round(performance.now() - t0) };
      reply({ ok: true, result }, [r.bytes]);
    } else if (req.op === 'query') {
      reply({ ok: true, result: await query(req.kind, req.sql, req.params) });
    } else if (req.op === 'status') {
      if (engine === 'pglite') await openPg();
      reply({
        ok: true,
        result: { segments: [...loaded.entries()].map(([key, v]) => ({ key, ...v })) },
      });
    } else if (req.op === 'reset') {
      db?.close();
      db = null;
      if (engine === 'pglite') await deletePg();
      loaded.clear();
      reply({ ok: true, result: null });
    }
  } catch (err) {
    // ModuleError / LibraryError: the key and its values, for the page to translate
    const { key, vars } = err as { key?: string; vars?: Vars };
    reply({ ok: false, error: (err as Error).message, key, vars });
  }
}

// One message at a time, in order: PGlite is async, so without a queue a query could run
// in the middle of a segment load (or before `init` has chosen the engine).
let queue: Promise<void> = Promise.resolve();
function enqueue(job: () => Promise<void>): void {
  queue = queue.then(job).catch((err) => console.warn('[engine]', err));
}
self.onmessage = (e: MessageEvent<EngineRequest>) => enqueue(() => handle(e.data));
