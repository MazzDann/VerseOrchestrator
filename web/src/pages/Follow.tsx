import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api } from '../api';
import { type Slide } from '../presenterBus';
import { connectLive } from '../lib/liveSocket';
import { growTiming } from '../lib/slideFade';
import { useGrownWords } from '../lib/useGrownWords';
import { GrownWords } from '../components/GrownWords';
import {
  DEFAULT_READER,
  READER_SIZES,
  loadReader,
  readerTextStyle,
  saveReader,
  type ReaderPrefs,
} from '../lib/readerPrefs';
import { tr, useLang } from '../i18n';
import { PHONE_THEMES, themeAttr, themeLabel, usePhoneTheme } from '../lib/phoneTheme';
import {
  formatTimer,
  hubOffset,
  lookOf,
  TIMER_FONT_CSS,
  timerColor,
  useCountdown,
} from '../lib/countdown';

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
  // light / dark of its own (1.8.12-beta.8, F1005-04): the phone's, or one chosen here
  const [theme, setTheme] = usePhoneTheme();
  // a picture whose file didn't load (deleted, or a backup's restore moving it): the dots, never
  // a broken-image sign — as on the output windows (SlideCanvas PictureContent); cleared by the
  // next slide
  const [failedPicture, setFailedPicture] = useState<string | null>(null);
  const pictureSrc = slide?.picture ? slide.picture.small || slide.picture.src : '';
  const setPrefs = (patch: Partial<ReaderPrefs>) =>
    setReader((cur) => {
      const next = { ...cur, ...patch };
      saveReader(next);
      return next;
    });

  // how far the computer's clock is ahead of this phone's (1.7.3): «Відлік» counts by it
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let alive = true;
    let socketUp = false;
    // the hub's time: asked on every connect and every few minutes (clocks drift)
    const askClock = () => conn.send({ type: 'clock', t: Date.now() });
    const apply = (v: number, next: unknown, isPaused?: boolean) => {
      if (v === version.current) return;
      version.current = v;
      setSlide((next as Slide | null) ?? null);
      setPaused(isPaused === true);
      // each new slide tries its picture again: a file that failed once (the Wi-Fi, a restore
      // moving it) may be there now — as the output windows do
      setFailedPicture(null);
    };
    // Primary: pushed frames over the live WebSocket (instant).
    const conn = connectLive({
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
        if (alive && f.type === 'clock' && typeof f.t === 'number' && typeof f.now === 'number')
          setOffset(hubOffset(f.t, f.now, Date.now()));
      },
      onStatus: (open) => {
        socketUp = open;
        if (open) askClock();
      },
    });
    const { stop } = conn;
    const clockId = window.setInterval(() => socketUp && askClock(), 5 * 60_000);
    // Fallback: poll only while the socket is down (proxy/firewall without WS support).
    const poll = async () => {
      if (socketUp) return;
      try {
        const sent = Date.now();
        const r = await api.live();
        if (!alive) return;
        if (r.now !== undefined) setOffset(hubOffset(sent, r.now, Date.now()));
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
      window.clearInterval(clockId);
    };
  }, []);

  const showText =
    slide && slide.visible && !slide.blank && !slide.forceBlack && slide.lines.length > 0;
  // «Відлік» (1.5.0): the phones count to the same end as the screen — by the computer's clock
  // (1.7.3): the end, set by that clock, moved onto this phone's
  const onScreen = !!slide && slide.visible && !slide.blank && !slide.forceBlack;
  // past zero (1.8.0): on into −0:01 …, 0:00, or the time goes; paused (1.8.1) it stands
  // still — as the screen does
  const { left, counting: timing } = useCountdown(onScreen ? slide?.countdown : null, offset);
  const phoneLook = lookOf(slide?.countdown);
  // the viewers' countdown in a corner (1.8.7): a small time at the top of the phone too
  const corner = useCountdown(slide && !slide.forceBlack ? slide.cornerCountdown : null, offset);
  const cornerLook = lookOf(slide?.cornerCountdown);
  const font = slide?.style?.font ?? '"Lora", Georgia, serif';
  const text = readerTextStyle(reader, font);
  // the slide change by «Перехід між слайдами» (1.13.0-beta.1): «Наплив» brings new words in, a
  // grown pick only its added verses
  const mode = slide?.style?.transition;
  const words = useGrownWords(
    showText && !slide!.reveal ? slide!.lines.map((l) => l.text) : [],
    slide?.source,
    mode,
  );
  const riseMs = growTiming(mode);

  return (
    // Colours come from .vo-follow (styles.css), which follows the PHONE's own light/dark
    // setting — viewers often read in daylight, where a black page is hard to read.
    <div
      className="vo-follow"
      data-theme={themeAttr(theme)}
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
      {corner.counting && slide?.cornerCountdown && (
        <div
          className={timerColor(slide.cornerCountdown, corner.left) ? 'vo-follow-timer' : undefined}
          style={
            {
              position: 'fixed',
              top: 10,
              right: 12,
              zIndex: 5,
              padding: '2px 10px',
              borderRadius: 8,
              background: 'rgba(127, 127, 127, 0.18)',
              fontSize: 22,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              fontFamily: cornerLook.font === 'mono' ? TIMER_FONT_CSS.mono : undefined,
              '--vo-timer-color': timerColor(slide.cornerCountdown, corner.left),
            } as CSSProperties
          }
        >
          {formatTimer(corner.left, cornerLook.format)}
        </div>
      )}
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
          // the last line ends above the «Aa» button (44 px at the bottom left); the first starts
          // below the corner time while it shows (1.8.7)
          padding: `${corner.counting ? 'max(7vw, 52px)' : '7vw'} 6vw max(7vw, 68px)`,
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
                      }}
                      // «Без анімації» reaches the phones' revealed lines too (1.12.6)
                      className={slide!.style?.transition === 'none' ? undefined : 'vo-follow-line'}
                    >
                      {u}
                    </p>
                  );
                })
              : slide!.lines.map((line, i) => (
                  <p
                    key={`${words.block}-${i}`}
                    dir={line.rtl ? 'rtl' : 'ltr'}
                    className={mode === 'rise' ? 'vo-rise-words' : undefined}
                    style={{
                      margin: 0,
                      ...text,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {slide!.lines.length > 1 && line.translationAbbr && (
                      <span style={{ opacity: 0.45, fontSize: '0.6em', marginRight: '0.5em' }}>
                        {line.translationAbbr}
                        {line.ownRef && ` ${line.approx ? '≈' : ''}${line.ownRef}`}
                      </span>
                    )}
                    {line.exact && line.segments ? (
                      // a song's second part (1.3.0): dimmer, whatever colour the screen gives it
                      line.segments.map((s, j) => (
                        <span key={j} style={s.color || s.soft ? { opacity: 0.6 } : undefined}>
                          {s.text}
                        </span>
                      ))
                    ) : (
                      <GrownWords text={line.text} cut={words.cuts?.[i]} ms={riseMs} />
                    )}
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
        ) : timing && slide?.countdown ? (
          <div
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              lineHeight: 1.15,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* the screen's words, above or below or none (1.8.3) */}
            {phoneLook.captionAt !== 'none' && slide.countdown.caption && (
              <p
                style={{
                  margin: 0,
                  opacity: 0.75,
                  fontSize: 'clamp(18px, 5.5vw, 28px)',
                  order: phoneLook.captionAt === 'below' ? 1 : 0,
                }}
              >
                {slide.countdown.caption}
              </p>
            )}
            <p
              // the screen's warning and past-zero colours (1.8.2), made readable on a phone in
              // light mode (styles.css .vo-follow-timer; review of 1.8.2)
              className={timerColor(slide.countdown, left) ? 'vo-follow-timer' : undefined}
              style={
                {
                  margin: 0,
                  fontSize: 'clamp(48px, 18vw, 120px)',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                  // a monospaced screen font here too; the size is the phone's own (1.8.3)
                  fontFamily: phoneLook.font === 'mono' ? TIMER_FONT_CSS.mono : undefined,
                  '--vo-timer-color': timerColor(slide.countdown, left),
                } as CSSProperties
              }
            >
              {formatTimer(left, phoneLook.format)}
            </p>
          </div>
        ) : slide?.picture &&
          pictureSrc !== failedPicture &&
          slide.visible &&
          !slide.blank &&
          !slide.forceBlack ? (
          // a picture (1.5.0): its small copy — a phone needs no 4K file over the Wi-Fi
          <img
            src={pictureSrc}
            alt={slide.picture.name}
            onError={() => setFailedPicture(pictureSrc)}
            style={{ display: 'block', maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain' }}
          />
        ) : slide?.video && slide.visible && !slide.blank && !slide.forceBlack ? (
          // a video (1.8.12-beta.3): its poster, or words when the operator chose them or the
          // poster isn't there — never the file over the Wi-Fi
          slide.video.phones === 'poster' && slide.video.poster !== failedPicture ? (
            <img
              src={slide.video.poster}
              alt={slide.video.name}
              onError={() => setFailedPicture(slide.video!.poster)}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: '78vh',
                objectFit: 'contain',
              }}
            />
          ) : (
            <div style={{ fontFamily: 'Inter, system-ui, sans-serif', maxWidth: 420 }}>
              <p style={{ margin: 0, fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 600 }}>
                {tr('Відео на екрані')}
              </p>
              <p style={{ margin: '0.6em 0 0', opacity: 0.65, fontSize: 'clamp(14px, 4vw, 17px)' }}>
                {slide.video.name}
              </p>
            </div>
          )
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
          <div className="vo-reader-row" data-stack role="group" aria-label={tr('Тема')}>
            <span className="vo-reader-label">{tr('Тема')}</span>
            {PHONE_THEMES.map((t) => (
              <button
                key={t}
                type="button"
                className="vo-remote-chip"
                aria-pressed={theme === t}
                data-selected={theme === t ? 'true' : undefined}
                onClick={() => setTheme(t)}
              >
                {themeLabel(t)}
              </button>
            ))}
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
              onClick={() => {
                setPrefs(DEFAULT_READER);
                setTheme('auto');
              }}
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
