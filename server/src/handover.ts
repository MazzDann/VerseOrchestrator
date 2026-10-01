/**
 * «Відкрити в {browser} зараз» (the user's ask, 2026-10-01): after choosing another browser in
 * «Відкривати вікно керування в…», move the control window there at once instead of at the next
 * start. The server opens the control window's address in the chosen browser with the command the
 * launcher uses (browsers.ts openInCommand: an app window when «Окремим вікном» is on and the
 * browser can), adding a one-time token: `/?handover=<token>`. The page loaded with it says so in
 * its hub hello (live.ts), and the hub puts it in charge — the way «Слухати тут» does — telling the
 * old window where control went.
 *
 * A token is random, kept in memory only, good for one use and for a minute; one never used
 * simply expires and nothing else changes. Nothing here starts a program by itself: the route's
 * runner does, and tests give it one of their own.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { keyedError, N_, type Vars } from '@vo/shared';
import {
  knownBrowser,
  openInCommand,
  SYSTEM_BROWSER,
  type InstalledBrowser,
  type LaunchSettings,
} from './browsers.js';
import { requireLocalControl } from './guards.js';

/** How long a token waits for the new control window: a browser's cold start takes seconds. */
export const HANDOVER_TTL_MS = 60_000;

/** The browser a token opened: the hub names it to the old window, the page keeps its id. */
export interface HandoverTarget {
  id: string;
  name: string;
}

export interface Handovers {
  /** A new token for a control window about to open in `target`. */
  issue(target: HandoverTarget): string;
  /** The browser of a token still good, without using it up (the page asks before it takes over). */
  peek(token: unknown): HandoverTarget | null;
  /** The same, used up: a second use, an expired or unknown token → null. */
  consume(token: unknown): HandoverTarget | null;
  /** The browser didn't open: the token goes. */
  revoke(token: string): void;
  /** Tokens still good (tests). */
  size(): number;
}

export function createHandovers(
  opts: { now?: () => number; ttlMs?: number; newToken?: () => string } = {},
): Handovers {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? HANDOVER_TTL_MS;
  // 144 random bits as 24 URL-safe characters
  const newToken = opts.newToken ?? (() => randomBytes(18).toString('base64url'));
  const tokens = new Map<string, { target: HandoverTarget; until: number }>();
  const sweep = () => {
    const t = now();
    for (const [k, v] of tokens) if (v.until <= t) tokens.delete(k);
  };
  const peek = (token: unknown): HandoverTarget | null => {
    sweep();
    return typeof token === 'string' ? (tokens.get(token)?.target ?? null) : null;
  };
  return {
    issue(target) {
      sweep();
      const token = newToken();
      tokens.set(token, { target, until: now() + ttl });
      return token;
    },
    peek,
    consume(token) {
      const target = peek(token);
      if (target) tokens.delete(token as string);
      return target;
    },
    revoke(token) {
      tokens.delete(token);
    },
    size() {
      sweep();
      return tokens.size;
    },
  };
}

/** The app's tokens: the route issues them, the hub (live.ts) uses them up. */
export const handovers = createHandovers();

/**
 * The control window's address for a page at `origin` (what the page sends: `location.origin`):
 * an http(s) origin and nothing more, on this computer (`own` — loopback or its own address),
 * else null — the server opens no other address.
 */
export function controlUrl(
  origin: unknown,
  token: string,
  own: (host: string) => boolean,
): string | null {
  if (typeof origin !== 'string') return null;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return null;
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.origin !== origin) return null;
  if (!own(u.hostname.replace(/^\[|\]$/g, ''))) return null;
  return `${u.origin}/?handover=${encodeURIComponent(token)}`;
}

/** Starts a browser's command; resolves null once it is on its way, or what went wrong. */
export type BrowserRunner = (cmd: string, args: string[]) => Promise<string | null>;

/** How long a command may take to fail: `open` answers at once, a browser's program runs on. */
const RUN_SETTLE_MS = 1500;

/**
 * The real runner: the command detached, as the launcher starts a browser (launcher.ts
 * openBrowser). It failed when it can't start or exits with an error within RUN_SETTLE_MS
 * (`open -b` with an app that is gone); exiting cleanly (`open`, or a browser that handed the
 * address to its running copy) or still running (the browser itself) means it is on its way.
 */
export const spawnBrowser: BrowserRunner = (cmd, args) =>
  new Promise((resolve) => {
    let child: ChildProcess;
    try {
      // Windows: a browser's program is a GUI program — no windowsHide (launcher.ts openBrowser)
      child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: cmd === 'cmd' });
    } catch (err) {
      resolve((err as Error).message);
      return;
    }
    const done = (error: string | null) => {
      clearTimeout(timer);
      child.removeListener('exit', onExit);
      child.unref();
      resolve(error);
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) =>
      done(code === 0 ? null : `exit ${code ?? signal}`);
    child.on('error', (err) => done(err.message)); // stays: a late error must not throw
    child.once('exit', onExit);
    const timer = setTimeout(() => done(null), RUN_SETTLE_MS);
  });

export type OpenResult =
  | { ok: true; browser: string }
  | { ok: false; status: number; key: string; vars?: Vars };

export interface OpenDeps {
  platform: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** the choice in data/settings.json → launch */
  launch: LaunchSettings;
  /** the chosen browser on this computer now, or undefined when it is gone */
  find: (id: string) => InstalledBrowser | undefined;
  /** a host name of this computer */
  own: (host: string) => boolean;
  run: BrowserRunner;
  tokens: Handovers;
}

/** «Відкрити в {browser} зараз»: the control window at `origin`, opened in the chosen browser. */
export async function openControlWindow(origin: unknown, d: OpenDeps): Promise<OpenResult> {
  const fail = (status: number, key: string, vars?: Vars): OpenResult => ({
    ok: false,
    status,
    key,
    ...(vars ? { vars } : {}),
  });
  if (d.launch.browser === SYSTEM_BROWSER)
    return fail(400, N_('Спершу виберіть браузер у «Відкривати вікно керування в…».'));
  const b = d.find(d.launch.browser);
  if (!b)
    return fail(404, N_('{browser} на цьому комп’ютері більше немає — виберіть інший браузер.'), {
      browser: knownBrowser(d.launch.browser)?.name ?? d.launch.browser,
    });
  if (!controlUrl(origin, 'x', d.own)) return fail(400, N_('Неправильна адреса вікна керування'));
  const token = d.tokens.issue({ id: b.id, name: b.name });
  const url = controlUrl(origin, token, d.own)!;
  // null: Linux without a screen, a Mac app without its bundle id — nothing to start
  const cmd = openInCommand(d.platform, b, url, d.launch.appWindow, d.env);
  const error = cmd ? await d.run(cmd[0], cmd[1]) : '';
  if (error !== null) {
    d.tokens.revoke(token);
    return error
      ? fail(500, N_('Не вдалося відкрити {browser}: {error}'), { browser: b.name, error })
      : fail(500, N_('Не вдалося відкрити {browser}.'), { browser: b.name });
  }
  return { ok: true, browser: b.name };
}

/**
 * The routes (index.ts mounts them; tests give their own settings, browsers and runner):
 *   POST /api/control-window/open      { origin }  → { ok, browser } — opens it there
 *   POST /api/control-window/handover  { token }   → { valid }       — is it still good?
 * Both from this computer only, with the control window's header (guards.ts).
 */
export function handoverRoutes(
  d: Omit<OpenDeps, 'launch' | 'tokens'> & { launch: () => LaunchSettings; tokens?: Handovers },
): express.Router {
  const tokens = d.tokens ?? handovers;
  const r = express.Router();
  const json = express.json({ limit: '4kb' });
  r.post('/api/control-window/open', requireLocalControl, json, (req, res) => {
    const body = (req.body ?? {}) as { origin?: unknown };
    openControlWindow(body.origin, { ...d, launch: d.launch(), tokens })
      .then((result) => {
        if (result.ok) res.json(result);
        else res.status(result.status).json(keyedError(result.key, result.vars));
      })
      .catch((err: Error) => res.status(500).json({ error: err.message }));
  });
  // a control window opened with a token, on standby in its browser, takes over there only for
  // a token still good (the hub uses it up when the window connects)
  r.post('/api/control-window/handover', requireLocalControl, json, (req, res) => {
    res.json({ valid: tokens.peek((req.body ?? {}).token) !== null });
  });
  return r;
}
