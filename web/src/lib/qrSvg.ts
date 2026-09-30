import QRCode from 'qrcode';
import type { QrStyle } from '../presenterBus';

/** Modules of quiet zone drawn inside the SVG; the card's white padding adds the rest. */
const MARGIN = 2;
/** The QR's ink (the card's text too). */
export const QR_INK = '#16161a';

/** Top-left corners of the three finder patterns («eyes») of an n×n symbol. */
const eyes = (n: number): [number, number][] => [
  [0, 0],
  [n - 7, 0],
  [0, n - 7],
];
const inEye = (n: number, x: number, y: number) =>
  eyes(n).some(([ex, ey]) => x >= ex && x < ex + 7 && y >= ey && y < ey + 7);

/** Numbers in the SVG without float noise (0.44 stays 0.44, not 0.44000000000000006). */
const num = (v: number) => String(Math.round(v * 100) / 100);

/**
 * A QR as SVG markup, crisp at any size. `square`: every dark module a unit square (one path).
 * `rounded` / `dots` (0.6.20, the operator asked for some styling): data modules as rounded
 * squares or dots and the three eyes as a rounded ring + a rounded centre — at error-correction
 * Q, so the softer shapes still scan. Its own white background, quiet zone included.
 */
export function qrSvgMarkup(text: string, look: QrStyle): string {
  const m = QRCode.create(text, { errorCorrectionLevel: look === 'square' ? 'M' : 'Q' }).modules;
  const n = m.size;
  let body: string;
  if (look === 'square') {
    let d = '';
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) if (m.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
    body = `<path d="${d}"/>`;
  } else {
    const cells: string[] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!m.get(y, x) || inEye(n, x, y)) continue;
        cells.push(
          look === 'dots'
            ? `<circle cx="${num(x + 0.5)}" cy="${num(y + 0.5)}" r="0.44"/>`
            : `<rect x="${num(x + 0.06)}" y="${num(y + 0.06)}" width="0.88" height="0.88" rx="0.3"/>`,
        );
      }
    }
    const ring = look === 'dots' ? 2.2 : 1.6;
    const dot = look === 'dots' ? 1.5 : 0.9;
    for (const [ex, ey] of eyes(n)) {
      cells.push(
        `<rect x="${ex + 0.5}" y="${ey + 0.5}" width="6" height="6" rx="${ring}" fill="none" stroke="${QR_INK}" stroke-width="1"/>`,
        `<rect x="${ex + 2}" y="${ey + 2}" width="3" height="3" rx="${dot}"/>`,
      );
    }
    body = cells.join('');
  }
  const side = n + 2 * MARGIN;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-MARGIN} ${-MARGIN} ${side} ${side}"` +
    ` shape-rendering="${look === 'square' ? 'crispEdges' : 'geometricPrecision'}">` +
    `<rect x="${-MARGIN}" y="${-MARGIN}" width="${side}" height="${side}" fill="#fff"/>` +
    `<g fill="${QR_INK}">${body}</g></svg>`
  );
}
