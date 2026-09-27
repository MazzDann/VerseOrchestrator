import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { type Slide } from '../presenterBus';
import { connectLive } from '../lib/liveSocket';

/**
 * Audience follow-along: a read-only, mobile-friendly view of the live slide, pushed
 * over the server's live WebSocket (polling only as a fallback). Phones open this (via
 * the QR in Control) to read the current verse/text on their own screens. Never publishes.
 */
export function Follow() {
  const [slide, setSlide] = useState<Slide | null>(null);
  /** The operator switched follow-along off (or hasn't started it yet). */
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(true);
  const version = useRef(-1);

  useEffect(() => {
    let alive = true;
    let socketUp = false;
    const apply = (v: number, next: unknown, isPaused?: boolean) => {
      if (v === version.current) return;
      version.current = v;
      setSlide((next as Slide | null) ?? null);
      setPaused(isPaused === true);
    };
    // Primary: pushed frames over the live WebSocket (instant).
    const { stop } = connectLive({
      onFrame: (f) => {
        if (!alive) return;
        setConnected(true);
        apply(f.version, f.slide, f.paused);
      },
      onStatus: (open) => {
        socketUp = open;
      },
    });
    // Fallback: poll only while the socket is down (proxy/firewall without WS support).
    const poll = async () => {
      if (socketUp) return;
      try {
        const r = await api.live();
        if (!alive) return;
        setConnected(true);
        apply(r.version, r.slide, r.paused);
      } catch {
        if (alive) setConnected(false);
      }
    };
    void poll();
    const id = window.setInterval(poll, 1500);
    return () => {
      alive = false;
      stop();
      window.clearInterval(id);
    };
  }, []);

  const showText =
    slide && slide.visible && !slide.blank && !slide.forceBlack && slide.lines.length > 0;
  const font = slide?.style?.font ?? '"Lora", Georgia, serif';

  return (
    // Colours come from .vo-follow (styles.css), which follows the PHONE's own light/dark
    // setting — viewers often read in daylight, where a black page is hard to read.
    <div
      className="vo-follow"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--vo-follow-bg)',
        color: 'var(--vo-follow-fg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        WebkitTextSizeAdjust: '100%',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          padding: '7vw 6vw',
          gap: '1.2em',
        }}
      >
        {showText ? (
          <>
            {slide!.reveal
              ? // Mirror progressive reveal so phones build in step with the projector.
                slide!.reveal.units.map((u, i) => {
                  const revealed = i < slide!.reveal!.count;
                  const isCurrent = i === slide!.reveal!.count - 1;
                  const hidden = !revealed && !slide!.reveal!.placeholders;
                  const opacity = revealed
                    ? slide!.reveal!.mode === 'spotlight' && !isCurrent
                      ? 0.4
                      : 1
                    : slide!.reveal!.placeholders
                      ? 0.12
                      : 0;
                  return (
                    <p
                      key={i}
                      style={{
                        margin: 0,
                        fontFamily: font,
                        fontSize: 'clamp(20px, 6.2vw, 40px)',
                        lineHeight: 1.45,
                        whiteSpace: 'pre-line',
                        opacity,
                        visibility: hidden ? 'hidden' : 'visible',
                        transition: 'opacity 0.25s ease',
                      }}
                    >
                      {u}
                    </p>
                  );
                })
              : slide!.lines.map((line, i) => (
                  <p
                    key={i}
                    dir={line.rtl ? 'rtl' : 'ltr'}
                    style={{
                      margin: 0,
                      fontFamily: font,
                      fontSize: 'clamp(20px, 6.2vw, 40px)',
                      lineHeight: 1.45,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {slide!.lines.length > 1 && line.translationAbbr && (
                      <span style={{ opacity: 0.45, fontSize: '0.6em', marginRight: '0.5em' }}>
                        {line.translationAbbr}
                      </span>
                    )}
                    {line.text}
                  </p>
                ))}
            {slide!.subline && (
              <p style={{ margin: 0, opacity: 0.85, fontSize: 'clamp(14px, 4vw, 22px)' }}>
                {slide!.subline}
              </p>
            )}
            {slide!.reference && (
              <p
                style={{
                  margin: 0,
                  opacity: 0.6,
                  letterSpacing: 1,
                  fontSize: 'clamp(13px, 3.6vw, 18px)',
                }}
              >
                {slide!.reference}
              </p>
            )}
          </>
        ) : paused ? (
          <div style={{ fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 420 }}>
            <p style={{ margin: 0, fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 600 }}>
              Трансляцію призупинено
            </p>
            <p style={{ margin: '0.6em 0 0', opacity: 0.65, fontSize: 'clamp(14px, 4vw, 17px)' }}>
              Текст з’явиться тут, щойно оператор її ввімкне. Сторінку можна не закривати.
            </p>
          </div>
        ) : (
          <div style={{ opacity: 0.3, fontSize: 'clamp(22px, 8vw, 44px)', letterSpacing: 6 }}>
            · · ·
          </div>
        )}
      </div>
      {!connected && (
        <div
          style={{
            padding: '8px 0',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--vo-follow-alert)',
            fontFamily: 'Inter, system-ui, sans-serif',
            background: 'var(--vo-follow-alert-bg)',
          }}
        >
          Немає зв’язку з показом. Перепідключаюся…
        </div>
      )}
    </div>
  );
}
