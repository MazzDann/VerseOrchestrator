import { readJson, writeJson } from './jsonFile.js';

/**
 * The operator's UI state kept with the app in data/ui-state.json (0.7.4): appearance, presets
 * and hotkeys (`vo:settings`), the running order and saved programmes (`vo:playlist`). It moves
 * with the folder (a portable copy), and every address of the app (another port, the LAN
 * address) sees the same — the browser only keeps a copy per address. Each entry is the store's
 * persisted JSON as the browser wrote it, with the time it was saved; a later save wins
 * (web/src/lib/uiState.ts).
 */
export const UI_KEYS = ['vo:settings', 'vo:playlist'] as const;
export type UiKey = (typeof UI_KEYS)[number];
export interface UiEntry {
  value: string;
  at: number;
}
export type UiState = Partial<Record<UiKey, UiEntry>>;

let file = '';

export function initUiState(path: string): void {
  file = path;
}

export function getUiState(): UiState {
  return file ? readJson<UiState>(file, {}) : {};
}

export const isUiKey = (k: unknown): k is UiKey => UI_KEYS.includes(k as UiKey);

/** Save one entry unless a later one is there already; says which one is kept. */
export function saveUiEntry(
  key: UiKey,
  value: string,
  at: number,
): { saved: boolean; entry: UiEntry } {
  const all = getUiState();
  const kept = all[key];
  if (kept && kept.at > at) return { saved: false, entry: kept };
  const entry = { value, at };
  writeJson(file, { ...all, [key]: entry });
  return { saved: true, entry };
}
