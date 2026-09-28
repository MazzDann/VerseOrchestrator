import { useMemo } from 'react';
import QRCode from 'qrcode';
import type { QrStyle } from '../presenterBus';

/** Modules of quiet zone drawn inside the SVG; the card's white padding adds the rest. */
const MARGIN = 2;
const INK = '#16161a';

/** Top-left corners of the three finder patterns («eyes») of an n×n symbol. */
const eyes = (n: number): [number, number][] => [
  [0, 0],
  [n - 7, 0],
  [0, n - 7],
];
const inEye = (n: number, x: number, y: number) =>
  eyes(n).some(([ex, ey]) => x >= ex && x < ex + 7 && y >= ey && y < ey + 7);

/**
 * A QR as SVG, crisp at any size. `square`: every dark module a unit square (one path).
 * `rounded` / `dots` (1.5.20, the operator asked for some styling): data modules as
 * rounded squares or dots and the three eyes as a rounded ring + a rounded centre — at
 * error-correction Q, so the softer shapes still scan.
 */
function QrSvg({ text, size, look }: { text: string; size: string; look: QrStyle }) {
  const svg = useMemo(() => {
    const m = QRCode.create(text, { errorCorrectionLevel: look === 'square' ? 'M' : 'Q' }).modules;
    const n = m.size;
    if (look === 'square') {
      let d = '';
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) if (m.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
      return { n, body: <path d={d} fill={INK} /> };
    }
    const cells: JSX.Element[] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!m.get(y, x) || inEye(n, x, y)) continue;
        cells.push(
          look === 'dots' ? (
            <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r={0.44} />
          ) : (
            <rect key={`${x}-${y}`} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} rx={0.3} />
          ),
        );
      }
    }
    const eyeShapes = eyes(n).map(([ex, ey]) => (
      <g key={`eye-${ex}-${ey}`}>
        <rect
          x={ex + 0.5}
          y={ey + 0.5}
          width={6}
          height={6}
          rx={look === 'dots' ? 2.2 : 1.6}
          fill="none"
          stroke={INK}
          strokeWidth={1}
        />
        <rect x={ex + 2} y={ey + 2} width={3} height={3} rx={look === 'dots' ? 1.5 : 0.9} />
      </g>
    ));
    return {
      n,
      body: (
        <g fill={INK}>
          {cells}
          {eyeShapes}
        </g>
      ),
    };
  }, [text, look]);
  return (
    <svg
      viewBox={`${-MARGIN} ${-MARGIN} ${svg.n + 2 * MARGIN} ${svg.n + 2 * MARGIN}`}
      width={size}
      height={size}
      shapeRendering={look === 'square' ? 'crispEdges' : 'geometricPrecision'}
      aria-hidden
      style={{ display: 'block' }}
    >
      {svg.body}
    </svg>
  );
}

/**
 * The viewers' QR on an output (1.5.16): a white card — the QR's quiet zone — so it scans
 * over a photo, a colour or black alike. Sized in cqh (the slide root is a size container),
 * so it scales with the output window. `full` is the slide «QR на екран» puts up; `corner`
 * the small card on every slide while «QR у кутку екрана» is on.
 */
export function QrCard({
  url,
  variant,
  look = 'square',
}: {
  url: string;
  variant: 'full' | 'corner';
  look?: QrStyle;
}) {
  const full = variant === 'full';
  return (
    <div
      data-qr-card={variant}
      data-qr-look={look}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: full ? '2cqh' : '0.6cqh',
        padding: full ? '3cqh 4cqh' : '1.2cqh',
        background: '#fff',
        color: INK,
        borderRadius: full ? '2.4cqh' : '1.2cqh',
        boxShadow: '0 1cqh 4cqh rgba(0, 0, 0, 0.35)',
        fontFamily: 'Inter, system-ui, sans-serif',
        textAlign: 'center',
        lineHeight: 1.25,
        textShadow: 'none',
        ...(full ? {} : { position: 'absolute', right: '2.5cqh', bottom: '2.5cqh', zIndex: 2 }),
      }}
    >
      {full && <div style={{ fontSize: '4.6cqh', fontWeight: 700 }}>Читайте з телефона</div>}
      <QrSvg text={url} size={full ? '52cqh' : '17cqh'} look={look} />
      <div style={{ fontSize: full ? '2.8cqh' : '1.7cqh', fontWeight: 600, opacity: 0.85 }}>
        {full ? 'Відскануйте камерою телефона — та сама мережа Wi-Fi' : 'Текст на телефоні'}
      </div>
      {full && (
        <div style={{ fontSize: '2.3cqh', opacity: 0.6 }}>{url.replace(/^https?:\/\//, '')}</div>
      )}
    </div>
  );
}
