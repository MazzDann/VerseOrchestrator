import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TextAlign = 'left' | 'center' | 'right';

export interface Appearance {
  scriptureFont: string; // CSS font-family for projected text
  textColor: string;
  textAlign: TextAlign;
  bgColor: string;
  bgImage: string | null; // data URL
  showVerseNumbers: boolean;
  padX: number; // horizontal inset from the screen edges, % of slide width
  padY: number; // vertical inset from the screen edges, % of slide height
  padLinked: boolean; // keep padX and padY equal (move together)
}

export interface RefItem {
  ref: string;
  /** Short label (abbreviated book name), shown in compact lists. */
  refShort?: string;
  translationId: number;
  bookNumber: number;
  chapter: number;
  verse: number;
}

export type PanelPlacement = 'aside' | 'bottom';

interface SettingsState {
  appearance: Appearance;
  panelPlacement: PanelPlacement;
  history: RefItem[];
  bookmarks: RefItem[];
  setPanelPlacement: (p: PanelPlacement) => void;
  setAppearance: (patch: Partial<Appearance>) => void;
  resetAppearance: () => void;
  pushHistory: (item: RefItem) => void;
  removeHistory: (item: RefItem) => void;
  clearHistory: () => void;
  toggleBookmark: (item: RefItem) => void;
  importBookmarks: (items: RefItem[]) => void;
}

export const DEFAULT_APPEARANCE: Appearance = {
  scriptureFont: '"Lora", Georgia, "Times New Roman", serif',
  textColor: '#f4f4f6',
  textAlign: 'center',
  bgColor: '#000000',
  bgImage: null,
  showVerseNumbers: false,
  padX: 4,
  padY: 4,
  padLinked: true,
};

export const FONT_OPTIONS = [
  { value: '"Lora", Georgia, "Times New Roman", serif', label: 'Lora (сериф)' },
  { value: 'Inter, system-ui, sans-serif', label: 'Inter (без зарубок)' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: 'system-ui, -apple-system, sans-serif', label: 'Системний' },
];

export const refKey = (i: RefItem) => `${i.translationId}-${i.bookNumber}-${i.chapter}-${i.verse}`;

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      appearance: DEFAULT_APPEARANCE,
      panelPlacement: 'aside',
      history: [],
      bookmarks: [],
      setPanelPlacement: (p) => set({ panelPlacement: p }),
      setAppearance: (patch) => set((s) => ({ appearance: { ...s.appearance, ...patch } })),
      resetAppearance: () => set({ appearance: DEFAULT_APPEARANCE }),
      pushHistory: (item) =>
        set((s) => {
          const k = refKey(item);
          return { history: [item, ...s.history.filter((h) => refKey(h) !== k)].slice(0, 30) };
        }),
      removeHistory: (item) =>
        set((s) => ({ history: s.history.filter((h) => refKey(h) !== refKey(item)) })),
      clearHistory: () => set({ history: [] }),
      toggleBookmark: (item) =>
        set((s) => {
          const k = refKey(item);
          const exists = s.bookmarks.some((b) => refKey(b) === k);
          return {
            bookmarks: exists
              ? s.bookmarks.filter((b) => refKey(b) !== k)
              : [item, ...s.bookmarks].slice(0, 200),
          };
        }),
      importBookmarks: (items) =>
        set((s) => {
          const seen = new Set(s.bookmarks.map(refKey));
          const merged = [...s.bookmarks];
          for (const it of items) {
            if (it && it.translationId != null && it.bookNumber != null && !seen.has(refKey(it))) {
              seen.add(refKey(it));
              merged.push(it);
            }
          }
          return { bookmarks: merged.slice(0, 200) };
        }),
    }),
    {
      name: 'vo:settings',
      version: 1,
      // Deep-merge so appearance fields added later (e.g. padding) fall back to
      // their defaults instead of being dropped for users with stored settings.
      // (Additive change — no version bump/migrate needed; merge backfills.)
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          appearance: { ...current.appearance, ...(p.appearance ?? {}) },
        };
      },
    },
  ),
);
