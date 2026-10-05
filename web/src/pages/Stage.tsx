import { useEffect, useState } from 'react';
import { formatTimer, lookOf, TIMER_FONT_CSS, timerColor, useCountdown } from '../lib/countdown';
import {
  type Slide,
  EMPTY_SLIDE,
  readSlide,
  subscribeSlide,
  readNext,
  subscribeNext,
} from '../presenterBus';
import { SlidePreview } from '../components/SlideCanvas';
import { IdentifyOverlay } from '../components/IdentifyOverlay';
import { useAnnounceOutput } from '../lib/outputs';
import { listenFullscreen, toggleOwnFullscreen } from '../lib/fullscreen';
import { outputKeyAction } from '../lib/outputKeys';
import { showsSomething } from '../lib/slide';
import { tr, useLang } from '../i18n';

/** Two-digit clock parts. */
function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}

/** Fullscreen needs a user gesture in this window — or one lent by the control window. */
const toggleFullscreen = toggleOwnFullscreen;

/**
 * Stage display — a confidence monitor for the operator/speaker: the slide that
 * is live now (large), what advancing once would project (next), and a clock.
 * Read-only mirror of the live/next channels; never publishes. A speaker's timer (1.8.4,
 * «Таймер доповідача») comes with the slide and shows only here, under «ДАЛІ».
 */
export function Stage() {
  useLang();
  const [slide, setSlide] = useState<Slide>(EMPTY_SLIDE);
  const [next, setNext] = useState<Slide | null>(null);
  const clock = useClock();
  // the speaker's timer (1.8.4): counts, holds or goes past zero, pauses — as «Відлік» does
  const timer = slide.stageTimer ?? null;
  const { left, counting: timing, paused } = useCountdown(timer);
  const timerLook = lookOf(timer);
  // Tell the control window this output exists (its «Вікна виводу» list).
  const identify = useAnnounceOutput('stage');

  useEffect(() => {
    setSlide(readSlide());
    setNext(readNext());
    const offSlide = subscribeSlide(setSlide);
    const offNext = subscribeNext(setNext);
    return () => {
      offSlide();
      offNext();
    };
  }, []);

  // Like the presenter window (Mac test, 0.5.6): fullscreen needs a user gesture, so
  // «F» or a click anywhere toggles it once the window sits on its screen.
  useEffect(() => listenFullscreen(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // by the physical key, as in the presentation window (1.4.1): F types «а» in Ukrainian
      if (outputKeyAction(e) === 'fullscreen') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // «Заставка» and the viewers' QR slide are on screen too, though they have no lines (1.4.1:
  // the header read «Порожньо» over them, the dot grey); they carry their own reference
  const onAir = showsSomething(slide);
  const liveLabel = slide.forceBlack
    ? tr('Чорний екран')
    : slide.blank
      ? tr('Текст сховано')
      : onAir
        ? slide.reference || tr('На екрані')
        : tr('Порожньо');

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={tr('Перемкнути повний екран')}
      onClick={toggleFullscreen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleFullscreen();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0a0f',
        color: '#f4f4f6',
        fontFamily: 'Inter, system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        padding: '2.2vmin',
        gap: '1.6vmin',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.4vmin', minWidth: 0 }}>
          <span
            style={{
              width: '1.5vmin',
              height: '1.5vmin',
              borderRadius: '50%',
              flexShrink: 0,
              background: onAir ? '#37b24d' : '#5c5f66',
              boxShadow: onAir ? '0 0 12px #37b24d' : 'none',
            }}
          />
          <span style={{ fontSize: '2.6vmin', fontWeight: 700, letterSpacing: 1 }}>
            {tr('НА ЕКРАНІ')}
          </span>
          <span
            style={{
              fontSize: '2.6vmin',
              opacity: 0.75,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            · {liveLabel}
          </span>
        </div>
        <span
          style={{
            fontSize: '5vmin',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: 2,
          }}
        >
          {clock}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '2vmin' }}>
        <div
          style={{
            flex: '1 1 64%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '1vmin',
          }}
        >
          <div style={{ fontSize: '2vmin', fontWeight: 600, opacity: 0.55, letterSpacing: 2 }}>
            {tr('ЗАРАЗ')}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center' }}>
            {/* Tally ring: red = what the audience sees now. */}
            <div
              style={{
                width: '100%',
                borderRadius: 8,
                boxShadow: '0 0 0 3px var(--mantine-color-live-filled)',
              }}
            >
              <SlidePreview slide={slide} />
            </div>
          </div>
        </div>
        <div
          style={{
            flex: '1 1 36%',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '1vmin',
          }}
        >
          <div style={{ fontSize: '2vmin', fontWeight: 600, opacity: 0.55, letterSpacing: 2 }}>
            {tr('ДАЛІ')}
            {next?.reference ? ` · ${next.reference}` : ''}
          </div>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-start' }}>
            {next ? (
              <div
                style={{
                  width: '100%',
                  opacity: 0.85,
                  borderRadius: 8,
                  // amber = queued next (same tally as the control window)
                  boxShadow: '0 0 0 3px var(--mantine-color-cue-filled)',
                }}
              >
                <SlidePreview slide={next} />
              </div>
            ) : (
              <div
                style={{
                  width: '100%',
                  aspectRatio: '16 / 9',
                  borderRadius: 8,
                  border: '1px dashed #2c2e33',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#5c5f66',
                  fontSize: '2vmin',
                }}
              >
                {tr('— кінець / немає наступного —')}
              </div>
            )}
          </div>
          {timing && timer && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6vmin' }}>
              <div style={{ fontSize: '2vmin', fontWeight: 600, opacity: 0.55, letterSpacing: 2 }}>
                {tr('ТАЙМЕР')}
                {paused ? ` · ${tr('ПАУЗА')}` : ''}
              </div>
              <div
                style={{
                  fontSize: '13vmin',
                  lineHeight: 1,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                  // «Як у тексті»: the slides' font, as on «Показ» (review of 1.8.6)
                  fontFamily:
                    timerLook.font === 'text' ? slide.style?.font : TIMER_FONT_CSS[timerLook.font],
                  color: timerColor(timer, left),
                  opacity: paused ? 0.7 : 1,
                }}
              >
                {formatTimer(left, timerLook.format)}
              </div>
            </div>
          )}
        </div>
      </div>
      <IdentifyOverlay label={identify} />
    </div>
  );
}
