import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { type Slide } from '../presenterBus';
import { connectLive } from '../lib/liveSocket';
import {
  DEFAULT_READER,
  READER_SIZES,
  loadReader,
  readerTextStyle,
  saveReader,
  type ReaderPrefs,
} from '../lib/readerPrefs';
import { tr, useLang } from '../i18n';

/**
 * Audience follow-along: a read-only, mobile-friendly view of the live slide, pushed
 * over the server's live WebSocket (polling only as a fallback). Phones open this (via
 * the QR in Control) to read the current verse/text on their own screens. Never publishes.
 */
export function Follow() {
  useLang();
  const [slide, setSlide] = useState<Slide | null>(null);
  /** The operator switched follow-along off (or hasn't started it yet). */
  const [paused, setPaused] = useState(false);
  const [connected, setConnected] = useState(true);
  /** The operator switched the app off («Вимкнути повністю», 0.7.1) — not a blip. */
  const [off, setOff] = useState(false);
  const version = useRef(-1);
  // how THIS phone likes to read (0.6.17): kept in its own browser, nothing is sent
  const [reader, setReader] = useState<ReaderPrefs>(loadReader);
  const [readerOpen, setReaderOpen] = useState(false);
  const setPrefs = (patch: Partial<ReaderPrefs>) =>
    setReader((cur) => {
      const next = { ...cur, ...patch };
      saveReader(next);
      return next;
    });

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
        setOff(false);
        apply(f.version, f.slide, f.paused);
      },
      onMessage: (f) => {
        if (alive && f.type === 'shutdown') {
          setOff(true);
          setConnected(false);
        }
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
        setOff(false);
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
  const text = readerTextStyle(reader, font);

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
      {!connected && (
        // at the top: the bottom row belongs to «Aa» and the caption
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
          {off
            ? tr('Показ завершено: застосунок вимкнено.')
            : tr('Немає зв’язку з показом. Перепідключаюся…')}
        </div>
      )}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: reader.easy ? 'stretch' : 'center',
          textAlign: reader.easy ? 'left' : 'center',
          // the last line ends above the «Aa» button (44 px at the bottom left)
          padding: '7vw 6vw max(7vw, 68px)',
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
                        ...text,
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
                      ...text,
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
              <p
                style={{
                  margin: 0,
                  opacity: 0.85,
                  fontSize: 'clamp(14px, 4vw, 22px)',
                  whiteSpace: 'pre-line', // a song title slide's authors: one per line
                }}
              >
                {slide!.subline}
              </p>
            )}
          </>
        ) : paused ? (
          <div style={{ fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 420 }}>
            <p style={{ margin: 0, fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 600 }}>
              {tr('Трансляцію призупинено')}
            </p>
            <p style={{ margin: '0.6em 0 0', opacity: 0.65, fontSize: 'clamp(14px, 4vw, 17px)' }}>
              {tr('Текст з’явиться тут, щойно оператор її ввімкне. Сторінку можна не закривати.')}
            </p>
          </div>
        ) : (
          <div style={{ opacity: 0.3, fontSize: 'clamp(22px, 8vw, 44px)', letterSpacing: 6 }}>
            · · ·
          </div>
        )}
      </div>
      {showText && slide!.reference && (
        // what is being read sits apart from the text, next to «Aa» (0.6.22): under the
        // last line a weak eye took it for one more line of the verse or stanza
        <p className="vo-follow-ref">{slide!.reference}</p>
      )}
      <button
        type="button"
        className="vo-reader-btn"
        aria-label={tr('Налаштування тексту')}
        aria-expanded={readerOpen}
        onClick={() => setReaderOpen((o) => !o)}
      >
        Aa
      </button>
      {readerOpen && (
        <div className="vo-reader-sheet" role="dialog" aria-label={tr('Налаштування тексту')}>
          <div className="vo-reader-row">
            <span className="vo-reader-label">{tr('Розмір')}</span>
            <button
              type="button"
              className="vo-remote-chip"
              aria-label={tr('Менший текст')}
              disabled={reader.size === 0}
              onClick={() => setPrefs({ size: reader.size - 1 })}
            >
              A−
            </button>
            <span className="vo-reader-steps" aria-hidden>
              {READER_SIZES.map((_, i) => (
                <span key={i} data-on={i <= reader.size ? 'true' : undefined} />
              ))}
            </span>
            <button
              type="button"
              className="vo-remote-chip"
              aria-label={tr('Більший текст')}
              disabled={reader.size === READER_SIZES.length - 1}
              onClick={() => setPrefs({ size: reader.size + 1 })}
            >
              A+
            </button>
          </div>
          <div className="vo-reader-row">
            <button
              type="button"
              className="vo-remote-chip"
              aria-pressed={reader.bold}
              data-selected={reader.bold ? 'true' : undefined}
              onClick={() => setPrefs({ bold: !reader.bold })}
            >
              {tr('Жирніше')}
            </button>
            <button
              type="button"
              className="vo-remote-chip"
              aria-pressed={reader.easy}
              data-selected={reader.easy ? 'true' : undefined}
              onClick={() => setPrefs({ easy: !reader.easy })}
            >
              {tr('Легше читати')}
            </button>
          </div>
          <p className="vo-reader-hint">
            {tr(
              '«Легше читати» — шрифт Andika, ширші проміжки, текст ліворуч (зручніше при дислексії). Зберігається лише на цьому телефоні.',
            )}
          </p>
          <div className="vo-reader-row">
            <button
              type="button"
              className="vo-remote-chip"
              onClick={() => setPrefs(DEFAULT_READER)}
            >
              {tr('Скинути')}
            </button>
            <button
              type="button"
              className="vo-remote-chip"
              data-selected="true"
              onClick={() => setReaderOpen(false)}
            >
              {tr('Готово')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
