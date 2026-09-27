/// <reference lib="webworker" />
import sqlite3InitModule, { type Database, type Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import { FTS_INSERT_SQL, ftsFillSql, ftsRow, ftsSourceSql, mergeSql, SCHEMA_SQL } from '@vo/shared';
import type { EngineRequest, EngineResponse } from './protocol';

/**
 * The browser database engine, off the main thread (a big merge must not freeze the
 * operator's UI — same reason the builder is a separate process). Official SQLite WASM
 * build (FTS5 + fts5vocab — the default sql.js build has no FTS5), one in-memory working
 * DB assembled from library segments:
 *   add   → inflate gzip (DecompressionStream) → ATTACH ':memory:' + sqlite3_deserialize
 *           the bytes into it → copy tables (mergeSql) → rebuild its FTS rows → DETACH
 *   query → rows as plain objects, for the main thread's SqlDriver
 */

let sqlite3: Sqlite3Static | null = null;
let db: Database | null = null;
const loaded = new Map<string, { verses: number; bytes: number }>();

async function open(): Promise<Database> {
  if (db) return db;
  sqlite3 ??= await sqlite3InitModule();
  db = new sqlite3.oo1.DB(':memory:');
  db.exec(SCHEMA_SQL);
  return db;
}

async function inflate(bytes: ArrayBuffer): Promise<Uint8Array> {
  const head = new Uint8Array(bytes, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return new Uint8Array(bytes); // already raw SQLite
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function add(key: string, gz: ArrayBuffer): Promise<{ verses: number; bytes: number }> {
  const conn = await open();
  if (loaded.has(key)) return loaded.get(key)!;
  const raw = await inflate(gz);
  if (new TextDecoder().decode(raw.subarray(0, 15)) !== 'SQLite format 3') {
    throw new Error('Це не файл бази SQLite (очікується сегмент .vodb або .vodb.gz)');
  }
  const s3 = sqlite3!;
  conn.exec("ATTACH ':memory:' AS seg");
  try {
    const p = s3.wasm.allocFromTypedArray(raw);
    const rc = s3.capi.sqlite3_deserialize(
      conn.pointer!,
      'seg',
      p,
      raw.byteLength,
      raw.byteLength,
      s3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | s3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
    );
    if (rc) throw new Error(`sqlite3_deserialize: ${s3.capi.sqlite3_js_rc_str(rc)}`);
    let verses = 0;
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
      verses = Number(conn.selectValue('SELECT COUNT(*) FROM seg.verses') ?? 0);
      if (hasNorm) {
        // Segment format ≥ 2: normalized text shipped → fill FTS with one SQL statement,
        // entirely inside SQLite (≈4× faster than feeding rows from JS).
        conn.exec(ftsFillSql('seg'));
      } else {
        // Older segments / dropped files: normalize in JS, one insert per verse.
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
    const info = { verses, bytes: raw.byteLength };
    loaded.set(key, info);
    return info;
  } finally {
    conn.exec('DETACH seg');
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
  const reply = (r: Reply) =>
    (self as unknown as Worker).postMessage({ id: req.id, ...r } as EngineResponse);
  try {
    if (req.op === 'add') {
      const t0 = performance.now();
      const info = await add(req.key, req.bytes);
      reply({ ok: true, result: { ...info, ms: Math.round(performance.now() - t0) } });
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
