import { useMemo } from 'react';
import QRCode from 'qrcode';

/** Modules of quiet zone drawn inside the SVG; the card's white padding adds the rest. */
const MARGIN = 2;

/** A QR as a single SVG path (one unit square per dark module), crisp at any size. */
function QrSvg({ text, size }: { text: string; size: string }) {
  const { d, n } = useMemo(() => {
    const m = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
    let path = '';
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) if (m.get(y, x)) path += `M${x} ${y}h1v1h-1z`;
    }
    return { d: path, n: m.size };
  }, [text]);
  return (
    <svg
      viewBox={`${-MARGIN} ${-MARGIN} ${n + 2 * MARGIN} ${n + 2 * MARGIN}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden
      style={{ display: 'block' }}
    >
      <path d={d} fill="#000" />
    </svg>
  );
}

/**
 * The viewers' QR on an output (1.5.16): a white card — the QR's quiet zone — so it scans
 * over a photo, a colour or black alike. Sized in cqh (the slide root is a size container),
 * so it scales with the output window. `full` is the slide «QR на екран» puts up; `corner`
 * the small card on every slide while «QR у кутку екрана» is on.
 */
export function QrCard({ url, variant }: { url: string; variant: 'full' | 'corner' }) {
  const full = variant === 'full';
  return (
    <div
      data-qr-card={variant}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: full ? '2cqh' : '0.6cqh',
        padding: full ? '3cqh 4cqh' : '1.2cqh',
        background: '#fff',
        color: '#16161a',
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
      <QrSvg text={url} size={full ? '52cqh' : '17cqh'} />
      <div style={{ fontSize: full ? '2.8cqh' : '1.7cqh', fontWeight: 600, opacity: 0.85 }}>
        {full ? 'Відскануйте камерою телефона — та сама мережа Wi-Fi' : 'Текст на телефоні'}
      </div>
      {full && (
        <div style={{ fontSize: '2.3cqh', opacity: 0.6 }}>{url.replace(/^https?:\/\//, '')}</div>
      )}
    </div>
  );
}
