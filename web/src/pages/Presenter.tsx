import { useEffect, useState } from 'react';
import { type Slide, EMPTY_SLIDE, readSlide, subscribeSlide } from '../presenterBus';
import { SlideCanvas } from '../components/SlideCanvas';

export function Presenter() {
  const [slide, setSlide] = useState<Slide>(EMPTY_SLIDE);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    setSlide(readSlide());
    return subscribeSlide(setSlide);
  }, []);

  // The browser only grants fullscreen from a user gesture, so we can't do it on
  // window.open — toggle it on a click anywhere or the "F" key instead.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => setHint(false), 4500);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Перемкнути повний екран"
      onClick={toggleFullscreen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleFullscreen();
        }
      }}
      style={{ position: 'fixed', inset: 0, background: '#000' }}
    >
      <SlideCanvas slide={slide} />
      {hint && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 14px',
            borderRadius: 999,
            background: 'rgba(0,0,0,0.55)',
            color: 'rgba(255,255,255,0.85)',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 13,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          Клік або «F» — на весь екран
        </div>
      )}
    </div>
  );
}
