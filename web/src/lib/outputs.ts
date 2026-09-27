import { useEffect, useState } from 'react';

/**
 * Output windows registry (1.3.2): every output window (presenter, stage) announces itself
 * on a channel of its own — what it is, where it sits, whether it is fullscreen / visible —
 * on open, on every change and as a heartbeat; it says `bye` when it closes. The control
 * window tracks the list (a window that stops beating is dropped) and can ask one window
 * to identify itself (a big «Показ 1» on that screen, like an OS «identify displays»).
 */

export type OutputKind = 'presenter' | 'stage';

export interface OutputInfo {
  /** stable for the life of the window, across reloads (sessionStorage) */
  id: string;
  /** window.name — lets the window that opened it find its Window reference */
  name: string;
  kind: OutputKind;
  /** outer bounds in screen coordinates (screenX/Y, outerWidth/Height) */
  bounds: { x: number; y: number; w: number; h: number };
  fullscreen: boolean;
  visible: boolean;
  openedAt: number;
}

export type OutputWire =
  | { t: 'win'; info: OutputInfo }
  | { t: 'bye'; id: string }
  | { t: 'who' }
  | { t: 'identify'; id: string; label: string };

export interface OutputChannel {
  post(msg: OutputWire): void;
  listen(cb: (msg: OutputWire) => void): () => void;
}

export interface TrackedOutput extends OutputInfo {
  lastSeen: number;
}

export const OUTPUT_KIND_LABEL: Record<OutputKind, string> = { presenter: 'Показ', stage: 'Сцена' };

/** «Показ 1», «Показ 2», «Сцена 1» — numbered per kind in the order they opened. */
export function outputLabels(list: OutputInfo[]): Map<string, string> {
  const n: Record<OutputKind, number> = { presenter: 0, stage: 0 };
  return new Map(list.map((o) => [o.id, `${OUTPUT_KIND_LABEL[o.kind]} ${++n[o.kind]}`]));
}

export const HEARTBEAT_MS = 5000;
/** Three missed heartbeats and a window counts as gone (crashed, or closed without `bye`). */
export const STALE_MS = 3 * HEARTBEAT_MS;
/**
 * A hidden window (its Space isn't shown, another window covers it — macOS test, 1.4.4)
 * gets its timers throttled by the browser: Chrome lets a hidden page's chained timers
 * run about once a minute, so its heartbeats arrive 30–45 s apart. Such a window is
 * kept until it has been silent for longer than that; it still says `bye` when closed.
 */
export const STALE_HIDDEN_MS = 75_000;

export function createOutputs(channel: OutputChannel, now: () => number = Date.now) {
  /** Output side: announce `info()` now, on `changed()`, on request and as a heartbeat. */
  function announce(info: () => OutputInfo, onIdentify: (label: string) => void) {
    const send = () => channel.post({ t: 'win', info: info() });
    const off = channel.listen((m) => {
      if (m.t === 'who') send();
      else if (m.t === 'identify' && m.id === info().id) onIdentify(m.label);
    });
    send();
    const beat = setInterval(send, HEARTBEAT_MS);
    return {
      changed: send,
      stop() {
        clearInterval(beat);
        off();
        channel.post({ t: 'bye', id: info().id });
      },
    };
  }

  /** Control side: the live list of output windows, oldest first. */
  function track(cb: (list: TrackedOutput[]) => void) {
    const map = new Map<string, TrackedOutput>();
    const emit = () => cb([...map.values()].sort((a, b) => a.openedAt - b.openedAt));
    const off = channel.listen((m) => {
      if (m.t === 'win') {
        const prev = map.get(m.info.id);
        map.set(m.info.id, { ...m.info, lastSeen: now() });
        // a heartbeat with nothing new doesn't re-render the control window
        if (
          !prev ||
          JSON.stringify({ ...prev, lastSeen: 0 }) !== JSON.stringify({ ...m.info, lastSeen: 0 })
        )
          emit();
      } else if (m.t === 'bye' && map.delete(m.id)) emit();
    });
    const prune = setInterval(() => {
      let gone = false;
      for (const [id, o] of map) {
        if (now() - o.lastSeen > (o.visible ? STALE_MS : STALE_HIDDEN_MS)) {
          map.delete(id);
          gone = true;
        }
      }
      if (gone) emit();
    }, HEARTBEAT_MS);
    channel.post({ t: 'who' }); // windows opened before us answer at once
    return () => {
      off();
      clearInterval(prune);
    };
  }

  return {
    announce,
    track,
    identify: (id: string, label: string) => channel.post({ t: 'identify', id, label }),
  };
}

// ---- the app's instance: a BroadcastChannel between same-origin windows

const channel: OutputChannel | null =
  typeof BroadcastChannel !== 'undefined'
    ? (() => {
        const bc = new BroadcastChannel('verse-orchestrator-windows');
        return {
          post: (msg) => bc.postMessage(msg),
          listen: (cb) => {
            const h = (e: MessageEvent) => cb(e.data as OutputWire);
            bc.addEventListener('message', h);
            return () => bc.removeEventListener('message', h);
          },
        };
      })()
    : null;

export const outputs = channel ? createOutputs(channel) : null;

/** This window's id, kept across reloads of the same window. */
function windowId(): string {
  try {
    const saved = sessionStorage.getItem('vo:windowId');
    if (saved) return saved;
    const id = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('vo:windowId', id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

/**
 * For an output page: announce this window while it's mounted. Returns the label to show
 * while the control window asks it to identify itself (null otherwise).
 */
export function useAnnounceOutput(kind: OutputKind): string | null {
  const [identify, setIdentify] = useState<string | null>(null);
  useEffect(() => {
    if (!outputs) return;
    const openedAt = Date.now();
    const id = windowId();
    const info = (): OutputInfo => ({
      id,
      name: window.name,
      kind,
      bounds: { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight },
      fullscreen: !!document.fullscreenElement,
      visible: document.visibilityState === 'visible',
      openedAt,
    });
    let timer: number | undefined;
    const a = outputs.announce(info, (label) => {
      setIdentify(label);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdentify(null), 3000);
    });
    // Moving a window fires no event: compare the position once a second.
    let last = JSON.stringify(info().bounds);
    const poll = window.setInterval(() => {
      const now = JSON.stringify(info().bounds);
      if (now !== last) {
        last = now;
        a.changed();
      }
    }, 1000);
    const changed = () => a.changed();
    window.addEventListener('resize', changed);
    document.addEventListener('fullscreenchange', changed);
    document.addEventListener('visibilitychange', changed);
    const bye = () => a.stop();
    window.addEventListener('pagehide', bye);
    return () => {
      window.clearInterval(poll);
      window.clearTimeout(timer);
      window.removeEventListener('resize', changed);
      document.removeEventListener('fullscreenchange', changed);
      document.removeEventListener('visibilitychange', changed);
      window.removeEventListener('pagehide', bye);
      a.stop();
    };
  }, [kind]);
  return identify;
}

/** For the control window: the output windows open right now. */
export function useOutputWindows(): TrackedOutput[] {
  const [list, setList] = useState<TrackedOutput[]>([]);
  useEffect(() => outputs?.track(setList), []);
  return list;
}
