import type { Appearance } from '../settingsStore';
import type { SlideSource } from '../presenterBus';
import { tr } from '../i18n';

/**
 * «Сцена» (1.9.0-beta.11, F1005-09): the speaker's window — its own settings and words. The
 * window reads the settings from the store (the same browser as the control window; the
 * storage event brings a change, main.tsx): they are nobody else's look, nothing on the bus.
 */

/** «Текст» — the slide's words, large and plain; «Мініатюри» — the slides as the screen shows them. */
export type StageLayout = 'text' | 'slides';
export type StageTextSize = 'sm' | 'md' | 'lg' | 'xl';
export type StageTheme = 'dark' | 'light';

export interface StageLook {
  layout: StageLayout;
  textSize: StageTextSize;
  showNext: boolean;
  clockSeconds: boolean;
  theme: StageTheme;
  showOrder: boolean;
  showPlace: boolean;
}

const LAYOUTS: readonly StageLayout[] = ['text', 'slides'];
const SIZES: readonly StageTextSize[] = ['sm', 'md', 'lg', 'xl'];
const THEMES: readonly StageTheme[] = ['dark', 'light'];
const oneOf = <T extends string>(all: readonly T[], v: unknown, d: T): T =>
  all.includes(v as T) ? (v as T) : d;
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** The settings as «Сцена» uses them — sound whatever an older or hand-edited store holds. */
export function stageLook(a: Partial<Appearance>): StageLook {
  return {
    layout: oneOf(LAYOUTS, a.stageLayout, 'text'),
    textSize: oneOf(SIZES, a.stageTextSize, 'md'),
    showNext: bool(a.stageShowNext, true),
    clockSeconds: bool(a.stageClockSeconds, true),
    theme: oneOf(THEMES, a.stageTheme, 'dark'),
    showOrder: bool(a.stageShowOrder, true),
    showPlace: bool(a.stageShowPlace, true),
  };
}

/**
 * The running order's item on screen, for «Сцена» (review of 1.9.0-beta.11): the playlist store
 * keeps `currentId` in memory only (its `partialize`), so the control window in charge mirrors it
 * here and the stage window of this browser hears the storage event.
 */
export const ORDER_CURRENT_KEY = 'vo:playlist-current';

/** The largest the words may grow in «Текст», in vmin of the window: the auto-fit's ceiling. */
export const STAGE_TEXT_MAX: Record<StageTextSize, number> = { sm: 7, md: 10, lg: 14, xl: 20 };

/**
 * Where the screen is in its chapter, song or album: «вірш 16 з 36», «вірші 16–18 з 36»,
 * «строфа 3 з 5», «фото 4 з 20» — '' when the source doesn't know its total.
 */
export function placeWords(src: SlideSource | undefined | null): string {
  if (!src || src.kind === 'video' || !src.total) return '';
  if (src.kind === 'verses') {
    // the page on screen when the selection has pages (review), else the selection
    const first = src.shown?.[0] ?? src.verses[0];
    const last = src.shown?.[1] ?? src.verses[src.verses.length - 1];
    if (first == null) return '';
    return first === last
      ? tr('вірш {n} з {total}', { n: first, total: src.total })
      : tr('вірші {from}–{to} з {total}', { from: first, to: last, total: src.total });
  }
  if (src.kind === 'song')
    return tr('строфа {n} з {total}', { n: src.stanza + 1, total: src.total });
  if (src.kind === 'album') return tr('фото {n} з {total}', { n: src.index + 1, total: src.total });
  return '';
}

/** The clock on «Сцена»: 14:05:09, or 14:05 without the seconds. */
export function clockWords(now: Date, seconds: boolean): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const hm = `${p(now.getHours())}:${p(now.getMinutes())}`;
  return seconds ? `${hm}:${p(now.getSeconds())}` : hm;
}
