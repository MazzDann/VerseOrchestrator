import { useEffect, useRef } from 'react';
import { reloadKeepsFullscreen } from './desktop';
import { followAppVersion } from './liveSocket';

/** How often a window without a socket of its own asks which version the app is. */
const ASK_MS = 5000;

/** The app's version at this address; null when it doesn't answer as the app (a static build). */
async function servedVersion(): Promise<string | null> {
  try {
    const r = await fetch('/api/health', { cache: 'no-store', signal: AbortSignal.timeout(2000) });
    const j: unknown = r.ok ? await r.json() : null;
    // the app's own answer (index.ts): not whatever else says a version at this address
    const h = j as { ok?: unknown; version?: unknown; boot?: unknown } | null;
    return h?.ok === true && typeof h.boot === 'string' && typeof h.version === 'string'
      ? h.version
      : null;
  } catch {
    return null; // stopped, restarting: the next time
  }
}

/**
 * Settings and output windows load the new version after an update (1.25.3): the control window hears
 * of it on its socket, they went on with the old page till they were closed (the update run in the
 * app: «Показ» and the settings kept the old scripts). A full-screen window reloads only where it
 * comes back full screen by itself — the desktop app's shell that can put it back. `hold`: not now (the
 * screen yielded to the operator's player); it loads once that is over.
 */
export function useFollowVersion(hold = false): void {
  const held = useRef(hold);
  held.current = hold;
  useEffect(() => {
    // the development server's pages are its own business
    if (import.meta.env.DEV) return;
    const t = window.setInterval(() => {
      void servedVersion().then((v) => {
        if (!v || held.current) return;
        if (document.fullscreenElement && !reloadKeepsFullscreen()) return;
        followAppVersion(v);
      });
    }, ASK_MS);
    return () => window.clearInterval(t);
  }, []);
}
