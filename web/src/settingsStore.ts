import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type SlideTemplate } from './presenterBus';

export type TextAlign = 'left' | 'center' | 'right';
export type PadUnit = 'px' | '%';
/** How the four edge insets move together: all sides / vertical+horizontal pairs / independent. */
export type PadLink = 'all' | 'axis' | 'none';
/** How much of a Strong entry to show in the projected subline. */
export type StrongSubline = 'lemma' | 'full';

export interface Appearance {
  scriptureFont: string; // CSS font-family for projected text
  textColor: string;
  textAlign: TextAlign;
  bgColor: string;
  bgImage: string | null; // data URL
  showVerseNumbers: boolean;
  padTop: number; // edge insets from the screen edges, in padUnit
  padRight: number;
  padBottom: number;
  padLeft: number;
  padUnit: PadUnit;
  padLink: PadLink;
  strongSubline: StrongSubline; // lemma only vs full definition in the projected subline
  redLetter: boolean; // colour the words of Jesus (<J>)
  jesusColor: string;
  highlightColor: string; // emphasised (hot) word colour, e.g. the projected Strong word
  /** Split a long selection into pages of this many verses (0 = all on one slide). */
  versesPerSlide: number;
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

/** A free-text slide (announcement / prayer / welcome), kept in a recents list. */
export interface TextItem {
  title: string;
  body: string;
}

interface SettingsState {
  appearance: Appearance;
  panelPlacement: PanelPlacement;
  /** When true, the presenter follows the selection live; when false, push manually (F5/F2). */
  liveFollow: boolean;
  /** Active positioned layout; null → the default centred layout. */
  slideTemplate: SlideTemplate | null;
  history: RefItem[];
  bookmarks: RefItem[];
  /** Recently projected free-text slides (newest first). */
  recentTexts: TextItem[];
  setLiveFollow: (v: boolean) => void;
  setSlideTemplate: (t: SlideTemplate | null) => void;
  setPanelPlacement: (p: PanelPlacement) => void;
  setAppearance: (patch: Partial<Appearance>) => void;
  resetAppearance: () => void;
  pushHistory: (item: RefItem) => void;
  removeHistory: (item: RefItem) => void;
  clearHistory: () => void;
  toggleBookmark: (item: RefItem) => void;
  importBookmarks: (items: RefItem[]) => void;
  pushRecentText: (item: TextItem) => void;
  removeRecentText: (item: TextItem) => void;
}

export const DEFAULT_APPEARANCE: Appearance = {
  scriptureFont: '"Lora", Georgia, "Times New Roman", serif',
  textColor: '#f4f4f6',
  textAlign: 'center',
  bgColor: '#000000',
  bgImage: null,
  showVerseNumbers: false,
  padTop: 4,
  padRight: 4,
  padBottom: 4,
  padLeft: 4,
  padUnit: '%',
  padLink: 'all',
  strongSubline: 'lemma',
  redLetter: true,
  jesusColor: '#ff6b6b',
  highlightColor: '#ffd43b',
  versesPerSlide: 0,
};

export const FONT_OPTIONS = [
  { value: '"Lora", Georgia, "Times New Roman", serif', label: 'Lora (сериф)' },
  { value: 'Inter, system-ui, sans-serif', label: 'Inter (без зарубок)' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: 'system-ui, -apple-system, sans-serif', label: 'Системний' },
];

export const refKey = (i: RefItem) => `${i.translationId}-${i.bookNumber}-${i.chapter}-${i.verse}`;
export const textKey = (t: TextItem) => `${t.title}\n${t.body}`;

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      appearance: DEFAULT_APPEARANCE,
      panelPlacement: 'aside',
      liveFollow: true,
      slideTemplate: null,
      history: [],
      bookmarks: [],
      recentTexts: [],
      setLiveFollow: (v) => set({ liveFollow: v }),
      setSlideTemplate: (t) => set({ slideTemplate: t }),
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
      pushRecentText: (item) =>
        set((s) => {
          const body = item.body.trim();
          if (!body) return s;
          const k = textKey({ title: item.title.trim(), body });
          return {
            recentTexts: [
              { title: item.title.trim(), body },
              ...s.recentTexts.filter((t) => textKey(t) !== k),
            ].slice(0, 12),
          };
        }),
      removeRecentText: (item) =>
        set((s) => ({ recentTexts: s.recentTexts.filter((t) => textKey(t) !== textKey(item)) })),
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
