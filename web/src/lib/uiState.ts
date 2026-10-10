import { api, type UiEntry, type UiState } from '../api';
import { usePlaylist } from '../playlistStore';
import { useSettings } from '../settingsStore';

/**
 * The UI state kept with the app in data/ (0.7.4, server/src/uiState.ts): appearance, presets
 * and hotkeys, the running order and saved programmes. The browser keeps its own copy per
 * address (localStorage), so the copies are synced from the control window: at start the newer
 * one wins — the server's is written into the browser and the store reloads, the browser's is
 * sent up (the first start after the update moves the current settings into data/); then every
 * change is sent a second after the last one. A save is newer by its time; a later save wins.
 */
const STORES = { 'vo:settings': useSettings, 'vo:playlist': usePlaylist } as const;
type Key = keyof typeof STORES;
const KEYS = Object.keys(STORES) as Key[];

/** When this browser last had each entry in step with data/ (per address). */
const AT_KEY = 'vo:ui-state-at';
const SEND_AFTER_MS = 1000;

/** Which copy wins at start: the server's (take), the browser's (push), or they agree. */
export function planSync(
  local: string | null,
  localAt: number,
  remote: UiEntry | undefined,
): 'take' | 'push' | 'none' {
  if (remote && (local === null || remote.at > localAt))
    return remote.value === local ? 'none' : 'take';
  if (local !== null && (!remote || localAt > remote.at)) return 'push';
  return 'none';
}

const get = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
/**
 * When this browser was last in step with data/, per key. Anything but an object of numbers —
 * a value damaged or edited by hand — counts as never synced: the sync must not die on it
 * (0.11.8: a bare number there threw on every start, and nothing reached data/ again).
 */
export function parseAt(raw: string | null): Partial<Record<Key, number>> {
  let v: unknown;
  try {
    v = JSON.parse(raw ?? '{}');
  } catch {
    return {};
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const at: Partial<Record<Key, number>> = {};
  for (const key of KEYS) {
    const t = (v as Record<string, unknown>)[key];
    if (typeof t === 'number' && Number.isFinite(t)) at[key] = t;
  }
  return at;
}
const readAt = () => parseAt(get(AT_KEY));
const writeAt = (at: Partial<Record<Key, number>>) => {
  try {
    localStorage.setItem(AT_KEY, JSON.stringify(at));
  } catch {
    /* storage blocked: synced again next start */
  }
};

/** takeServerUiState calls under way: no change is sent meanwhile. */
let taking = 0;

/** The running sync's memory (the control window's; null elsewhere and before it starts). */
let running: {
  sent: Partial<Record<Key, string>>;
  at: Partial<Record<Key, number>>;
  timers: Partial<Record<Key, number>>;
} | null = null;

/**
 * A backup was restored or undone (1.5.0, server/src/backup.ts): take data/'s UI state now — in
 * the window that restored it, and in every other control window the hub tells — dropping the
 * changes not sent yet. A window still holding the old state would else send it back with its
 * next change, newer by its time, and undo the restore (review of #47). The other windows of
 * this browser follow through `storage` events (main.tsx). False: no server to ask.
 */
export async function takeServerUiState(): Promise<boolean> {
  // what was waiting to be sent is dropped at once, and nothing is sent until data/'s state is
  // taken: a change sent meanwhile would replace the restored one (review of #47)
  if (running) for (const key of KEYS) window.clearTimeout(running.timers[key]);
  taking++;
  let remote: UiState;
  try {
    remote = await api.uiState();
  } catch {
    taking--;
    return false;
  }
  const at = running?.at ?? readAt();
  for (const key of KEYS) {
    const entry = remote[key];
    if (!entry) continue;
    if (running) {
      window.clearTimeout(running.timers[key]);
      running.sent[key] = entry.value;
    }
    at[key] = entry.at;
    try {
      localStorage.setItem(key, entry.value);
    } catch {
      continue;
    }
    await STORES[key].persist.rehydrate();
  }
  writeAt(at);
  taking--;
  return true;
}

/**
 * «Повернути як було» after an import into a copy that had no UI state of its own (1.12.0-beta.2):
 * data/ has none now, so this browser drops its copy too and the page starts from the defaults at
 * its reload — nothing is sent meanwhile.
 */
export function dropUiState(): void {
  if (running) for (const key of KEYS) window.clearTimeout(running.timers[key]);
  taking++;
  try {
    for (const key of [...KEYS, AT_KEY]) localStorage.removeItem(key);
  } catch {
    /* storage blocked: nothing kept to drop */
  }
}

/** Start syncing (the control window, once the server is there). */
export async function startUiStateSync(): Promise<void> {
  let remote: UiState;
  try {
    remote = await api.uiState();
  } catch {
    return; // no server, or another machine: the browser's copy is all there is
  }
  const at = readAt();
  /** What was last in step with data/, so an unchanged re-save isn't sent again. */
  const sent: Partial<Record<Key, string>> = {};

  const take = async (key: Key, entry: UiEntry) => {
    try {
      localStorage.setItem(key, entry.value);
    } catch {
      return;
    }
    sent[key] = entry.value;
    at[key] = entry.at;
    writeAt(at);
    await STORES[key].persist.rehydrate();
  };
  const push = async (key: Key, value: string, when: number) => {
    sent[key] = value;
    try {
      const r = await api.saveUiState(key, value, when);
      if (r.saved) {
        at[key] = when;
        writeAt(at);
      } else await take(key, r.entry); // saved later from another address
    } catch {
      sent[key] = undefined; // the server went away: sent again with the next change
    }
  };

  for (const key of KEYS) {
    const local = get(key);
    const plan = planSync(local, at[key] ?? 0, remote[key]);
    if (plan === 'take') await take(key, remote[key]!);
    else if (plan === 'push' && local !== null) await push(key, local, at[key] || Date.now());
    else sent[key] = local ?? undefined;
  }

  const timers: Partial<Record<Key, number>> = {};
  running = { sent, at, timers };
  for (const key of KEYS)
    STORES[key].subscribe(() => {
      window.clearTimeout(timers[key]);
      timers[key] = window.setTimeout(() => {
        const value = get(key);
        // nothing to send: unchanged, or the browser data was just cleared (0.7.1), or a
        // restored state is being taken (its rehydrate fires this too)
        if (taking > 0 || value === null || value === sent[key]) return;
        // a change here, newer than data/ — remembered even if the server is away now, so the
        // next start sends it
        const when = Date.now();
        at[key] = when;
        writeAt(at);
        void push(key, value, when);
      }, SEND_AFTER_MS);
    });
}
