import { useEffect, useState } from 'react';

/**
 * «Відлік» (1.5.0): «Починаємо за 4:59» under «Заставка» before a show. The slide carries the
 * moment it ends (`until`, ms since the epoch), not the time left: an output window that opens
 * mid-way, a phone that joins late or a control window that takes over all count to the same
 * end. Windows of one computer share its clock; a phone uses its own — off by the second or two
 * its network time allows.
 */

/**
 * What the time does at zero (1.8.0, «Після нуля»): counts on past it as −0:01, −0:02 … (the
 * user's ask), stays at 0:00, or goes — and «Заставка» stays, as in 1.5.0–1.7.x.
 */
export type AfterZero = 'overtime' | 'stop' | 'hide';
export const AFTER_ZERO: readonly AfterZero[] = ['overtime', 'stop', 'hide'];
export const isAfterZero = (v: unknown): v is AfterZero => AFTER_ZERO.includes(v as AfterZero);
/** A countdown from before 1.8.0 says nothing: its time went at zero. */
export const afterZeroOf = (c: object | null | undefined): AfterZero => {
  const v = (c as { afterZero?: unknown } | null | undefined)?.afterZero;
  return isAfterZero(v) ? v : 'hide';
};

/** Minutes offered as one click; anything else goes through «до» a time of day. */
export const COUNTDOWN_MINUTES = [1, 3, 5, 10, 15, 30] as const;

/** The longest countdown of minutes (12 h); and how far past midnight «до» a time reaches. */
const MAX_MS = 12 * 60 * 60 * 1000;
/** The furthest end a countdown ever has (a later time today, then ±1 хв). */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Milliseconds left until `until` (0 once it has passed). */
export function remainingMs(until: number, now: number): number {
  return Math.max(0, until - now);
}

/**
 * The time left as a clock shows it: «4:59», «12:00», «1:05:09». Rounded up, so it reads
 * «5:00» right after the start and «0:01» in its last second — never «0:00» while it runs.
 */
export function formatRemaining(ms: number): string {
  return clock(Math.ceil(Math.max(0, ms) / 1000));
}

/** Whole seconds as a clock shows them: «4:59», «12:00», «1:05:09». */
function clock(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * The time of a countdown that may run past its end (1.8.0): before it, as `formatRemaining`;
 * then a whole second of «0:00»; then the time past it, «−0:01», «−1:05» (a real minus sign).
 * `left` is signed: ms to the end, negative past it.
 */
export function formatTimer(left: number): string {
  if (left > 0) return formatRemaining(left);
  const past = Math.floor(-left / 1000);
  return past === 0 ? '0:00' : `−${clock(past)}`;
}

/** The end of a countdown of `minutes` from `now` (whole minutes, 1 to 12 h). */
export function untilIn(minutes: number, now: number): number {
  const m = Math.min(MAX_MS / 60000, Math.max(1, Math.round(minutes)));
  return now + m * 60000;
}

/**
 * The end of a countdown «до HH:MM»: later today, however far (09:00 → 22:00); a time already
 * gone today is tomorrow's only within 12 h (23:50 → 00:10). Null: not a time, or a time that
 * has already passed today.
 */
export function untilAt(hhmm: string, now: number): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  if (h > 23 || min > 59) return null;
  const at = new Date(now);
  at.setHours(h, min, 0, 0);
  const today = at.getTime();
  if (today > now) return today;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(h, min, 0, 0);
  const t = tomorrow.getTime();
  return t - now <= MAX_MS ? t : null;
}

/**
 * «+1 хв» / «−1 хв» on a running countdown: never before now, never past a day from now — and
 * the cap never pulls an end below where it already is (a later time today can be over 24 h
 * away on the 25-hour day the clocks go back; review of #45).
 */
export function shiftUntil(until: number, minutes: number, now: number, past = false): number {
  const shifted = until + minutes * 60000;
  // counting past zero (1.8.0), the end may stay behind now: «+1 хв» takes a minute off the
  // time past it, «−1 хв» adds one
  return Math.min(Math.max(now + DAY_MS, until), past ? shifted : Math.max(now, shifted));
}

/**
 * How far the hub's clock — the computer's, which a countdown's end is set by — is ahead of this
 * one (1.7.3, ms): asked at `sent`, answered `hubNow`, received at `received`, with the answer
 * taken as halfway along the round trip. A phone whose own clock is off counts by the
 * computer's this way.
 */
export function hubOffset(sent: number, hubNow: number, received: number): number {
  return hubNow - (sent + received) / 2;
}

/**
 * The time left until `until`, re-read four times a second while it runs; it stops ticking
 * once the countdown has ended (0), and with no countdown (null) it costs nothing. With `past`
 * (1.8.0) it keeps ticking past the end and the time is signed: negative past it.
 */
export function useRemaining(until: number | null | undefined, past = false): number {
  // the reading is kept with the end it was taken for: a new end is read afresh at once, not
  // shown for a frame against the old reading (a restarted countdown flashed a wrong time)
  const [tick, setTick] = useState(() => ({ until, past, now: Date.now() }));
  useEffect(() => {
    if (until == null) {
      // no countdown (hidden, black): the reading is dropped, so the same end coming back is
      // read afresh — not shown for a frame against the time it went away (review of #45)
      setTick((t) => (t.until == null ? t : { until: null, past, now: 0 }));
      return;
    }
    const read = () => {
      const t = Date.now();
      setTick({ until, past, now: t });
      if (t >= until && !past) window.clearInterval(id);
    };
    const id = window.setInterval(read, 250);
    read();
    return () => window.clearInterval(id);
  }, [until, past]);
  if (until == null) return 0;
  const now = tick.until === until && tick.past === past ? tick.now : Date.now();
  return past ? until - now : remainingMs(until, now);
}
