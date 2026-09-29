import { createLibrary, type Library, type SqlDriver } from '@vo/shared';
import { useDataSource } from '../../dataSourceStore';
import { tr } from '../../i18n';
import {
  PG_SNAPSHOT_DB,
  type ConvertResult,
  type EngineInfo,
  type EngineKind,
  type EngineRequest,
  type EngineResponse,
  type LoadedSegment,
  type ReopenResult,
  type SegmentCounts,
} from './protocol';

/**
 * Main-thread side of the browser DB engine (worker.ts): a SqlDriver whose queries are
 * messages to the worker, and the shared `createLibrary` on top — the SAME query code
 * the server runs, over SQLite-in-WASM or PostgreSQL-in-WASM (PGlite) instead of
 * better-sqlite3. Each engine is its own worker, so two can run side by side (the
 * benchmark does) and switching drops the old one whole.
 */

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

type Req = EngineRequest extends infer R
  ? R extends { id: number }
    ? Omit<R, 'id'>
    : never
  : never;

export interface Engine {
  readonly kind: EngineKind;
  library(): Library;
  /** Merge one segment (gzip'd or raw SQLite bytes). The buffer is transferred, not copied. */
  add(key: string, bytes: ArrayBuffer): Promise<SegmentCounts & { ms: number }>;
  /**
   * A dropped file → segment bytes: a raw MyBible module is converted (in the worker),
   * a segment comes back as is. The buffer is transferred there and back.
   */
  convert(name: string, bytes: ArrayBuffer): Promise<ConvertResult>;
  status(): Promise<LoadedSegment[]>;
  info(): Promise<EngineInfo>;
  /** Benchmark: save the whole database as one image and reopen the engine from it. */
  reopen(): Promise<ReopenResult>;
  reset(): Promise<void>;
  /** Stop the worker (and free its memory); pending calls fail. */
  terminate(): void;
}

/**
 * `persist: false` makes a throwaway engine (the benchmark): it never reads or writes the
 * PGlite snapshot, so it can't disturb — or be sped up by — the app's own database.
 */
export function createEngine(kind: EngineKind, opts: { persist?: boolean } = {}): Engine {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const failAll = (message: string) => {
    for (const p of pending.values()) p.reject(new Error(message));
    pending.clear();
  };

  function getWorker(): Worker {
    if (worker) return worker;
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<EngineResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      // the worker's own messages are keys of the dictionary (N_ there)
      else p.reject(new Error(tr(e.data.error)));
    };
    w.onerror = (e) => failAll(e.message || tr('Помилка рушія бази'));
    // The worker handles messages in order, so this runs before anything else.
    w.postMessage({
      id: 0,
      op: 'init',
      engine: kind,
      persist: opts.persist ?? true,
    } satisfies EngineRequest);
    worker = w;
    return w;
  }

  function call<T>(req: Req, transfer: Transferable[] = []): Promise<T> {
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      getWorker().postMessage({ id, ...req }, transfer);
    });
  }

  const driver: SqlDriver = {
    dialect: kind === 'pglite' ? 'postgres' : 'sqlite',
    all: (sql, params = []) => call({ op: 'query', kind: 'all', sql, params }),
    get: (sql, params = []) => call({ op: 'query', kind: 'get', sql, params }),
  };

  // createLibrary caches schema probes; a new segment can add tables (a dictionary,
  // songs), so the library is recreated after every change.
  let lib: Library = createLibrary(driver);

  return {
    kind,
    library: () => lib,
    async add(key, bytes) {
      const r = await call<SegmentCounts & { ms: number }>({ op: 'add', key, bytes }, [bytes]);
      lib = createLibrary(driver);
      return r;
    },
    convert: (name, bytes) => call<ConvertResult>({ op: 'convert', name, bytes }, [bytes]),
    status: async () => (await call<{ segments: LoadedSegment[] }>({ op: 'status' })).segments,
    info: () => call<EngineInfo>({ op: 'info' }),
    reopen: () => call<ReopenResult>({ op: 'reopen' }),
    async reset() {
      await call({ op: 'reset' });
      lib = createLibrary(driver);
    },
    terminate() {
      worker?.terminate();
      worker = null;
      failAll(tr('Рушій бази зупинено'));
    },
  };
}

export const ENGINE_LABEL: Record<EngineKind, string> = {
  sqlite: 'SQLite',
  pglite: 'PostgreSQL (PGlite)',
};

let current: Engine = createEngine(useDataSource.getState().engine);

/**
 * Resolves when the local engine holds what the user chose (see restoreLocalSegments):
 * library reads wait for it, so a page reload in «у браузері» mode doesn't briefly show
 * an empty library.
 */
let ready: Promise<void> = Promise.resolve();

/** The app's browser engine — the one the user picked (SQLite by default). */
export const localEngine = {
  whenReady: (): Promise<void> => ready,
  setReady: (p: Promise<void>) => {
    ready = p.catch(() => undefined);
  },
  kind: (): EngineKind => current.kind,
  library: (): Library => current.library(),
  add: (key: string, bytes: ArrayBuffer) => current.add(key, bytes),
  convert: (name: string, bytes: ArrayBuffer) => current.convert(name, bytes),
  status: () => current.status(),
  info: () => current.info(),
  reset: () => current.reset(),

  /** Replace the engine with an empty one of another kind (the caller reloads segments). */
  switchTo(kind: EngineKind): void {
    if (kind === current.kind) return;
    const was = current.kind;
    current.terminate();
    // Postgres keeps a snapshot of its database; leaving it, drop that copy so a later
    // switch back starts from what is remembered, not from stale data.
    if (was === 'pglite') indexedDB.deleteDatabase(PG_SNAPSHOT_DB);
    current = createEngine(kind);
  },
};
