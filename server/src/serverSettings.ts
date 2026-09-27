import { sanitizeLibrarySelection, type LibrarySelection } from '@vo/shared';
import { readJson, writeJson } from './jsonFile.js';

/**
 * Server options — NOT secrets. Lives in `<data>/settings.json` (git-ignored), editable
 * by hand or from the control window. Secrets (remote tokens, future passwords) live in
 * a separate `<data>/secrets.json` — see remote.ts.
 *
 * The builder (a separate process) also writes this file: it seeds `library` — which
 * module files to import — the first time it runs. So every write here re-reads the file
 * first and only replaces the keys it owns, never clobbering the builder's part.
 */
export interface ServerSettings {
  version: 1;
  remotes: {
    /** Keep paired speaker remotes across server restarts (tokens stored hashed). */
    persist: boolean;
  };
  /** Module files the builder imports (see @vo/shared LibrarySelection). */
  library?: LibrarySelection;
}

export const DEFAULT_SERVER_SETTINGS: ServerSettings = { version: 1, remotes: { persist: true } };

let file: string | null = null;
let current: ServerSettings = DEFAULT_SERVER_SETTINGS;

/** Coerce anything (hand-edited file, API body) into valid settings. */
export function sanitizeServerSettings(raw: unknown): ServerSettings {
  const r = (raw ?? {}) as { remotes?: { persist?: unknown }; library?: unknown };
  const out: ServerSettings = {
    version: 1,
    remotes: {
      persist:
        typeof r.remotes?.persist === 'boolean'
          ? r.remotes.persist
          : DEFAULT_SERVER_SETTINGS.remotes.persist,
    },
  };
  const library = sanitizeLibrarySelection(r.library);
  if (library) out.library = library;
  return out;
}

/** Load from disk (call once at startup). Without a file path, settings stay in memory. */
export function initServerSettings(path: string | null): ServerSettings {
  file = path;
  current = sanitizeServerSettings(path ? readJson(path, DEFAULT_SERVER_SETTINGS) : null);
  if (path) writeJson(path, current); // materialise defaults so the file is discoverable
  return current;
}

export function getServerSettings(): ServerSettings {
  if (file) current = sanitizeServerSettings(readJson(file, current)); // pick up builder writes
  return current;
}

/** Apply a patch to the server-owned keys (remotes). `library` is edited by the builder / by hand. */
export function updateServerSettings(patch: unknown): ServerSettings {
  const p = (patch ?? {}) as { remotes?: object };
  const base = getServerSettings();
  current = sanitizeServerSettings({ ...base, remotes: { ...base.remotes, ...p.remotes } });
  if (file) writeJson(file, current);
  return current;
}
