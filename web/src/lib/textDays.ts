/**
 * «Історія за датами» (1.22.0-beta.3, users' F1107-18): the own texts shown, by the day they went
 * on screen — today, yesterday, a date; the ones kept before the dates were (no `at`) — earlier.
 */
export type DayKey = 'today' | 'yesterday' | 'earlier' | `day:${string}`;

const midnight = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** The day group of a moment, in local time, against `now`. */
export function dayKey(at: number | undefined, now: number): DayKey {
  if (!at || !Number.isFinite(at)) return 'earlier';
  const day = midnight(at);
  const today = midnight(now);
  if (day >= today) return 'today';
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (day >= y.getTime()) return 'yesterday';
  const d = new Date(at);
  return `day:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Items in their day groups, in the list's own order (newest first). */
export function dayGroups<T extends { at?: number }>(
  items: readonly T[],
  now: number,
): { key: DayKey; items: T[] }[] {
  const out: { key: DayKey; items: T[] }[] = [];
  for (const it of items) {
    const key = dayKey(it.at, now);
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(it);
    else out.push({ key, items: [it] });
  }
  return out;
}
