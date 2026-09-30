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
  /** The standby waiter (standby.ts reads this key too): its address and idle stop. */
  standby: { port: number; idleMinutes: number };
  /** «Перевіряти оновлення» (1.0.0): ask GitHub about new versions now and then. */
  updates: { check: boolean };
}

export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  version: 1,
  remotes: { persist: true },
  standby: { port: 4747, idleMinutes: 15 },
  updates: { check: true },
};

/** The app's own ports (web dev server, API / single-process app) — not for the waiter. */
export const RESERVED_PORTS = [5173, 8787];

/** Ports the waiter may use: unprivileged, not the app's own. */
export function validStandbyPort(n: unknown): n is number {
  return (
    Number.isInteger(n) &&
    (n as number) >= 1024 &&
    (n as number) <= 65535 &&
    !RESERVED_PORTS.includes(n as number)
  );
}

let file: string | null = null;
let current: ServerSettings = DEFAULT_SERVER_SETTINGS;

/** Coerce anything (hand-edited file, API body) into valid settings. */
export function sanitizeServerSettings(raw: unknown): ServerSettings {
  const r = (raw ?? {}) as {
    remotes?: { persist?: unknown };
    library?: unknown;
    standby?: { port?: unknown; idleMinutes?: unknown };
    updates?: { check?: unknown };
  };
  const idle = Number(r.standby?.idleMinutes);
  const out: ServerSettings = {
    version: 1,
    remotes: {
      persist:
        typeof r.remotes?.persist === 'boolean'
          ? r.remotes.persist
          : DEFAULT_SERVER_SETTINGS.remotes.persist,
    },
    standby: {
      port: validStandbyPort(r.standby?.port)
        ? (r.standby!.port as number)
        : DEFAULT_SERVER_SETTINGS.standby.port,
      idleMinutes:
        idle >= 1 && idle <= 24 * 60 ? idle : DEFAULT_SERVER_SETTINGS.standby.idleMinutes,
    },
    updates: {
      check:
        typeof r.updates?.check === 'boolean'
          ? r.updates.check
          : DEFAULT_SERVER_SETTINGS.updates.check,
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

/** Apply a patch to the server-owned keys (remotes, standby, updates). `library` is edited by the builder / by hand. */
export function updateServerSettings(patch: unknown): ServerSettings {
  const p = (patch ?? {}) as { remotes?: object; standby?: object; updates?: object };
  const base = getServerSettings();
  current = sanitizeServerSettings({
    ...base,
    remotes: { ...base.remotes, ...p.remotes },
    standby: { ...base.standby, ...p.standby },
    updates: { ...base.updates, ...p.updates },
  });
  if (file) writeJson(file, current);
  return current;
}
