import { readJson, writeJson } from './jsonFile.js';

/**
 * Server options — NOT secrets. Lives in `<data>/settings.json` (git-ignored), editable
 * by hand or from the control window. Secrets (remote tokens, future passwords) live in
 * a separate `<data>/secrets.json` — see remote.ts.
 */
export interface ServerSettings {
  version: 1;
  remotes: {
    /** Keep paired speaker remotes across server restarts (tokens stored hashed). */
    persist: boolean;
  };
}

export const DEFAULT_SERVER_SETTINGS: ServerSettings = { version: 1, remotes: { persist: true } };

let file: string | null = null;
let current: ServerSettings = DEFAULT_SERVER_SETTINGS;

/** Coerce anything (hand-edited file, API body) into valid settings. */
export function sanitizeServerSettings(raw: unknown): ServerSettings {
  const r = (raw ?? {}) as { remotes?: { persist?: unknown } };
  return {
    version: 1,
    remotes: {
      persist:
        typeof r.remotes?.persist === 'boolean'
          ? r.remotes.persist
          : DEFAULT_SERVER_SETTINGS.remotes.persist,
    },
  };
}

/** Load from disk (call once at startup). Without a file path, settings stay in memory. */
export function initServerSettings(path: string | null): ServerSettings {
  file = path;
  current = sanitizeServerSettings(path ? readJson(path, DEFAULT_SERVER_SETTINGS) : null);
  if (path) writeJson(path, current); // materialise defaults so the file is discoverable
  return current;
}

export function getServerSettings(): ServerSettings {
  return current;
}

export function updateServerSettings(patch: unknown): ServerSettings {
  const p = (patch ?? {}) as { remotes?: object };
  current = sanitizeServerSettings({ ...current, remotes: { ...current.remotes, ...p.remotes } });
  if (file) writeJson(file, current);
  return current;
}
