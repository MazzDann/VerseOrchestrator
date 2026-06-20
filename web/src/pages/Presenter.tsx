import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { type Slide, EMPTY_SLIDE, readSlide, subscribeSlide } from '../presenterBus';
import { useAutoFit } from '../useAutoFit';
import { SCRIPTURE_FONT } from '../theme';

export function Presenter() {
  const [slide, setSlide] = useState<Slide>(EMPTY_SLIDE);

  useEffect(() => {
    setSlide(readSlide());
    return subscribeSlide(setSlide);
  }, []);

  const show = slide.visible && !slide.blank && slide.lines.length > 0;
  const slideKey = show
    ? `${slide.reference}|${slide.lines.map((l) => l.text).join('¦')}`
    : 'blank';

  // Auto-fit the whole block (verses + reference) to the screen; re-fit on change.
  const { containerRef, contentRef } = useAutoFit([slideKey]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse at 50% 42%, #0c0c14 0%, #000 78%)',
        color: '#f4f4f6',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4vmin',
        overflow: 'hidden',
        fontFamily: SCRIPTURE_FONT,
      }}
    >
      <AnimatePresence mode="wait">
        {show && (
          <motion.div
            key={slideKey}
            ref={contentRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5em',
              maxWidth: '100%',
              textAlign: 'center',
              lineHeight: 1.25,
            }}
          >
            {slide.lines.map((line, i) => (
              <p
                key={i}
                dir={line.rtl ? 'rtl' : 'ltr'}
                style={{ margin: 0, fontSize: '1em', fontWeight: 500 }}
              >
                {slide.lines.length > 1 && (
                  <span style={{ opacity: 0.45, fontSize: '0.5em', marginRight: '0.6em' }}>
                    {line.translationAbbr}
                  </span>
                )}
                {line.text}
              </p>
            ))}
            <div
              style={{ marginTop: '0.3em', fontSize: '0.42em', opacity: 0.75, letterSpacing: 1 }}
            >
              {slide.reference}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
