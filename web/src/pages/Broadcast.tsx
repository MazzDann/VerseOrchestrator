import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DEFAULT_STYLE, EMPTY_SLIDE, readSlide, subscribeSlide, type Slide } from '../presenterBus';
import { isSlide } from '../lib/bus';
import { connectLive } from '../lib/liveSocket';
import { aspectBox } from '../lib/aspect';
import { wordsOf } from '../lib/broadcast';
import { listenFullscreen, toggleOwnFullscreen } from '../lib/fullscreen';
import { useWakeLock } from '../lib/wakeLock';
import { QuoteLines, SlideCanvas } from '../components/SlideCanvas';
import { SlideFade } from '../components/SlideFade';
import { useAutoFit } from '../useAutoFit';
import { sanitizeBroadcast, useSettings, type BroadcastLook } from '../settingsStore';
import { tr, useLang } from '../i18n';

/** After a bus message the hub's copy of the same slide (a moment later, without images) waits. */
const BUS_FIRST_MS = 2000;

/** The key colours: a broadcast green for a chroma key, black for a luma key. */
const KEY_BG: Record<BroadcastLook['bg'], string> = {
  transparent: 'transparent',
  green: '#00b140',
  black: '#000',
};

/**
 * «Трансляція» (1.14.0-beta.3, the author's answer «обидва фони»): the text over a live camera.
 * As OBS / vMix's browser source by its address — transparent, the slides from the hub (this
 * computer only), the look in the address's query, OBS having none of this browser's settings —
 * or as a window on a screen that goes to a keyer over HDMI, green or black, from the window bus.
 * «Нижня третина» draws the words in a band at the bottom; «Як на показі» the whole slide. Only
 * words go into the lower third: a picture, a video, «Заставка» or the QR slide leave it empty.
 */
export function Broadcast() {
  useLang();
  const stored = useSettings((s) => s.outputs.broadcast);
  const aspect = useSettings((s) => s.outputs.aspect);
  const query = new URLSearchParams(window.location.search);
  const look =
    query.has('bg') || query.has('look') || query.has('band')
      ? sanitizeBroadcast({
          look: query.get('look'),
          bg: query.get('bg'),
          band: query.get('band') !== '0',
        })
      : stored;
  const [slide, setSlide] = useState<Slide>(EMPTY_SLIDE);
  // a window of this browser hears the bus first; the hub serves a page the bus doesn't reach (OBS)
  // — and this one too once its bus went quiet (its control window now in another browser; review)
  const busAt = useRef(0);
  useWakeLock();

  useEffect(() => {
    setSlide(readSlide());
    return subscribeSlide((s) => {
      busAt.current = Date.now();
      setSlide(s);
    });
  }, []);
  useEffect(() => {
    const conn = connectLive({
      hello: { role: 'key' },
      onMessage: (f) => {
        if (f.type !== 'slides' || Date.now() - busAt.current < BUS_FIRST_MS) return;
        setSlide(isSlide(f.live) ? f.live : EMPTY_SLIDE);
      },
      stopOn: (f) => f.type === 'denied',
    });
    return conn.stop;
  }, []);
  // OBS composes what isn't drawn: nothing behind the words at all
  useEffect(() => {
    const els = [document.documentElement, document.body];
    const before = els.map((e) => e.style.background);
    for (const e of els) e.style.background = KEY_BG[look.bg];
    return () => els.forEach((e, i) => (e.style.background = before[i]));
  }, [look.bg]);
  useEffect(() => listenFullscreen(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey) toggleOwnFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    document.title = `VerseOrchestrator — ${tr('Трансляція')}`;
  }, []);

  return (
    <div
      onDoubleClick={toggleOwnFullscreen}
      style={{ position: 'fixed', inset: 0, background: KEY_BG[look.bg], cursor: 'none' }}
    >
      <div style={{ ...aspectBox(aspect), containerType: 'size' }}>
        {look.look === 'full' ? (
          <SlideCanvas slide={keyed(slide)} />
        ) : (
          <LowerThird slide={slide} band={look.band} />
        )}
      </div>
    </div>
  );
}

/** The whole slide over the key colour: its own background and picture behind the words go. */
function keyed(slide: Slide): Slide {
  const style = slide.style ?? DEFAULT_STYLE;
  return { ...slide, style: { ...style, bgColor: 'transparent', bgImage: null } };
}

/**
 * The words in a band at the bottom third: fitted to it, the slide's font and colour, its
 * reference small under them; slide changes by «Перехід між слайдами».
 */
function LowerThird({ slide, band }: { slide: Slide; band: boolean }) {
  const style = slide.style ?? DEFAULT_STYLE;
  const show = wordsOf(slide);
  const key = show ? `${slide.reference}|${slide.lines.map((l) => l.text).join('¦')}` : null;
  const { containerRef, contentRef } = useAutoFit([key, style.font], 8, 160);
  const box: CSSProperties = {
    position: 'absolute',
    left: '5%',
    right: '5%',
    bottom: '6%',
    height: '27%',
    padding: '2.2cqh 2.5cqw',
    borderRadius: '1.4cqh',
    background: band && show ? 'rgba(0, 0, 0, 0.62)' : 'transparent',
    transition: 'background 0.2s',
  };
  return (
    <div style={box}>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <SlideFade
          slideKey={key}
          mode={style.transition}
          layerRef={contentRef}
          style={{
            fontFamily: style.font,
            color: style.color,
            textAlign: style.align,
            lineHeight: 1.25,
            maxWidth: '100%',
            // without a band the words carry their own edge, for any picture under them
            textShadow: band ? 'none' : '0 0 0.12em #000, 0 0.06em 0.3em rgba(0, 0, 0, 0.85)',
          }}
        >
          <QuoteLines lines={slide.lines} style={style} />
          {slide.reference && (
            <div style={{ fontSize: '0.5em', opacity: 0.8, marginTop: '0.25em', letterSpacing: 1 }}>
              {slide.reference}
            </div>
          )}
        </SlideFade>
      </div>
    </div>
  );
}
