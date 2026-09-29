/** Ukrainian plural: 1 телефон, 2–4 телефони, 5+ телефонів (11–14 → телефонів). */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}
