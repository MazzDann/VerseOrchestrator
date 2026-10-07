import { useEffect, useMemo, useState } from 'react';
import { formatTimer, lookOf, TIMER_FONT_CSS, timerColor, useCountdown } from '../lib/countdown';
import {
  type Slide,
  type SlideVideo,
  EMPTY_SLIDE,
  readSlide,
  subscribeSlide,
  readNext,
  subscribeNext,
} from '../presenterBus';
import { SlidePreview } from '../components/SlideCanvas';
import { clockOf, positionIn } from '../lib/video';
import { IdentifyOverlay } from '../components/IdentifyOverlay';
import { useAnnounceOutput } from '../lib/outputs';
import { listenFullscreen, toggleOwnFullscreen } from '../lib/fullscreen';
import { outputKeyAction } from '../lib/outputKeys';
import { showsSomething } from '../lib/slide';
import { clockWords, ORDER_CURRENT_KEY, placeWords, STAGE_TEXT_MAX, stageLook } from '../lib/stage';
import { useSettings } from '../settingsStore';
import { playable, usePlaylist } from '../playlistStore';
import { useAutoFit } from '../useAutoFit';
import { tr, useLang } from '../i18n';

/** A video on screen (1.8.12-beta.3): the time left of it, for the speaker. */
function VideoLeft({ video }: { video: SlideVideo }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (video.paused != null) return;
    const t = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(t);
  }, [video.paused, video.at]);
  if (!(video.duration && video.duration > 0) || video.loop) return null;
  const left = video.duration - positionIn(video, video.duration);
  return <> · {tr('відео: ще {time}', { time: clockOf(left) })}</>;
}

/** The running order's item on screen, as the control window in charge writes it (lib/stage.ts). */
function useOrderCurrent(): string | null {
  const read = () => {
    try {
      return localStorage.getItem(ORDER_CURRENT_KEY);
    } catch {
      return null;
    }
  };
  const [id, setId] = useState(read);
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key === ORDER_CURRENT_KEY || e.key === null) setId(read());
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);
  return id;
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** 1 vmin of this window in px — the auto-fit's ceiling follows the window's size. */
function useVmin(): number {
  const read = () => Math.min(window.innerWidth, window.innerHeight) / 100;
  const [vmin, setVmin] = useState(read);
  useEffect(() => {
    const on = () => setVmin(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vmin;
}

/** A slide with words to read («Текст»), not a picture, a video, «Заставка» or the QR slide. */
const hasWords = (s: Slide) => s.lines.length > 0 && !s.picture && !s.video && !s.cover && !s.qr;

/** A slide as the screen shows it, as big as its box allows (no bands above and below). */
function SlideBox({ slide, ring }: { slide: Slide; ring: 'live' | 'cue' }) {
  return (
    <div className="vo-stage-box">
      <div className="vo-stage-slide" data-ring={ring}>
        <SlidePreview slide={slide} />
      </div>
    </div>
  );
}

/**
 * «Текст» (1.9.0-beta.11): the slide's words in a plain large font, fitted to the room — one
 * block per translation (its abbreviation small when there are several). A slide without words
 * to read shows as it is.
 */
function StageWords({
  slide,
  maxPx,
  dim = false,
  ring,
  empty,
}: {
  slide: Slide;
  maxPx: number;
  dim?: boolean;
  ring: 'live' | 'cue';
  /** what an empty slide says instead */
  empty: string;
}) {
  const key = slide.lines.map((l) => l.text).join('\n');
  const { containerRef, contentRef } = useAutoFit([key, maxPx], 8, Math.max(8, Math.round(maxPx)));
  // nothing on screen (or nothing next): a quiet line, not an empty black slide in a red ring
  if (!showsSomething(slide) && !slide.blank && !slide.forceBlack)
    return <div className="vo-stage-none">{empty}</div>;
  if (!hasWords(slide)) return <SlideBox slide={slide} ring={ring} />;
  const several = slide.lines.length > 1;
  return (
    <div ref={containerRef} className="vo-stage-words" data-dim={dim ? 'true' : undefined}>
      <div ref={contentRef}>
        {slide.lines.map((l, i) => (
          <p key={i} dir={l.rtl ? 'rtl' : undefined}>
            {several && l.translationAbbr && (
              <span className="vo-stage-abbr">{l.translationAbbr}</span>
            )}
            {l.text}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * Stage display — the speaker's window (1.9.0-beta.11 «Сцена», F1005-09): what is on screen and
 * what «Далі» shows — as large plain words («Текст») or as the slides («Мініатюри») —, where it
 * is in the chapter / song, the clock, the speaker's timer (1.8.4), the operator's message to
 * the speaker, and the running order. A read-only mirror of the live / next channels; its own
 * settings come from the store (lib/stage.ts). Never publishes.
 */
export function Stage() {
  useLang();
  const [slide, setSlide] = useState<Slide>(EMPTY_SLIDE);
  const [next, setNext] = useState<Slide | null>(null);
  const now = useNow();
  const vmin = useVmin();
  const look = stageLook(useSettings((s) => s.appearance));
  // items of a newer version (1.9.1) don't go on screen: not on the strip either
  const items = usePlaylist((s) => s.items);
  const order = useMemo(() => items.filter(playable), [items]);
  const currentId = useOrderCurrent();
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
      if (outputKeyAction(e) === 'fullscreen') toggleOwnFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // «Заставка» and the viewers' QR slide are on screen too, though they have no lines (1.4.1)
  const onAir = showsSomething(slide);
  const hidden = slide.forceBlack ? tr('Чорний екран') : slide.blank ? tr('Текст сховано') : null;
  const reference = onAir || hidden ? slide.reference || tr('На екрані') : tr('Порожньо');
  const place = look.showPlace ? placeWords(slide.source) : '';
  const message = slide.stageMessage ?? null;
  const textMax = STAGE_TEXT_MAX[look.textSize] * vmin;
  // the running order: the item on screen and the two after it
  const at = order.findIndex((i) => i.id === currentId);
  const coming = look.showOrder ? order.slice(Math.max(0, at), Math.max(0, at) + 3) : [];

  const timerBlock = timing && timer && (
    <div className="vo-stage-timer">
      <div className="vo-stage-label">
        {tr('Таймер')}
        {paused ? ` · ${tr('пауза')}` : ''}
      </div>
      <div
        className="vo-stage-time"
        style={{
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
  );
  const nextLabel = (
    <div className="vo-stage-label">
      {tr('Далі')}
      {next?.reference ? ` · ${next.reference}` : ''}
    </div>
  );
  const nothingNext = <div className="vo-stage-none">{tr('Нічого немає')}</div>;
  // nothing next and no timer: the bottom row shrinks to its label, the words get the room
  const bottomEmpty = !next && !timerBlock;

  return (
    <div
      className="vo-stage"
      data-theme={look.theme}
      role="button"
      tabIndex={0}
      aria-label={tr('Перемкнути повний екран')}
      onClick={toggleOwnFullscreen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleOwnFullscreen();
        }
      }}
    >
      <header className="vo-stage-head">
        <div className="vo-stage-now-line">
          <span className="vo-stage-dot" data-on={onAir && !hidden ? 'true' : undefined} />
          <span className="vo-stage-ref">{reference}</span>
          {hidden && <span className="vo-stage-badge">{hidden}</span>}
          {place && <span className="vo-stage-place">{place}</span>}
          {slide.video && (
            <span className="vo-stage-place">
              <VideoLeft video={slide.video} />
            </span>
          )}
        </div>
        <span className="vo-stage-clock">{clockWords(now, look.clockSeconds)}</span>
      </header>

      {message && (
        // a new message (its time) pulses once; reduced motion keeps it still (styles.css)
        <div key={message.at} className="vo-stage-message" role="status">
          {message.text}
        </div>
      )}

      {look.layout === 'text' ? (
        <main className="vo-stage-main" data-layout="text">
          <section className="vo-stage-current" aria-label={tr('Зараз')}>
            <StageWords
              slide={slide}
              maxPx={textMax}
              dim={!!hidden}
              ring="live"
              empty={tr('На екрані нічого немає')}
            />
          </section>
          {(look.showNext || timerBlock) && (
            <div className="vo-stage-bottom" data-empty={bottomEmpty ? 'true' : undefined}>
              {look.showNext && (
                <section className="vo-stage-next" aria-label={tr('Далі')}>
                  {nextLabel}
                  {next ? (
                    <StageWords
                      slide={next}
                      maxPx={textMax * 0.5}
                      ring="cue"
                      empty={tr('Нічого немає')}
                    />
                  ) : (
                    nothingNext
                  )}
                </section>
              )}
              {timerBlock}
            </div>
          )}
        </main>
      ) : (
        <main className="vo-stage-main" data-layout="slides">
          <section className="vo-stage-current" aria-label={tr('Зараз')}>
            <div className="vo-stage-label">{tr('Зараз')}</div>
            <SlideBox slide={slide} ring="live" />
          </section>
          <aside className="vo-stage-side">
            {look.showNext && (
              <section className="vo-stage-next" aria-label={tr('Далі')}>
                {nextLabel}
                {next ? <SlideBox slide={next} ring="cue" /> : nothingNext}
              </section>
            )}
            {timerBlock}
          </aside>
        </main>
      )}

      {coming.length > 0 && (
        <footer className="vo-stage-order" aria-label={tr('Послідовність показу')}>
          {coming.map((it, i) => (
            <span key={it.id} data-current={it.id === currentId ? 'true' : undefined}>
              {it.id === currentId ? '▶ ' : i > 0 ? '· ' : ''}
              {it.label}
            </span>
          ))}
        </footer>
      )}
      <IdentifyOverlay label={identify} />
    </div>
  );
}
