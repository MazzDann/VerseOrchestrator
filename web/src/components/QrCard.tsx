import { useMemo } from 'react';
import type { QrStyle } from '../presenterBus';
import { tr, useLang } from '../i18n';
import { QR_INK, qrSvgMarkup } from '../lib/qrSvg';

/**
 * The QR as an image, not inline SVG: dark-mode extensions (Dark Reader and the like) recolour
 * a page's SVG fills and backgrounds — the ink went dark on a dark card and the eyes light,
 * and phones couldn't read it. An image they leave as it is.
 */
function QrImage({ text, size, look }: { text: string; size: string; look: QrStyle }) {
  const src = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvgMarkup(text, look))}`,
    [text, look],
  );
  return <img src={src} alt="" style={{ display: 'block', width: size, height: size }} />;
}

/**
 * The viewers' QR on an output (0.6.16): a white card — the QR's quiet zone — so it scans
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
  useLang();
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
        color: QR_INK,
        borderRadius: full ? '2.4cqh' : '1.2cqh',
        boxShadow: '0 1cqh 4cqh rgba(0, 0, 0, 0.35)',
        fontFamily: 'Inter, system-ui, sans-serif',
        textAlign: 'center',
        lineHeight: 1.25,
        textShadow: 'none',
        ...(full ? {} : { position: 'absolute', right: '2.5cqh', bottom: '2.5cqh', zIndex: 2 }),
      }}
    >
      {full && (
        <div style={{ fontSize: '4.6cqh', fontWeight: 700 }}>{tr('Читайте з телефона')}</div>
      )}
      <QrImage text={url} size={full ? '52cqh' : '17cqh'} look={look} />
      <div style={{ fontSize: full ? '2.8cqh' : '1.7cqh', fontWeight: 600, opacity: 0.85 }}>
        {full ? tr('Відскануйте камерою телефона — та сама мережа Wi-Fi') : tr('Текст на телефоні')}
      </div>
      {full && (
        <div style={{ fontSize: '2.3cqh', opacity: 0.6 }}>{url.replace(/^https?:\/\//, '')}</div>
      )}
    </div>
  );
}
