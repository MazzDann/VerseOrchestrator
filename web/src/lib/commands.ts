import { useEffect, useRef } from 'react';
import { tr } from '../i18n';

/**
 * Show commands in the control window (0.4.3): one pipeline for everything that drives
 * the show from outside the operator's keyboard — an output window's keys (a clicker on
 * the second monitor) and paired speaker remotes. Before, each source reached its own
 * code: a remote's «Далі» never reached an open song (the songs panel only listened to
 * output windows), and the remote was told «ok» before anything had happened.
 *
 *   - every command carries an id; the same id is applied once (a remote resending after
 *     a reconnect can't advance twice);
 *   - handlers are tried by priority, first one that takes the command wins (an open
 *     song claims next/prev, verse navigation is the default);
 *   - the outcome goes back to the source: moved, or why not («Це останній вірш»).
 */

/**
 * `show` (0.6.0, remotes): put the preview on screen — the operator's F5 / «На екран»; with
 * a passage (0.6.1), put THAT on screen. `pick` (0.6.1): the speaker's own preview — a
 * passage chosen on the phone (the remote's cursor), not on screen yet. `cover` (1.4.1):
 * «Заставка» on and off, the L key in an output window — and a remote's since 1.9.0-beta.10.
 * `countdown` (1.9.0-beta.10, a remote's): «Відлік» started, paused or taken off (`args.countdown`).
 */
export type ShowCommand =
  | 'next'
  | 'prev'
  | 'blank'
  | 'black'
  | 'cover'
  | 'show'
  | 'pick'
  | 'queue'
  | 'countdown';

/** The switches of the show in the control window: «Сховати текст», «Чорний екран», «Заставка». */
export type ShowToggle = 'hide' | 'black' | 'cover';

/**
 * Which switch a command flips — `blank` hides the text (B), `black` is «Чорний екран» («.»),
 * `cover` is «Заставка» (L, 1.4.1) — or null when it isn't a switch. Each by name: the control
 * window sent every command it didn't know to «Чорний екран», so a new one pressed in an
 * output window blacked the screen out; a command added later must be placed here to build.
 */
export function toggleOf(cmd: ShowCommand): ShowToggle | null {
  switch (cmd) {
    case 'blank':
      return 'hide';
    case 'black':
      return 'black';
    case 'cover':
      return 'cover';
    case 'next':
    case 'prev':
    case 'show':
    case 'pick':
    case 'queue':
    case 'countdown':
      return null;
  }
}

/** A passage chosen on a remote (its cursor): the operator's selection is not touched. */
export interface RemotePassage {
  translationIds: number[];
  bookNumber: number;
  chapter: number;
  verses: number[];
}

/** A song stanza chosen on a remote (0.6.3). */
export interface RemoteSong {
  songId: number;
  stanza: number;
}

/** What a remote's cursor points at: a passage or a song stanza. */
export type RemoteTarget =
  | { kind: 'verses'; passage: RemotePassage }
  | { kind: 'song'; song: RemoteSong };

/**
 * «Відлік» from a remote (1.9.0-beta.10): `start` one of `seconds` (or the saved length), `pause`
 * (pause / go on, the T key on the one showing) or `stop` (take it off).
 */
export interface RemoteCountdown {
  op: 'start' | 'pause' | 'stop';
  seconds?: number;
}

export interface CommandArgs {
  passage?: RemotePassage;
  song?: RemoteSong;
  /** an item of the shared running order, by id (0.6.9) */
  item?: string;
  countdown?: RemoteCountdown;
}

/**
 * One item of the shared running order as a remote sees it (0.6.9): what to show, and
 * what the phone needs to walk it with its own cursor (verses / song).
 */
export type PlaylistEntry =
  | ({ id: string; kind: 'passage'; label: string } & RemotePassage)
  | { id: string; kind: 'song'; label: string; songId: number }
  | { id: string; kind: 'text'; label: string }
  /** a picture (1.5.0): shown from the control window, as a free text is */
  | { id: string; kind: 'image'; label: string }
  /** an album (1.8.12): shown from the control window at its first photo, then stepped there */
  | { id: string; kind: 'album'; label: string }
  /** a video (1.8.12-beta.3): played from the control window */
  | { id: string; kind: 'video'; label: string }
  /** «Заставка» as an item (1.10.0-beta.2): its own text over the screen, from the control window */
  | { id: string; kind: 'cover'; label: string };

export interface SharedPlaylist {
  items: PlaylistEntry[];
  currentId: string | null;
}

/** The command args for a target (what goes over the hub). */
export const targetArgs = (t: RemoteTarget | null | undefined): CommandArgs =>
  !t ? {} : t.kind === 'verses' ? { passage: t.passage } : { song: t.song };

/** A song stanza as it arrives from the hub (the server already checked it) — or undefined. */
export function asSong(raw: unknown): RemoteSong | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!Number.isInteger(r.songId) || !Number.isInteger(r.stanza)) return undefined;
  return { songId: r.songId as number, stanza: r.stanza as number };
}

/** A countdown request as it arrives from the hub (the server already checked it) — or undefined. */
export function asCountdown(raw: unknown): RemoteCountdown | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.op !== 'start' && r.op !== 'pause' && r.op !== 'stop') return undefined;
  const seconds = Number.isInteger(r.seconds) && (r.seconds as number) > 0 ? r.seconds : undefined;
  return seconds ? { op: r.op, seconds: seconds as number } : { op: r.op };
}

const ints = (a: unknown): a is number[] =>
  Array.isArray(a) && a.length > 0 && a.every((n) => Number.isInteger(n) && n > 0);

/** A passage as it arrives from the hub (the server already checked it) — or undefined. */
export function asPassage(raw: unknown): RemotePassage | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (!ints(r.translationIds) || !ints(r.verses)) return undefined;
  if (!Number.isInteger(r.bookNumber) || !Number.isInteger(r.chapter)) return undefined;
  return {
    translationIds: r.translationIds,
    bookNumber: r.bookNumber as number,
    chapter: r.chapter as number,
    verses: r.verses,
  };
}

export interface CommandSource {
  kind: 'output' | 'remote';
  /** the remote's name («Пульт Олега») */
  name?: string;
}

export interface Outcome {
  ok: boolean;
  /** why not (or a note) — shown to whoever pressed */
  reason?: string;
}

/**
 * A handler takes the command (returns an outcome — or a promise of one, when it has to
 * load something first, like the verses of a remote's passage) or passes it on (null).
 */
export type CommandHandler = (
  cmd: ShowCommand,
  source: CommandSource,
  args: CommandArgs,
) => Outcome | Promise<Outcome> | null;

/** How long an id is remembered for de-duplication (a retry comes within seconds). */
export const DEDUPE_MS = 30_000;

export function createDispatcher(now: () => number = Date.now) {
  const handlers: { fn: CommandHandler; priority: number }[] = [];
  const seen = new Map<string, { at: number; outcome: Promise<Outcome> }>();

  /** Apply a command once per id; resolves to what happened (a repeat: the first outcome). */
  async function dispatch(
    id: string,
    cmd: ShowCommand,
    source: CommandSource,
    args: CommandArgs = {},
  ): Promise<Outcome & { duplicate?: boolean }> {
    const t = now();
    for (const [k, v] of seen) if (t - v.at > DEDUPE_MS) seen.delete(k);
    const before = seen.get(id);
    if (before) return { ...(await before.outcome), duplicate: true };
    let outcome: Promise<Outcome> = Promise.resolve({
      ok: false,
      reason: tr('Вікно керування ще не готове'),
    });
    for (const h of handlers) {
      const o = h.fn(cmd, source, args);
      if (o) {
        outcome = Promise.resolve(o).catch((e: unknown) => ({
          ok: false,
          reason: (e as Error).message || tr('Не вдалося'),
        }));
        break;
      }
    }
    // remembered before it settles: a retry arriving meanwhile waits for the same outcome
    seen.set(id, { at: t, outcome });
    return outcome;
  }

  /** Register a handler; higher priority is asked first. Returns the unregister function. */
  function handle(fn: CommandHandler, priority = 0): () => void {
    const entry = { fn, priority };
    handlers.push(entry);
    handlers.sort((a, b) => b.priority - a.priority);
    return () => {
      const i = handlers.indexOf(entry);
      if (i >= 0) handlers.splice(i, 1);
    };
  }

  return { dispatch, handle };
}

/** The control window's dispatcher. */
export const commands = createDispatcher();

export const newCommandId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Priorities: an open song before the verse navigation. */
export const PRIORITY = { song: 10, verses: 0 } as const;

/**
 * Register a handler for the component's lifetime. The latest closure is always used
 * (kept in a ref), so the handler can read current state without re-registering.
 */
export function useCommandHandler(fn: CommandHandler, priority: number, enabled = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return;
    return commands.handle((cmd, source, args) => ref.current(cmd, source, args), priority);
  }, [priority, enabled]);
}
