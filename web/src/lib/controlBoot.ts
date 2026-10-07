import { isLoopbackHost, probeServer, useServer } from '../serverStore';
import { localEngine } from './engine';
import { restoreLocalSegments } from './engine/restore';
import { startUiStateSync } from './uiState';

/**
 * The control window's start (0.12.1: loaded only on its own page, so the phones and the output
 * windows don't download the browser engine and the settings sync). Is the server there?
 * Without it (a static deployment, a stopped server) the library runs in the browser — switch
 * to it and restore the remembered segments. Library reads wait for this (whenBooted), so
 * nothing hits a missing API first.
 */
export async function bootControl(): Promise<void> {
  await probeServer();
  // Opened from another computer (1.9.0-beta.10): the control window works only on the one with
  // the app — `/` shows how to get a desk link instead; no settings sync, no browser library.
  if (useServer.getState().available && !(await onThisComputer())) {
    useServer.setState({ here: false });
    return;
  }
  useServer.setState({ here: true });
  // settings and the running order kept with the app in data/ (0.7.4)
  if (useServer.getState().available) void startUiStateSync();
  // (no server → reads go to the browser engine via effectiveSource(); the saved
  // preference is left alone so a temporary outage doesn't flip it)
  restoreLocalSegments();
  await localEngine.whenReady();
}

/** Does the server see this page coming from its own computer? (An older one can't say: yes.) */
async function onThisComputer(): Promise<boolean> {
  if (isLoopbackHost(window.location.hostname)) return true;
  try {
    const res = await fetch('/api/host', { signal: AbortSignal.timeout(1500) });
    const host = (await res.json()) as { local?: unknown };
    return host.local !== false;
  } catch {
    return true;
  }
}
