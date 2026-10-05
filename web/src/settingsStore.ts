import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  type SlideTemplate,
  type SlideObject,
  type SlideTransition,
  type QrStyle,
} from './presenterBus';
import { DEFAULT_KEYMAP, sanitizeKeymap, type Keymap, type HotkeyActionId } from './hotkeys';
import { isLang, N_, pickLang, type Lang } from '@vo/shared';
import { tr } from './i18n';
import {
  lookOf,
  WARN_MINUTES,
  type AfterZero,
  type CaptionAt,
  type CornerAt,
  type CornerSize,
  type CountdownPlace,
  type TimerFont,
  type TimerFormat,
  type TimerSize,
} from './lib/countdown';

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
  /** How one slide gives way to the next on the outputs (0.6.7). */
  transition: SlideTransition;
  /** «Заставка» (1.4.0): its line of text and its image (a data URL, PNG keeps transparency). */
  coverText: string;
  coverImage: string | null;
  /** «Відлік» (1.5.0): the words over the time ('' — «Починаємо за» in the window's language) */
  countdownCaption: string;
  /** …and the minutes it last ran for, offered first next time (whole seconds since 1.8.1: 7.5 = 7:30) */
  countdownMinutes: number;
  /** …and what its time does at zero (1.8.0): on into −0:01 by default, the user's ask */
  countdownAfterZero: AfterZero;
  /**
   * The time's colours (1.8.2, Налаштування вигляду → Відлік): a warning so many minutes before
   * the end (0 — none) and its colour; another colour at zero and past it, when on. A look — a
   * preset carries them.
   */
  countdownWarnMinutes: number;
  countdownWarnColor: string;
  countdownOverOn: boolean;
  countdownOverColor: string;
  /** «Відлік»: its last 5 seconds counted aloud for the hall (1.8.5); off unless chosen */
  countdownBeeps: boolean;
  /** …and where it goes (1.8.7): on «Заставка» or in a corner over any slide — the start's choice */
  countdownPlace: CountdownPlace;
  /** «Таймер доповідача» (1.8.4): the length it last ran for (whole seconds) and its «Після нуля» */
  stageTimerMinutes: number;
  stageTimerAfterZero: AfterZero;
  /**
   * The speaker timer's own look (1.8.6), apart from the audience's: a warning so many minutes
   * before the end (0 — none) and its colour, a past-zero colour when on, the font and the format.
   * The operator's own (`ownContent`): a preset — the viewers' look — leaves it as it is.
   */
  stageTimerWarnMinutes: number;
  stageTimerWarnColor: string;
  stageTimerOverOn: boolean;
  stageTimerOverColor: string;
  stageTimerFont: TimerFont;
  stageTimerFormat: TimerFormat;
  /** The corner (1.8.7) and the time's size there: a look, presets carry it. */
  countdownCorner: CornerAt;
  countdownCornerSize: CornerSize;
  /** The time's look (1.8.3): its size, font, how it is written, and where the words go. */
  countdownSize: TimerSize;
  countdownFont: TimerFont;
  countdownFormat: TimerFormat;
  countdownCaptionAt: CaptionAt;
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
  /**
   * Height of the display panel docked below the centre (`panelPlacement: 'bottom'`, 1.4.6) —
   * the window may show less: the verse list above keeps its room (Control, BOTTOM_VERSES_MIN).
   */
  bottomHeight: number;
}

/** One remembered output window: what it shows and on which screen (lib/screens.ts). */
export interface SavedOutput {
  kind: 'presenter' | 'stage';
  screenKey: string;
  screenLabel: string;
}

/** Output windows (0.4.2): several presenter windows or one; the remembered layout. */
export interface OutputSettings {
  /** «Вікно показу» opens another window each time instead of reusing the open one */
  multiple: boolean;
  /** a window goes fullscreen as soon as it opens (Chrome/Edge: gesture delegation, 0.5.7) */
  fullscreen: boolean;
  /**
   * each output window in its own browsing context group (`noopener`, 0.5.13): its own
   * renderer process in Chrome/Edge, so its crash doesn't take the control window down;
   * managed over the bus only, fullscreen by F / a click in the window itself
   */
  separate: boolean;
  layout: SavedOutput[];
}

export const DEFAULT_OUTPUTS: OutputSettings = {
  multiple: false,
  fullscreen: false,
  separate: false,
  layout: [],
};

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
  return {
    multiple: r.multiple === true,
    fullscreen: r.fullscreen === true,
    separate: r.separate === true,
    layout,
  };
}

export const DEFAULT_LAYOUT: PanelLayout = {
  navWidth: 300,
  asideWidth: 380,
  recentHeight: 170,
  bottomHeight: 280,
};

/** [min, max] per field — also applied to persisted values. */
export const LAYOUT_LIMITS: Record<keyof PanelLayout, [number, number]> = {
  navWidth: [220, 480],
  asideWidth: [300, 640],
  recentHeight: [80, 480],
  bottomHeight: [160, 720],
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
  /** The viewers' QR in a corner of the output while follow-along is on (0.6.16). */
  followQrCorner: boolean;
  /** How the viewers' QR is drawn on the output (0.6.20). */
  followQrStyle: QrStyle;
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
  /** Interface language (0.11.0). */
  language: Lang;
  setLanguage: (lang: Lang) => void;
  setOutputs: (patch: Partial<OutputSettings>) => void;
  setLiveFollow: (v: boolean) => void;
  setFollowAlong: (v: boolean) => void;
  setFollowQrCorner: (v: boolean) => void;
  setFollowQrStyle: (v: QrStyle) => void;
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
  transition: 'smooth',
  coverText: '',
  coverImage: null,
  countdownCaption: '',
  countdownMinutes: 5,
  countdownAfterZero: 'overtime',
  countdownWarnMinutes: 1,
  countdownWarnColor: '#ffb020',
  countdownOverOn: true,
  countdownOverColor: '#ff5a5a',
  countdownBeeps: false,
  countdownPlace: 'cover',
  countdownCorner: 'tr',
  countdownCornerSize: 'md',
  stageTimerMinutes: 15,
  stageTimerAfterZero: 'overtime',
  stageTimerWarnMinutes: 1,
  stageTimerWarnColor: '#ffb020',
  stageTimerOverOn: true,
  stageTimerOverColor: '#ff5a5a',
  stageTimerFont: 'text',
  stageTimerFormat: 'clock',
  countdownSize: 'md',
  countdownFont: 'text',
  countdownFormat: 'clock',
  countdownCaptionAt: 'above',
};

/**
 * The operator's own content in the appearance — «Заставка» and «Відлік» (1.4.0, 1.5.0): not a
 * look, so a preset neither carries nor replaces it.
 */
const ownContent = (a: Appearance) => ({
  coverText: a.coverText,
  coverImage: a.coverImage,
  countdownCaption: a.countdownCaption,
  countdownMinutes: a.countdownMinutes,
  countdownAfterZero: a.countdownAfterZero,
  countdownBeeps: a.countdownBeeps,
  countdownPlace: a.countdownPlace,
  stageTimerMinutes: a.stageTimerMinutes,
  stageTimerAfterZero: a.stageTimerAfterZero,
  // the speaker timer's look (1.8.6): not the viewers' look a preset is (review of 1.8.6)
  stageTimerWarnMinutes: a.stageTimerWarnMinutes,
  stageTimerWarnColor: a.stageTimerWarnColor,
  stageTimerOverOn: a.stageTimerOverOn,
  stageTimerOverColor: a.stageTimerOverColor,
  stageTimerFont: a.stageTimerFont,
  stageTimerFormat: a.stageTimerFormat,
});

export const FONT_OPTIONS = [
  { value: '"Lora", Georgia, "Times New Roman", serif', label: N_('Lora (сериф)') },
  { value: 'Inter, system-ui, sans-serif', label: N_('Inter (без зарубок)') },
  { value: 'Georgia, "Times New Roman", serif', label: 'Georgia' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: 'system-ui, -apple-system, sans-serif', label: N_('Системний') },
];

export const refKey = (i: RefItem) => `${i.translationId}-${i.bookNumber}-${i.chapter}-${i.verse}`;
export const textKey = (t: TextItem) => `${t.title}\n${t.body}`;

const ALIGNS: TextAlign[] = ['left', 'center', 'right'];
const TRANSITIONS: SlideTransition[] = ['smooth', 'fast', 'none'];
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
    transition: TRANSITIONS.includes(m.transition) ? m.transition : DEFAULT_APPEARANCE.transition,
    countdownWarnMinutes: (WARN_MINUTES as readonly number[]).includes(m.countdownWarnMinutes)
      ? m.countdownWarnMinutes
      : DEFAULT_APPEARANCE.countdownWarnMinutes,
    countdownWarnColor: strOr(m.countdownWarnColor, DEFAULT_APPEARANCE.countdownWarnColor),
    countdownOverOn: !!m.countdownOverOn,
    countdownOverColor: strOr(m.countdownOverColor, DEFAULT_APPEARANCE.countdownOverColor),
    countdownCorner: lookOf({ corner: m.countdownCorner }).corner,
    countdownCornerSize: lookOf({ cornerSize: m.countdownCornerSize }).cornerSize,
    countdownSize: lookOf({ size: m.countdownSize }).size,
    countdownFont: lookOf({ font: m.countdownFont }).font,
    countdownFormat: lookOf({ format: m.countdownFormat }).format,
    countdownCaptionAt: lookOf({ captionAt: m.countdownCaptionAt }).captionAt,
    // the cover is the operator's content, not a look: a preset carries neither (1.4.0)
    ...ownContent(DEFAULT_APPEARANCE),
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
  return { name: strOr(r.name, tr('Шаблон')), objects };
}

/** Coerce arbitrary parsed JSON into a safe preset, or null if it isn't a preset file. */
export function coercePreset(
  raw: unknown,
  fallbackName = tr('Імпортований'),
): AppearancePreset | null {
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

/** The interface language a browser prefers of ours (English when it prefers neither). */
function browserLang(): Lang {
  // a real page only: Node has a `navigator` too (with the system's language), and the tests
  // must not depend on the machine they run on
  if (typeof window === 'undefined' || typeof window.document?.createElement !== 'function')
    return 'uk';
  return pickLang(navigator.languages?.length ? navigator.languages : [navigator.language ?? '']);
}

/**
 * Did the last write of the settings reach localStorage (1.4.1)? A full storage used to refuse
 * it silently — in Safari's 5 MB a photo as the logo next to a background photo was enough —
 * and every later change was lost with it, unnoticed: the window that made it still showed it.
 */
let lastSaveOk = true;
const saveFailedWatchers = new Set<() => void>();
export const settingsSaved = (): boolean => lastSaveOk;
/** Called on every write of the settings the browser refuses (a page shows a notice). */
export function onSettingsSaveFailed(cb: () => void): () => void {
  saveFailedWatchers.add(cb);
  return () => {
    saveFailedWatchers.delete(cb);
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
      followQrCorner: false,
      followQrStyle: 'rounded',
      slideTemplate: null,
      history: [],
      bookmarks: [],
      recentTexts: [],
      keymap: DEFAULT_KEYMAP,
      presets: [],
      outputs: DEFAULT_OUTPUTS,
      language: browserLang(),
      setLanguage: (lang) => set({ language: isLang(lang) ? lang : 'uk' }),
      setOutputs: (patch) =>
        set((st) => ({ outputs: sanitizeOutputs({ ...st.outputs, ...patch }) })),
      setLiveFollow: (v) => set({ liveFollow: v }),
      setFollowAlong: (v) => set({ followAlong: v }),
      setFollowQrCorner: (v) => set({ followQrCorner: v }),
      setFollowQrStyle: (v) =>
        set({ followQrStyle: v === 'square' || v === 'dots' ? v : 'rounded' }),
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
            appearance: { ...s.appearance, bgImage: null, ...ownContent(DEFAULT_APPEARANCE) },
            template: s.slideTemplate,
          };
          return { presets: [preset, ...s.presets.filter((p) => p.name !== n)].slice(0, 100) };
        }),
      applyPreset: (name) =>
        set((s) => {
          const p = s.presets.find((x) => x.name === name);
          if (!p) return s;
          // Keep the current background image and slide transition — presets don't manage them.
          return {
            appearance: {
              ...DEFAULT_APPEARANCE,
              ...p.appearance,
              bgImage: s.appearance.bgImage,
              transition: s.appearance.transition,
              ...ownContent(s.appearance),
            },
            slideTemplate: p.template ?? null,
          };
        }),
      applyPresetData: (preset) =>
        set((s) => ({
          appearance: {
            ...DEFAULT_APPEARANCE,
            ...preset.appearance,
            bgImage: s.appearance.bgImage,
            // how slides change is the operator's choice, not part of a look (0.6.7)
            transition: s.appearance.transition,
            ...ownContent(s.appearance),
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
            // how slides change is the operator's choice, not part of a look (0.6.7)
            transition: s.appearance.transition,
            ...ownContent(s.appearance),
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
      // throw out of an unrelated setState — it degrades to "not persisted" instead, and
      // says so (1.4.1): `settingsSaved`, `onSettingsSaveFailed`.
      storage: createJSONStorage(() => ({
        getItem: (k) => localStorage.getItem(k),
        setItem: (k, v) => {
          try {
            localStorage.setItem(k, v);
            lastSaveOk = true;
          } catch {
            // quota/availability — keep running with in-memory state
            lastSaveOk = false;
            for (const cb of saveFailedWatchers) cb();
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
          // saved before 0.11.0: the app was Ukrainian; nothing saved: the browser's language
          language: isLang(p.language) ? p.language : persisted ? 'uk' : current.language,
        };
      },
    },
  ),
);

/**
 * Put a picked image into the appearance (1.4.1): the logo or the background. One the storage
 * refuses is taken back at once — else the state that can't be stored keeps every later change
 * from saving too. False: not kept (the pages say why: `onSettingsSaveFailed`).
 */
export function setAppearanceImage(field: 'coverImage' | 'bgImage', data: string): boolean {
  const { appearance, setAppearance } = useSettings.getState();
  const before = appearance[field];
  setAppearance(field === 'coverImage' ? { coverImage: data } : { bgImage: data });
  if (lastSaveOk) return true;
  setAppearance(field === 'coverImage' ? { coverImage: before } : { bgImage: before });
  return false;
}
