import { create } from 'zustand';

/**
 * Is the Node API reachable? `null` until the first probe. A static deployment (no
 * server — `npm run build:static`) or a stopped server both read as `false`: the library
 * then runs in the browser from static / cached segments, and server-only features
 * (viewers, speaker remote, library rebuild) are switched off with an explanation.
 */
interface ServerState {
  available: boolean | null;
  setAvailable: (v: boolean) => void;
}

export const useServer = create<ServerState>()((set) => ({
  available: null,
  setAvailable: (available) => set({ available }),
}));

/** One quick health check (≤1.5 s). */
export async function probeServer(): Promise<boolean> {
  let ok = false;
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) });
    ok = res.ok && ((await res.json().catch(() => null)) as { ok?: boolean } | null)?.ok === true;
  } catch {
    ok = false;
  }
  useServer.getState().setAvailable(ok);
  return ok;
}

/** Copy for controls that need the server. */
export const NEEDS_SERVER =
  'Потрібен сервер застосунку (npm run dev) — зараз працює лише бібліотека в браузері';

/**
 * Startup gate for library reads in the control window: resolves once we know whether the
 * server is there (and, without it, the browser engine has restored its segments).
 */
let boot: Promise<void> = Promise.resolve();
export const whenBooted = (): Promise<void> => boot;
export function setBoot(p: Promise<unknown>): void {
  boot = p.then(
    () => undefined,
    () => undefined,
  );
}
