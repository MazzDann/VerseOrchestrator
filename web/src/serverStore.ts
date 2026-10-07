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
   * Is this page on the computer with the app (1.9.0-beta.1)? The control window works only
   * there; opened from another computer, `/` says how to get a desk link (pages/OtherComputer).
   * True at once on a loopback address; else the control window's start asks `/api/host`;
   * null until then. Without a server (a static build) there is nothing to control: true.
   */
  here: boolean | null;
}

/** localhost (and *.localhost), 127.x.x.x, [::1]: the browser runs on the computer with the app. */
export const isLoopbackHost = (hostname: string): boolean =>
  /^((.+\.)?localhost|127(\.\d{1,3}){3}|\[::1\])$/i.test(hostname);

export const useServer = create<ServerState>()(() => ({
  available: null,
  devLabel: null,
  here: typeof window === 'undefined' || isLoopbackHost(window.location.hostname) ? true : null,
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

/** One quick health check (≤1.5 s). */
export async function probeServer(): Promise<boolean> {
  let health: Health | null = null;
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(1500) });
    if (res.ok) health = (await res.json().catch(() => null)) as Health | null;
  } catch {
    health = null;
  }
  const ok = health?.ok === true;
  useServer.setState(ok ? { available: true, devLabel: devLabelOf(health) } : { available: false });
  return ok;
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
