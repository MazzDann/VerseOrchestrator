/** Messages between the main thread and the browser DB engine worker (worker.ts). */
export type EngineRequest = { id: number } & (
  | { op: 'add'; key: string; bytes: ArrayBuffer }
  | { op: 'query'; kind: 'all' | 'get'; sql: string; params: unknown[] }
  | { op: 'status' }
  | { op: 'reset' }
);

export type EngineResponse = { id: number } & (
  | { ok: true; result: unknown }
  | { ok: false; error: string }
);

export interface LoadedSegment {
  key: string;
  verses: number;
  /** uncompressed bytes held in the engine's memory */
  bytes: number;
}
