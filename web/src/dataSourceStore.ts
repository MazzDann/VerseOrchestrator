import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Where library reads go: the server (full library over HTTP) or the browser engine
 * (SQLite-in-WASM assembled from library segments — lib/engine). Persisted per browser;
 * `segments` remembers which segment files to (re)load for the local engine.
 */
export type DataSource = 'server' | 'local';

interface DataSourceState {
  source: DataSource;
  segments: string[];
  setSource: (s: DataSource) => void;
  setSegments: (files: string[]) => void;
}

export const useDataSource = create<DataSourceState>()(
  persist(
    (set) => ({
      source: 'server',
      segments: [],
      setSource: (source) => set({ source }),
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
        };
      },
    },
  ),
);
