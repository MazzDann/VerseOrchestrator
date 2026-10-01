/**
 * The new side of «Відкрити в {browser} зараз» (2026-10-01, server/src/handover.ts): the server
 * opened this control window in another browser as `/?handover=<token>`. The page takes the token
 * out of its address at once (a reload, a bookmark or a restored tab must not carry it), sends it
 * in its first hub hello — the hub then puts this window in charge and says which browser this
 * is — and, should another control window of this browser lead here (Web Locks, lib/leader.ts),
 * takes over from it first, for a token the server still holds.
 *
 * The start file marks the address it opens in the chosen browser `?browser=<id>`
 * (server/src/browsers.ts markBrowser): no secret, just which browser this is — out of the
 * address too, and remembered.
 */
export const HANDOVER_PARAM = 'handover';
export const BROWSER_PARAM = 'browser';
/** What the server issues: 24 URL-safe characters; anything else is no token. */
const TOKEN = /^[\w-]{16,128}$/;
/** A browser id of the list (server/src/browsers.ts KNOWN_BROWSERS). */
const BROWSER_ID = /^[a-z-]{1,32}$/;

/**
 * The token and the browser mark in `href` (or null each) and the address without them (null:
 * nothing to take out).
 */
export function splitHandover(href: string): {
  token: string | null;
  browser: string | null;
  rest: string | null;
} {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { token: null, browser: null, rest: null };
  }
  const raw = url.searchParams.get(HANDOVER_PARAM);
  const mark = url.searchParams.get(BROWSER_PARAM);
  if (raw === null && mark === null) return { token: null, browser: null, rest: null };
  url.searchParams.delete(HANDOVER_PARAM);
  url.searchParams.delete(BROWSER_PARAM);
  return {
    token: raw !== null && TOKEN.test(raw) ? raw : null,
    browser: mark !== null && BROWSER_ID.test(mark) ? mark : null,
    rest: url.pathname + url.search + url.hash,
  };
}

let taken: string | null | undefined;
let sent = false;

/**
 * The token this page was opened with — taken out of the address on the first call, with the
 * start file's browser mark (remembered).
 */
export function takeHandover(): string | null {
  if (taken !== undefined) return taken;
  taken = null;
  if (typeof window === 'undefined') return taken;
  const { token, browser, rest } = splitHandover(window.location.href);
  if (rest !== null) {
    try {
      window.history.replaceState(window.history.state, '', rest);
    } catch {
      /* the address keeps it; the token is good once anyway */
    }
  }
  // opened by the start file in the chosen browser: this browser is that one
  if (browser) rememberBrowser(browser);
  taken = token;
  return taken;
}

/** For the control socket's hello: the token, in the first hello only (one use on the hub). */
export function handoverHello(): { handover?: string } {
  const token = takeHandover();
  if (!token || sent) return {};
  sent = true;
  return { handover: token };
}

/** The control window's hello on every (re)connect (Control.tsx → connectLive). */
export const controlHello = (): { role: 'control'; handover?: string } => ({
  role: 'control',
  ...handoverHello(),
});

/**
 * Opened with a token while another control window of this browser may lead here: ask the server
 * whether the token is still good, then `claim` (lib/leader.ts — it takes over only from another
 * window holding the lock), so this window's hello carries the token. A used, expired or wrong
 * token, or no server: nothing. True when it claimed.
 */
export async function claimForHandover(
  token: string | null,
  check: (token: string) => Promise<{ valid: boolean }>,
  claim: () => Promise<void> | void,
): Promise<boolean> {
  if (!token) return false;
  const valid = await check(token).then(
    (r) => r.valid,
    () => false, // no server: no hub to hand over to
  );
  if (valid) await claim();
  return valid;
}

/**
 * What a hub frame changes for «Відкрити в … зараз» on the control window: `hub` — whether this
 * window says control moved to another browser (its name; null: it doesn't), `handover` — which
 * browser this is (remembered). Other frames: nothing.
 */
export function applyHandoverFrame(
  f: { type: string } & Record<string, unknown>,
  setMovedTo: (browser: string | null) => void,
  remember: (id: unknown) => void = rememberBrowser,
): void {
  if (f.type === 'hub')
    setMovedTo(f.active !== true && typeof f.movedTo === 'string' ? f.movedTo : null);
  if (f.type === 'handover') remember(f.browser);
}

/**
 * Which browser this is, once the app has opened a control window in it (the start file's
 * `?browser=` mark, the hub's `handover` frame): Zen, LibreWolf and Firefox send one and the
 * same User-Agent, Arc that of Chrome. Kept per browser (localStorage is), never synced to data/.
 */
const OWN_KEY = 'vo:browser';

export function rememberBrowser(id: unknown): void {
  if (typeof id !== 'string' || !BROWSER_ID.test(id)) return;
  try {
    localStorage.setItem(OWN_KEY, id);
  } catch {
    /* storage off: the button may show in the browser it names */
  }
}

export function rememberedBrowser(): string | null {
  try {
    return localStorage.getItem(OWN_KEY);
  } catch {
    return null;
  }
}

/** Tests: start over as a freshly loaded page. */
export function resetHandoverForTests(): void {
  taken = undefined;
  sent = false;
}
