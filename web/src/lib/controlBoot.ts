import { isLoopbackHost, lookAgain, probe, useServer } from '../serverStore';
import { localEngine } from './engine';
import { restoreLocalSegments } from './engine/restore';
import { startUiStateSync, watchLocalEdits } from './uiState';

/**
 * The control window's start (0.12.1: loaded only on its own page, so the phones and the output
 * windows don't download the browser engine and the settings sync). Is the server there?
 * Without it (a static deployment, a stopped server) the library runs in the browser — switch
 * to it and restore the remembered segments. Library reads wait for this (whenBooted), so
 * nothing hits a missing API first.
 *
 * A server that doesn't answer yet (1.12.5, users' report F1010-02b — the tab ran on the
 * browser's library until it was reloaded) is looked for again (`lookAgain`); once it answers,
 * the window does what this start would have done with it, and `onServerBack` has every query
 * ask it.
 */
export async function bootControl(onServerBack: () => void = () => {}): Promise<void> {
  const found = await probe();
  if (found === 'up') {
    if (!(await settleHere())) return;
    // settings and the running order kept with the app in data/ (0.7.4)
    void startUiStateSync();
  } else {
    // (no server → reads go to the browser engine via effectiveSource(); the saved
    // preference is left alone so a temporary outage doesn't flip it)
    useServer.setState({ here: true });
    if (found === 'absent') useServer.setState({ available: false });
    else {
      // what is changed here meanwhile is newer than data/'s copy: sent, not taken, at the sync
      watchLocalEdits();
      lookAgain(() => void serverBack(onServerBack));
    }
  }
  restoreLocalSegments();
  await localEngine.whenReady();
}

/** The server answered after all (1.12.5): what the start would have done, then fresh reads. */
async function serverBack(onServerBack: () => void): Promise<void> {
  console.info('[control] the server answered — reading the library from it again');
  if (!(await settleHere())) return;
  void startUiStateSync();
  onServerBack();
}

/**
 * Opened from another computer (1.9.0-beta.10): the control window works only on the one with
 * the app — `/` shows how to get a desk link instead; no settings sync, no browser library.
 */
async function settleHere(): Promise<boolean> {
  const here = await onThisComputer();
  useServer.setState({ here });
  return here;
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
