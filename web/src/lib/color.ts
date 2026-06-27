/** Parse a #rgb / #rrggbb string to [r,g,b] (0–255); null if not a hex colour. */
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');

/**
 * Blend two hex colours: `t` is the weight of `accent` (0 = pure `base`,
 * 1 = pure `accent`). Returns a hex string; falls back to `accent` if either
 * input isn't a hex colour. Used to render words of Jesus / highlighted words as
 * a *tint* of the base text colour toward the chosen accent, rather than a flat
 * separate colour.
 */
export function mixHex(base: string, accent: string, t: number): string {
  const a = parseHex(base);
  const b = parseHex(accent);
  if (!a || !b) return accent;
  const w = Math.max(0, Math.min(1, t));
  const r = a[0] + (b[0] - a[0]) * w;
  const g = a[1] + (b[1] - a[1]) * w;
  const bl = a[2] + (b[2] - a[2]) * w;
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}
