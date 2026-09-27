/// <reference lib="webworker" />
import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import {
  convertMyBible,
  droppedId,
  FTS_INSERT_SQL,
  ftsFillSql,
  ftsRow,
  ftsSourceSql,
  mergeSql,
  moduleHash,
  SCHEMA_SQL,
  SEGMENT_NORM_TABLE_SQL,
  type SqlParam,
  type SyncConn,
} from '@vo/shared';
import type {
  ConvertResult,
  EngineRequest,
  EngineResponse,
  SegmentCounts,
  SegmentUnit,
} from './protocol';

/**
 * The browser database engine, off the main thread (a big merge must not freeze the
 * operator's UI — same reason the builder is a separate process). Official SQLite WASM
 * build (FTS5 + fts5vocab — the default sql.js build has no FTS5), one in-memory working
 * DB assembled from library segments:
 *   add     → inflate gzip (DecompressionStream) → ATTACH ':memory:' + sqlite3_deserialize
 *             the bytes into it → copy tables (mergeSql) → rebuild its FTS rows → DETACH
 *   convert → a raw MyBible module (.SQLite3) → a segment, with the builder's rules
 *             (@vo/shared convertMyBible), for the main thread to cache and `add`
 *   query   → rows as plain objects, for the main thread's SqlDriver
 */

let sqlite3: Sqlite3Static | null = null;
let db: Database | null = null;
const loaded = new Map<string, SegmentCounts>();

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

const NOT_SQLITE =
  'Це не файл бази SQLite (очікується модуль MyBible .SQLite3 або сегмент .vodb / .vodb.gz)';

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

async function add(key: string, gz: ArrayBuffer): Promise<SegmentCounts> {
  const conn = await open();
  if (loaded.has(key)) return loaded.get(key)!;
  const raw = await inflate(gz);
  if (!isSqlite(raw)) throw new Error(NOT_SQLITE);
  const s3 = sqlite3!;
  conn.exec("ATTACH ':memory:' AS seg");
  try {
    deserialize(s3, conn, 'seg', raw);
    if (!conn.selectValue("SELECT 1 FROM seg.sqlite_master WHERE name = 'translations'")) {
      throw new Error('Це не сегмент бібліотеки — модулі MyBible спершу перетворюються (convert)');
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
    loaded.set(key, info);
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

function query(kind: 'all' | 'get', sql: string, params: unknown[]) {
  const rows = db!.exec({
    sql,
    bind: params as (string | number | null)[],
    rowMode: 'object',
    returnValue: 'resultRows',
  });
  return kind === 'all' ? rows : rows[0];
}

self.onmessage = async (e: MessageEvent<EngineRequest>) => {
  const req = e.data;
  type Reply = { ok: true; result: unknown } | { ok: false; error: string };
  const reply = (r: Reply, transfer: Transferable[] = []) =>
    (self as unknown as Worker).postMessage({ id: req.id, ...r } as EngineResponse, transfer);
  try {
    if (req.op === 'add') {
      const t0 = performance.now();
      const info = await add(req.key, req.bytes);
      reply({ ok: true, result: { ...info, ms: Math.round(performance.now() - t0) } });
    } else if (req.op === 'convert') {
      const t0 = performance.now();
      const r = await convert(req.name, req.bytes);
      const result: ConvertResult = { ...r, ms: Math.round(performance.now() - t0) };
      reply({ ok: true, result }, [r.bytes]);
    } else if (req.op === 'query') {
      await open();
      reply({ ok: true, result: query(req.kind, req.sql, req.params) });
    } else if (req.op === 'status') {
      reply({
        ok: true,
        result: { segments: [...loaded.entries()].map(([key, v]) => ({ key, ...v })) },
      });
    } else if (req.op === 'reset') {
      db?.close();
      db = null;
      loaded.clear();
      reply({ ok: true, result: null });
    }
  } catch (err) {
    reply({ ok: false, error: (err as Error).message });
  }
};
