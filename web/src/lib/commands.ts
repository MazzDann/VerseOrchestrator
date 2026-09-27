import { useEffect, useRef } from 'react';

/**
 * Show commands in the control window (1.3.3): one pipeline for everything that drives
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

export type ShowCommand = 'next' | 'prev' | 'blank' | 'black';

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

/** A handler takes the command (returns an outcome) or passes it on (returns null). */
export type CommandHandler = (cmd: ShowCommand, source: CommandSource) => Outcome | null;

/** How long an id is remembered for de-duplication (a retry comes within seconds). */
export const DEDUPE_MS = 30_000;

export function createDispatcher(now: () => number = Date.now) {
  const handlers: { fn: CommandHandler; priority: number }[] = [];
  const seen = new Map<string, { at: number; outcome: Outcome }>();

  function dispatch(
    id: string,
    cmd: ShowCommand,
    source: CommandSource,
  ): Outcome & { duplicate?: boolean } {
    const t = now();
    for (const [k, v] of seen) if (t - v.at > DEDUPE_MS) seen.delete(k);
    const before = seen.get(id);
    if (before) return { ...before.outcome, duplicate: true };
    let outcome: Outcome = { ok: false, reason: 'Вікно керування ще не готове' };
    for (const h of handlers) {
      const o = h.fn(cmd, source);
      if (o) {
        outcome = o;
        break;
      }
    }
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
    return commands.handle((cmd, source) => ref.current(cmd, source), priority);
  }, [priority, enabled]);
}
