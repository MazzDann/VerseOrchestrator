import type { Converted, Vars } from '@vo/shared';

/** Which database runs in the worker: SQLite-WASM, or PostgreSQL (PGlite). */
export type EngineKind = 'sqlite' | 'pglite';

/** IndexedDB database holding the PGlite snapshot (its data directory as one tar Blob). */
export const PG_SNAPSHOT_DB = 'vo-pglite-snapshot';

/** Messages between the main thread and the browser DB engine worker (worker.ts). */
export type EngineRequest = { id: number } & (
  | { op: 'init'; engine: EngineKind; persist: boolean }
  | { op: 'info' }
  | { op: 'reopen' }
  | { op: 'add'; key: string; bytes: ArrayBuffer }
  | { op: 'convert'; name: string; bytes: ArrayBuffer }
  | { op: 'query'; kind: 'all' | 'get'; sql: string; params: unknown[] }
  | { op: 'status' }
  | { op: 'reset' }
);

export type EngineResponse = { id: number } & (
  | { ok: true; result: unknown }
  // a message that is a dictionary key with values carries them apart (0.11.6)
  | { ok: false; error: string; key?: string; vars?: Vars }
);

/** What a segment holds, by its main content. */
export type SegmentUnit = 'verses' | 'entries' | 'notes' | 'refs' | 'songs';

export interface SegmentCounts {
  verses: number;
  /** count of the segment's main content (see unit) */
  items: number;
  unit: SegmentUnit;
  /** uncompressed bytes held in the engine's memory */
  bytes: number;
}

export interface LoadedSegment extends SegmentCounts {
  key: string;
}

/** `info`: what the engine is and how big its database has grown. */
export interface EngineInfo {
  engine: EngineKind;
  /** e.g. "SQLite 3.53.0" / "PostgreSQL 18.3 (PGlite 0.5.8)" */
  version: string;
  /** size of the working database (SQLite pages / pg_database_size) */
  dbBytes: number;
  /** the engine's WebAssembly linear memory (null if the engine doesn't expose it) */
  wasmBytes: number | null;
  /** engine files the worker downloaded (.wasm / .data), from Resource Timing */
  assets: { name: string; transferBytes: number; bodyBytes: number }[];
}

/**
 * `reopen` (benchmark): save the whole database as one image and open a fresh engine
 * from it — what a snapshot-based reload costs (SQLite: serialize/deserialize; Postgres:
 * CHECKPOINT + dumpDataDir / loadDataDir).
 */
export interface ReopenResult {
  dumpMs: number;
  dumpBytes: number;
  reopenMs: number;
}

/** `convert`: a segment ready to merge — the input itself, or a converted MyBible module. */
export interface ConvertResult {
  bytes: ArrayBuffer;
  /** null when the file already was a segment */
  converted: Converted | null;
  ms: number;
}
