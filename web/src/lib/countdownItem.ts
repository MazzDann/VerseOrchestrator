import { type SeqCountdown } from '../playlistStore';
import { type Slide, type SlideCountdown } from '../presenterBus';
import { type AfterZero, untilFor } from './countdown';
import { tr } from '../i18n';

/** What a «Відлік» item does at zero (1.10.0-beta.3): the next item, or what «Відлік» does. */
export type ItemZero = 'next' | AfterZero;
export const ITEM_ZEROS: readonly ItemZero[] = ['next', 'overtime', 'stop', 'hide'];
export const isItemZero = (v: unknown): v is ItemZero => ITEM_ZEROS.includes(v as ItemZero);

/** 1 s … 12 h, whole seconds (as «Відлік»). */
export const clampSeconds = (s: number): number =>
  Math.min(43200, Math.max(1, Math.round(Number.isFinite(s) ? s : 300)));

/** «5:00», «1:30:00» — the item's length as typed in its editor. */
export function lengthText(seconds: number): string {
  const s = clampSeconds(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(r)}` : `${m}:${two(r)}`;
}

/** The item's name in the list: «Відлік 5:00 · Починаємо за». */
export const countdownLabel = (seconds: number, caption: string): string =>
  [`${tr('Відлік')} ${lengthText(seconds)}`, caption.trim()].filter(Boolean).join(' · ');

/** The countdown an item starts now: «наступний пункт» holds 0:00 until the order moves on. */
export const itemCountdown = (it: SeqCountdown, now: number): SlideCountdown =>
  ({
    until: untilFor(clampSeconds(it.seconds) * 1000, now),
    caption: it.caption.trim(),
    afterZero: it.atZero === 'next' ? 'stop' : it.atZero,
    item: it.id,
  }) as SlideCountdown;

/** Is this slide the countdown this item started (not one started by hand with the same words)? */
export const showsItemCountdown = (it: SeqCountdown, slide: Slide): boolean =>
  !!slide.cover && !!slide.countdown && slide.countdown.item === it.id;

/**
 * When a «наступний пункт» countdown should move the order on (1.10.0-beta.3): in `ms` from now;
 * null — not this countdown, paused, or its zero passed long ago (a reload, a window that took
 * over late: no jump out of the blue).
 */
export function zeroIn(
  it: SeqCountdown,
  slide: Slide,
  now: number,
  /** the armed timer firing (review): a hidden window's timer may come a minute late — still go */
  late = false,
): number | null {
  if (it.atZero !== 'next' || !showsItemCountdown(it, slide)) return null;
  const c = slide.countdown!;
  if (c.pausedLeft != null) return null;
  const ms = c.until - now;
  if (late) return ms <= 250 ? 0 : null;
  return ms < -5000 ? null : Math.max(0, ms);
}
