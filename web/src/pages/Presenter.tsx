import { useEffect, useState } from 'react';
import { type Slide, EMPTY_SLIDE, readSlide, subscribeSlide, sendCommand } from '../presenterBus';
import { SlideCanvas } from '../components/SlideCanvas';
import { IdentifyOverlay } from '../components/IdentifyOverlay';
import { useAnnounceOutput } from '../lib/outputs';
import { listenFullscreen, toggleOwnFullscreen } from '../lib/fullscreen';
import { tr, useLang } from '../i18n';

/** Fullscreen needs a user gesture in this window — or one lent by the control window. */
const toggleFullscreen = toggleOwnFullscreen;

export function Presenter() {
  useLang();
  const [slide, setSlide] = useState<Slide>(EMPTY_SLIDE);
  const [hint, setHint] = useState(true);
  // Hide the cursor over the projected image when the mouse sits idle.
  const [cursorHidden, setCursorHidden] = useState(false);
  // Tell the control window this output exists (its «Вікна виводу» list).
  const identify = useAnnounceOutput('presenter');

  useEffect(() => {
    setSlide(readSlide());
    return subscribeSlide(setSlide);
  }, []);

  // The browser only grants fullscreen from a user gesture, so we can't do it on
  // window.open — toggle it on a click anywhere or the "F" key instead.
  // The control window can lend its click («На весь екран», open-fullscreen option).
  useEffect(() => listenFullscreen(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
        return;
      }
      // Forward show-navigation keys to the control window so a clicker/keyboard
      // drives the selection even when this window holds focus on the 2nd monitor.
      const cmd =
        e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown'
          ? 'next'
          : e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp'
            ? 'prev'
            : e.key === '.'
              ? 'black'
              : null;
      if (cmd) {
        e.preventDefault();
        sendCommand(cmd);
      }
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => setHint(false), 4500);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, []);

  // Auto-hide the cursor after a few idle seconds; any movement brings it back.
  useEffect(() => {
    let idle: number;
    const wake = () => {
      setCursorHidden(false);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => setCursorHidden(true), 2500);
    };
    window.addEventListener('mousemove', wake);
    wake();
    return () => {
      window.removeEventListener('mousemove', wake);
      window.clearTimeout(idle);
    };
  }, []);

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
        background: '#000',
        cursor: cursorHidden ? 'none' : 'auto',
      }}
    >
      <SlideCanvas slide={slide} />
      <IdentifyOverlay label={identify} />
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
          {tr('Клік або «F» — на весь екран · ← → гортають слайди')}
        </div>
      )}
    </div>
  );
}
