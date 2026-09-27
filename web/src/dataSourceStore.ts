import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { EngineKind } from './lib/engine/protocol';
import { useServer } from './serverStore';

/**
 * Where library reads go: the server (full library over HTTP) or the browser engine
 * (assembled from library segments — lib/engine). Persisted per browser; `segments`
 * remembers which segment files to (re)load for the local engine, `engine` which
 * database runs it (SQLite-WASM, or PostgreSQL via PGlite).
 */
export type DataSource = 'server' | 'local';

interface DataSourceState {
  source: DataSource;
  segments: string[];
  engine: EngineKind;
  setSource: (s: DataSource) => void;
  setEngine: (e: EngineKind) => void;
  setSegments: (files: string[]) => void;
}

export const useDataSource = create<DataSourceState>()(
  persist(
    (set) => ({
      source: 'server',
      segments: [],
      engine: 'sqlite',
      setSource: (source) => set({ source }),
      setEngine: (engine) => set({ engine }),
      setSegments: (segments) => set({ segments: [...new Set(segments)] }),
    }),
    {
      name: 'vo:dataSource',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<DataSourceState>;
        return {
          ...current,
          source: p.source === 'local' ? 'local' : 'server',
          segments: Array.isArray(p.segments)
            ? p.segments.filter((s) => typeof s === 'string')
            : [],
          engine: p.engine === 'pglite' ? 'pglite' : 'sqlite',
        };
      },
    },
  ),
);

/**
 * Where reads ACTUALLY go: the browser engine when the user chose it, or — without
 * changing their saved choice — whenever the server isn't reachable (static deployment,
 * server down). A temporary outage must not silently flip the preference.
 */
export function effectiveSource(): DataSource {
  return useDataSource.getState().source === 'local' || useServer.getState().available === false
    ? 'local'
    : 'server';
}

/** React hook form of effectiveSource(). */
export function useEffectiveSource(): DataSource {
  const source = useDataSource((s) => s.source);
  const available = useServer((s) => s.available);
  return source === 'local' || available === false ? 'local' : 'server';
}
