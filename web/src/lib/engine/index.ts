import { createLibrary, type Library, type SqlDriver } from '@vo/shared';
import type { EngineRequest, EngineResponse, LoadedSegment } from './protocol';

/**
 * Main-thread side of the browser DB engine (worker.ts): a SqlDriver whose queries are
 * messages to the worker, and the shared `createLibrary` on top — the SAME query code
 * the server runs, over SQLite-in-WASM instead of better-sqlite3.
 */

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<EngineResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.result);
    else p.reject(new Error(e.data.error));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'Помилка рушія бази'));
    pending.clear();
  };
  return worker;
}

type Req = EngineRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, 'id'>
    : never
  : never;

function call<T>(req: Req, transfer: Transferable[] = []): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ id, ...req }, transfer);
  });
}

const driver: SqlDriver = {
  dialect: 'sqlite',
  all: (sql, params = []) => call({ op: 'query', kind: 'all', sql, params }),
  get: (sql, params = []) => call({ op: 'query', kind: 'get', sql, params }),
};

// createLibrary caches schema probes; a new segment can add tables (a dictionary, songs),
// so the library is recreated after every change.
let lib: Library = createLibrary(driver);

/**
 * Resolves when the local engine holds what the user chose (see restoreLocalSegments):
 * library reads wait for it, so a page reload in «у браузері» mode doesn't briefly show
 * an empty library.
 */
let ready: Promise<void> = Promise.resolve();

export const localEngine = {
  whenReady: (): Promise<void> => ready,
  setReady: (p: Promise<void>) => {
    ready = p.catch(() => undefined);
  },

  library: (): Library => lib,

  /** Merge one segment (gzip'd or raw SQLite bytes). The buffer is transferred, not copied. */
  async add(
    key: string,
    bytes: ArrayBuffer,
  ): Promise<{ verses: number; bytes: number; ms: number }> {
    const r = await call<{ verses: number; bytes: number; ms: number }>({ op: 'add', key, bytes }, [
      bytes,
    ]);
    lib = createLibrary(driver);
    return r;
  },

  async status(): Promise<LoadedSegment[]> {
    return (await call<{ segments: LoadedSegment[] }>({ op: 'status' })).segments;
  },

  async reset(): Promise<void> {
    await call({ op: 'reset' });
    lib = createLibrary(driver);
  },
};
