import { useEffect, useState } from 'react';

/**
 * «Відлік» (1.5.0): «Починаємо за 4:59» under «Заставка» before a show. The slide carries the
 * moment it ends (`until`, ms since the epoch), not the time left: an output window that opens
 * mid-way, a phone that joins late or a control window that takes over all count to the same
 * end. Windows of one computer share its clock; a phone uses its own — off by the second or two
 * its network time allows.
 */

/** Minutes offered as one click; anything else goes through «до» a time of day. */
export const COUNTDOWN_MINUTES = [1, 3, 5, 10, 15, 30] as const;

/** The longest countdown it starts (12 h): past that, a time of day was meant for tomorrow. */
const MAX_MS = 12 * 60 * 60 * 1000;

/** Milliseconds left until `until` (0 once it has passed). */
export function remainingMs(until: number, now: number): number {
  return Math.max(0, until - now);
}

/**
 * The time left as a clock shows it: «4:59», «12:00», «1:05:09». Rounded up, so it reads
 * «5:00» right after the start and «0:01» in its last second — never «0:00» while it runs.
 */
export function formatRemaining(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** The end of a countdown of `minutes` from `now` (whole minutes, 1 to 12 h). */
export function untilIn(minutes: number, now: number): number {
  const m = Math.min(MAX_MS / 60000, Math.max(1, Math.round(minutes)));
  return now + m * 60000;
}

/**
 * The end of a countdown «до HH:MM» — the next time the clock shows it, at most 12 h away
 * (23:50 → 00:10 is tomorrow). Null: not a time, or a time that has already passed today.
 */
export function untilAt(hhmm: string, now: number): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  if (h > 23 || min > 59) return null;
  const at = new Date(now);
  at.setHours(h, min, 0, 0);
  let t = at.getTime();
  if (t <= now) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(h, min, 0, 0);
    t = tomorrow.getTime();
  }
  return t - now <= MAX_MS ? t : null;
}

/** «+1 хв» / «−1 хв» on a running countdown: never before now, never past 12 h from now. */
export function shiftUntil(until: number, minutes: number, now: number): number {
  return Math.min(now + MAX_MS, Math.max(now, until + minutes * 60000));
}

/**
 * The time left until `until`, re-read four times a second while it runs; it stops ticking
 * once the countdown has ended (0), and with no countdown (null) it costs nothing.
 */
export function useRemaining(until: number | null | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until == null) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= until) window.clearInterval(id);
    };
    const id = window.setInterval(tick, 250);
    tick();
    return () => window.clearInterval(id);
  }, [until]);
  return until == null ? 0 : remainingMs(until, now);
}
