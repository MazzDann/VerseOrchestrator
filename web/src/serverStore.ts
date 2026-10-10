import { create } from 'zustand';
import { N_ } from '@vo/shared';

/**
 * Is the Node API reachable? `null` until the first probe. A static deployment (no
 * server — `npm run build:static`) or a stopped server both read as `false`: the library
 * then runs in the browser from static / cached segments, and server-only features
 * (viewers, speaker remote, library rebuild) are switched off with an explanation.
 */
interface ServerState {
  available: boolean | null;
  /**
   * What a copy run from a git checkout calls itself — «dev 1.4.2.try7 (mac-test · 20dd850)»
   * (server/src/versionLabel.ts); null for a release, and until the server answers.
   */
  devLabel: string | null;
  /**
   * Is this page on the computer with the app (1.9.0-beta.10)? The control window works only
   * there; opened from another computer, `/` says how to get a desk link (pages/OtherComputer).
   * True at once on a loopback address; else the control window's start asks `/api/host`;
   * null until then. Without a server (a static build) there is nothing to control: true.
   */
  here: boolean | null;
  /**
   * The control window's server didn't answer at its start — starting, the laptop waking, a
   * network that dropped — and is being looked for again (1.12.5, `lookAgain`). Meanwhile the
   * choices that depend on the library (the ticked translations) are kept for its return.
   */
  lost: boolean;
}

/** localhost (and *.localhost), 127.x.x.x, [::1]: the browser runs on the computer with the app. */
export const isLoopbackHost = (hostname: string): boolean =>
  /^((.+\.)?localhost|127(\.\d{1,3}){3}|\[::1\])$/i.test(hostname);

export const useServer = create<ServerState>()(() => ({
  available: null,
  devLabel: null,
  here: typeof window === 'undefined' || isLoopbackHost(window.location.hostname) ? true : null,
  lost: false,
}));

interface Health {
  ok?: unknown;
  version?: unknown;
  label?: unknown;
}

/** The dev label in a health answer: a label other than the version (a release's is the version). */
export const devLabelOf = (h: Health | null): string | null =>
  typeof h?.label === 'string' && h.label !== h.version ? h.label : null;

/**
 * The version inside a sentence that brackets it («У вас остання версія ({current})»): the dev
 * label's own bracket flattened, «dev 1.4.2.try7, mac-test · 20dd850»; a release's version as it is.
 */
export const shownVersion = (devLabel: string | null, version: string): string =>
  devLabel ? devLabel.replace(/ \((.*)\)$/, ', $1') : version;

/**
 * What stands at the top of «Налаштування вигляду» (2026-10-01, the user's ask: «версія +
 * індикатор»): a release by its name and version, «VerseOrchestrator 1.4.5»; a git checkout by
 * its label, «dev 1.4.4.try3 (feat/x · abc1234)» — so a test build is told from the release it
 * grew from at a glance.
 */
export const versionHeading = (devLabel: string | null, version: string): string =>
  devLabel ?? `VerseOrchestrator ${version}`;

/** The version alone («Версія …» under the browser choice): a checkout's label, else the semver. */
export const versionText = (devLabel: string | null, version: string): string =>
  devLabel ?? version;

/**
 * What one health check found (1.12.5): the app's server (`up`, and the store says so), no server
 * at this address (`absent` — an answer that isn't the app's: a static build), or no answer yet
 * (`unreachable` — starting, asleep, a dropped network; the dev proxy's 5xx while the API process
 * is down). Before 1.12.5 the last two were one: a tab that met a server not up yet ran on the
 * browser's library until it was reloaded (users' report F1010-02b).
 */
export type Probe = 'up' | 'absent' | 'unreachable';

export async function probe(): Promise<Probe> {
  try {
    const res = await fetch('/api/health', {
      signal: AbortSignal.timeout(1500),
      cache: 'no-store',
    });
    if (res.status >= 500) return 'unreachable';
    const health = res.ok ? ((await res.json().catch(() => null)) as Health | null) : null;
    if (health?.ok !== true) return 'absent';
    useServer.setState({ available: true, devLabel: devLabelOf(health), lost: false });
    return 'up';
  } catch {
    return 'unreachable';
  }
}

/** One quick health check (≤1.5 s): the server there or not. */
export async function probeServer(): Promise<boolean> {
  const found = await probe();
  if (found !== 'up') useServer.setState({ available: false });
  return found === 'up';
}

/**
 * The control window's server didn't answer at its start (1.12.5): look for it again — every
 * 2 s for a minute (it may be starting, the laptop waking), the library reads meanwhile asking
 * it and saying they failed; after the minute the browser's library, as before 1.12.5, and a look
 * whenever the browser is online again or the window comes back into sight. `onBack` once it
 * answers; an address that turns out to have no server stops the looking. Returns the stop.
 */
export function lookAgain(
  onBack: () => void,
  o: { everyMs?: number; forMs?: number } = {},
): () => void {
  const everyMs = o.everyMs ?? 2000;
  const forMs = o.forMs ?? 60_000;
  const started = Date.now();
  let stopped = false;
  let asking = false;
  useServer.setState({ available: null, lost: true });
  const stop = () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener('online', look);
    window.removeEventListener('focus', look);
    document.removeEventListener('visibilitychange', look);
  };
  const look = () => {
    if (stopped || asking || document.visibilityState === 'hidden') return;
    asking = true;
    void probe().then((found) => {
      asking = false;
      if (stopped) return;
      if (found === 'up') {
        stop();
        onBack();
      } else if (found === 'absent') {
        stop();
        useServer.setState({ available: false, lost: false });
      }
    });
  };
  const timer = window.setInterval(() => {
    if (Date.now() - started < forMs) return look();
    window.clearInterval(timer);
    // a minute without it: the browser's library meanwhile (still looked for on the events)
    if (useServer.getState().available === null) useServer.setState({ available: false });
  }, everyMs);
  window.addEventListener('online', look);
  window.addEventListener('focus', look);
  document.addEventListener('visibilitychange', look);
  return stop;
}

/** How to start the app again after «Вимкнути повністю» — the launchers of 0.7.0. */
export const START_AGAIN = N_(
  'Щоб запустити знову, відкрийте start.cmd (Windows), start.command (macOS) або ./start.sh (Linux) у папці застосунку.',
);

/** Copy for controls that need the server. */
export const NEEDS_SERVER = N_(
  'Потрібен сервер застосунку (start.cmd / start.command / ./start.sh) — зараз працює лише бібліотека в браузері',
);

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
