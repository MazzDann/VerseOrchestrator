import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { type SlideTemplate, type SlideObject } from './presenterBus';
import { DEFAULT_KEYMAP, sanitizeKeymap, type Keymap, type HotkeyActionId } from './hotkeys';

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
  /** Progressive reveal: show a passage verse-by-verse on each clicker step. */
  reveal: boolean;
  /** Reveal style: dim already-shown verses, brighten only the current one. */
  revealSpotlight: boolean;
  /** Show unrevealed verses faintly (else invisible but space kept). */
  revealPlaceholders: boolean;
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

/** A free-text slide (announcement / note / any custom text), kept in a recents list. */
export interface TextItem {
  title: string;
  body: string;
}

/** A named appearance bundle (look + layout) that can be saved, applied, and shared as a file. */
export interface AppearancePreset {
  name: string;
  appearance: Appearance;
  template: SlideTemplate | null;
}

/** On-disk preset file shape (web/public/presets/*.json + export/import). */
export interface PresetFile {
  $type: 'verseorchestrator-preset';
  version: 1;
  name: string;
  appearance: Partial<Appearance>;
  template: SlideTemplate | null;
}

/** Operator-window panel sizes in px (drag handles on the panel edges). */
export interface PanelLayout {
  navWidth: number;
  asideWidth: number;
  /** Height of the history/saved section at the bottom of the left sidebar. */
  recentHeight: number;
}

/** One remembered output window: what it shows and on which screen (lib/screens.ts). */
export interface SavedOutput {
  kind: 'presenter' | 'stage';
  screenKey: string;
  screenLabel: string;
}

/** Output windows (1.3.2): several presenter windows or one; the remembered layout. */
export interface OutputSettings {
  /** «Вікно показу» opens another window each time instead of reusing the open one */
  multiple: boolean;
  layout: SavedOutput[];
}

export const DEFAULT_OUTPUTS: OutputSettings = { multiple: false, layout: [] };

export function sanitizeOutputs(raw: unknown): OutputSettings {
  const r = (raw ?? {}) as Partial<Record<keyof OutputSettings, unknown>>;
  const layout = Array.isArray(r.layout)
    ? r.layout
        .filter(
          (o): o is SavedOutput =>
            !!o &&
            (o.kind === 'presenter' || o.kind === 'stage') &&
            typeof o.screenKey === 'string' &&
            typeof o.screenLabel === 'string',
        )
        .slice(0, 8)
        .map(({ kind, screenKey, screenLabel }) => ({ kind, screenKey, screenLabel }))
    : [];
  return { multiple: r.multiple === true, layout };
}

export const DEFAULT_LAYOUT: PanelLayout = { navWidth: 300, asideWidth: 380, recentHeight: 170 };

/** [min, max] per field — also applied to persisted values. */
export const LAYOUT_LIMITS: Record<keyof PanelLayout, [number, number]> = {
  navWidth: [220, 480],
  asideWidth: [300, 640],
  recentHeight: [80, 480],
};

export function clampLayout(raw: unknown): PanelLayout {
  const r = (raw ?? {}) as Partial<Record<keyof PanelLayout, unknown>>;
  const out = { ...DEFAULT_LAYOUT };
  for (const k of Object.keys(LAYOUT_LIMITS) as (keyof PanelLayout)[]) {
    const n = Number(r[k]);
    const [min, max] = LAYOUT_LIMITS[k];
    if (Number.isFinite(n)) out[k] = Math.round(Math.min(max, Math.max(min, n)));
  }
  return out;
}

interface SettingsState {
  appearance: Appearance;
  panelPlacement: PanelPlacement;
  layout: PanelLayout;
  /** When true, the presenter follows the selection live; when false, push manually (F5/F2). */
  liveFollow: boolean;
  /** When true, mirror the live slide to the server so phones can follow along. */
  followAlong: boolean;
  /** Active positioned layout; null → the default centred layout. */
  slideTemplate: SlideTemplate | null;
  history: RefItem[];
  bookmarks: RefItem[];
  /** Recently projected free-text slides (newest first). */
  recentTexts: TextItem[];
  /** Operator keyboard shortcuts (action id → react-hotkeys-hook combo). */
  keymap: Keymap;
  /** Saved appearance presets (look + layout bundles). */
  presets: AppearancePreset[];
  outputs: OutputSettings;
  setOutputs: (patch: Partial<OutputSettings>) => void;
  setLiveFollow: (v: boolean) => void;
  setFollowAlong: (v: boolean) => void;
  setSlideTemplate: (t: SlideTemplate | null) => void;
  setPanelPlacement: (p: PanelPlacement) => void;
  setLayout: (patch: Partial<PanelLayout>) => void;
  setAppearance: (patch: Partial<Appearance>) => void;
  resetAppearance: () => void;
  pushHistory: (item: RefItem) => void;
  removeHistory: (item: RefItem) => void;
  clearHistory: () => void;
  toggleBookmark: (item: RefItem) => void;
  importBookmarks: (items: RefItem[]) => void;
  pushRecentText: (item: TextItem) => void;
  removeRecentText: (item: TextItem) => void;
  setHotkey: (id: HotkeyActionId, combo: string) => void;
  resetKeymap: () => void;
  /** Snapshot the current appearance + template under `name` (overwrites same name). */
  savePreset: (name: string) => void;
  /** Apply a saved preset's appearance + template. */
  applyPreset: (name: string) => void;
  /** Apply a preset's look directly without adding it to the library (built-ins). */
  applyPresetData: (preset: AppearancePreset) => void;
  deletePreset: (name: string) => void;
  /** Add a preset (from a file) to the library and apply it; returns its name. */
  importPreset: (preset: AppearancePreset) => string;
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
  reveal: false,
  revealSpotlight: false,
  revealPlaceholders: false,
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

const ALIGNS: TextAlign[] = ['left', 'center', 'right'];
const PAD_UNITS: PadUnit[] = ['px', '%'];
const PAD_LINKS: PadLink[] = ['all', 'axis', 'none'];
const STRONG_SUBLINES: StrongSubline[] = ['lemma', 'full'];
const OBJECT_KINDS = ['quote', 'reference', 'subline', 'divider'];

const numOr = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const strOr = (v: unknown, d: string) => (typeof v === 'string' ? v : d);

/**
 * Validate/clamp an arbitrary appearance object field-by-field over the defaults, so
 * an imported preset can't poison the store with wrong-typed values. `bgImage` is
 * dropped — presets carry the *look*, not the (heavy) background image (keeps export
 * files small and the persisted state under the localStorage quota).
 */
function sanitizeAppearance(ap: Record<string, unknown>): Appearance {
  const m = { ...DEFAULT_APPEARANCE, ...ap } as Appearance;
  return {
    scriptureFont: strOr(m.scriptureFont, DEFAULT_APPEARANCE.scriptureFont),
    textColor: strOr(m.textColor, DEFAULT_APPEARANCE.textColor),
    textAlign: ALIGNS.includes(m.textAlign) ? m.textAlign : DEFAULT_APPEARANCE.textAlign,
    bgColor: strOr(m.bgColor, DEFAULT_APPEARANCE.bgColor),
    bgImage: null,
    showVerseNumbers: !!m.showVerseNumbers,
    padTop: numOr(m.padTop, DEFAULT_APPEARANCE.padTop),
    padRight: numOr(m.padRight, DEFAULT_APPEARANCE.padRight),
    padBottom: numOr(m.padBottom, DEFAULT_APPEARANCE.padBottom),
    padLeft: numOr(m.padLeft, DEFAULT_APPEARANCE.padLeft),
    padUnit: PAD_UNITS.includes(m.padUnit) ? m.padUnit : DEFAULT_APPEARANCE.padUnit,
    padLink: PAD_LINKS.includes(m.padLink) ? m.padLink : DEFAULT_APPEARANCE.padLink,
    strongSubline: STRONG_SUBLINES.includes(m.strongSubline)
      ? m.strongSubline
      : DEFAULT_APPEARANCE.strongSubline,
    redLetter: !!m.redLetter,
    jesusColor: strOr(m.jesusColor, DEFAULT_APPEARANCE.jesusColor),
    highlightColor: strOr(m.highlightColor, DEFAULT_APPEARANCE.highlightColor),
    versesPerSlide: Math.max(0, Math.trunc(numOr(m.versesPerSlide, 0))),
    reveal: !!m.reveal,
    revealSpotlight: !!m.revealSpotlight,
    revealPlaceholders: !!m.revealPlaceholders,
  };
}

/** Validate an imported template into a safe `SlideTemplate` (or null) — dropping
 *  garbage so a malformed `objects` can never crash SlideCanvas/TemplateEditor. */
function coerceTemplate(raw: unknown): SlideTemplate | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as { name?: unknown; objects?: unknown };
  if (!Array.isArray(r.objects)) return null;
  const objects = r.objects
    .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
    .filter((o) => OBJECT_KINDS.includes(o.kind as string))
    .map(
      (o): SlideObject => ({
        kind: o.kind as SlideObject['kind'],
        visible: o.visible !== false,
        x: numOr(o.x, 0),
        y: numOr(o.y, 0),
        w: numOr(o.w, 100),
        h: numOr(o.h, 10),
        align: ALIGNS.includes(o.align as TextAlign) ? (o.align as TextAlign) : 'center',
        size: numOr(o.size, 0),
        ...(typeof o.color === 'string' ? { color: o.color } : {}),
        ...(o.tiedToSubline ? { tiedToSubline: true } : {}),
      }),
    );
  if (objects.length === 0) return null;
  return { name: strOr(r.name, 'Шаблон'), objects };
}

/** Coerce arbitrary parsed JSON into a safe preset, or null if it isn't a preset file. */
export function coercePreset(raw: unknown, fallbackName = 'Імпортований'): AppearancePreset | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  // Reject unrelated JSON (a wrong file picked by mistake) rather than silently
  // resetting the look to defaults under a "success" toast.
  if (r.$type !== 'verseorchestrator-preset') return null;
  const ap = r.appearance;
  const apObj =
    ap && typeof ap === 'object' && !Array.isArray(ap) ? (ap as Record<string, unknown>) : {};
  const name = (typeof r.name === 'string' && r.name.trim()) || fallbackName;
  return { name, appearance: sanitizeAppearance(apObj), template: coerceTemplate(r.template) };
}

/** Serialize a preset to the shareable file shape. */
export function presetToFile(p: AppearancePreset): PresetFile {
  return {
    $type: 'verseorchestrator-preset',
    version: 1,
    name: p.name,
    appearance: p.appearance,
    template: p.template,
  };
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      appearance: DEFAULT_APPEARANCE,
      panelPlacement: 'aside',
      layout: DEFAULT_LAYOUT,
      liveFollow: true,
      followAlong: false,
      slideTemplate: null,
      history: [],
      bookmarks: [],
      recentTexts: [],
      keymap: DEFAULT_KEYMAP,
      presets: [],
      outputs: DEFAULT_OUTPUTS,
      setOutputs: (patch) =>
        set((st) => ({ outputs: sanitizeOutputs({ ...st.outputs, ...patch }) })),
      setLiveFollow: (v) => set({ liveFollow: v }),
      setFollowAlong: (v) => set({ followAlong: v }),
      setSlideTemplate: (t) => set({ slideTemplate: t }),
      setPanelPlacement: (p) => set({ panelPlacement: p }),
      setLayout: (patch) => set((s) => ({ layout: clampLayout({ ...s.layout, ...patch }) })),
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
      setHotkey: (id, combo) => set((s) => ({ keymap: { ...s.keymap, [id]: combo } })),
      resetKeymap: () => set({ keymap: DEFAULT_KEYMAP }),
      savePreset: (name) =>
        set((s) => {
          const n = name.trim();
          if (!n) return s;
          // Snapshot the look but NOT the background image — presets stay small so
          // many can be saved/exported without blowing the localStorage quota.
          const preset: AppearancePreset = {
            name: n,
            appearance: { ...s.appearance, bgImage: null },
            template: s.slideTemplate,
          };
          return { presets: [preset, ...s.presets.filter((p) => p.name !== n)].slice(0, 100) };
        }),
      applyPreset: (name) =>
        set((s) => {
          const p = s.presets.find((x) => x.name === name);
          if (!p) return s;
          // Keep the current background image — presets don't manage it.
          return {
            appearance: { ...DEFAULT_APPEARANCE, ...p.appearance, bgImage: s.appearance.bgImage },
            slideTemplate: p.template ?? null,
          };
        }),
      applyPresetData: (preset) =>
        set((s) => ({
          appearance: {
            ...DEFAULT_APPEARANCE,
            ...preset.appearance,
            bgImage: s.appearance.bgImage,
          },
          slideTemplate: preset.template ?? null,
        })),
      deletePreset: (name) => set((s) => ({ presets: s.presets.filter((p) => p.name !== name) })),
      importPreset: (preset) => {
        set((s) => ({
          presets: [preset, ...s.presets.filter((p) => p.name !== preset.name)].slice(0, 100),
          appearance: {
            ...DEFAULT_APPEARANCE,
            ...preset.appearance,
            bgImage: s.appearance.bgImage,
          },
          slideTemplate: preset.template ?? null,
        }));
        return preset.name;
      },
    }),
    {
      name: 'vo:settings',
      version: 1,
      // Guard the write so a localStorage quota error (e.g. a large bgImage) can't
      // throw out of an unrelated setState — it degrades to "not persisted" instead.
      storage: createJSONStorage(() => ({
        getItem: (k) => localStorage.getItem(k),
        setItem: (k, v) => {
          try {
            localStorage.setItem(k, v);
          } catch {
            /* quota/availability — keep running with in-memory state */
          }
        },
        removeItem: (k) => localStorage.removeItem(k),
      })),
      // Deep-merge so appearance fields added later (e.g. padding) fall back to
      // their defaults instead of being dropped for users with stored settings.
      // (Additive change — no version bump/migrate needed; merge backfills.)
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...p,
          appearance: { ...current.appearance, ...(p.appearance ?? {}) },
          // Backfill missing actions + drop any non-string/garbage values so every
          // consumer (.split in useHotkeys / settings UI) always gets a valid chord.
          keymap: sanitizeKeymap(p.keymap),
          layout: clampLayout(p.layout),
          outputs: sanitizeOutputs(p.outputs),
        };
      },
    },
  ),
);
