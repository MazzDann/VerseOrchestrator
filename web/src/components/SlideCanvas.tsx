import { AnimatePresence, motion } from 'framer-motion';
import { type Slide, DEFAULT_STYLE } from '../presenterBus';
import { useAutoFit } from '../useAutoFit';

const ALIGN_ITEMS = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

/** A 16:9 WYSIWYG preview box of the slide (identical look to the presenter). */
export function SlidePreview({ slide, maxWidth }: { slide: Slide; maxWidth?: number }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth,
        aspectRatio: '16 / 9',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid var(--mantine-color-default-border)',
        background: '#000',
        marginInline: maxWidth ? 'auto' : undefined,
      }}
    >
      <SlideCanvas slide={slide} />
    </div>
  );
}

/**
 * Renders a slide exactly like the presenter screen — same background, font,
 * colour, alignment and auto-fit. Fills its (positioned) parent, so it works
 * full-screen in the presenter window and as a scaled WYSIWYG preview.
 */
export function SlideCanvas({ slide }: { slide: Slide }) {
  const style = slide.style ?? DEFAULT_STYLE;
  const show = slide.visible && !slide.blank && slide.lines.length > 0;
  const slideKey = show
    ? `${slide.reference}|${slide.subline ?? ''}|${slide.lines.map((l) => l.text).join('¦')}`
    : 'blank';
  const { containerRef, contentRef } = useAutoFit([slideKey, style.font, style.align]);

  const background = style.bgImage
    ? `center / cover no-repeat url(${JSON.stringify(style.bgImage)})`
    : style.bgColor === '#000000'
      ? 'radial-gradient(ellipse at 50% 42%, #0c0c14 0%, #000 78%)'
      : style.bgColor;

  const u = style.padUnit ?? '%';
  const padding = `${style.padTop ?? 4}${u} ${style.padRight ?? 4}${u} ${style.padBottom ?? 4}${u} ${style.padLeft ?? 4}${u}`;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        background,
        color: style.color,
        display: 'flex',
        alignItems: ALIGN_ITEMS[style.align],
        justifyContent: 'center',
        padding,
        overflow: 'hidden',
        fontFamily: style.font,
      }}
    >
      {style.bgImage && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      )}
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
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: ALIGN_ITEMS[style.align],
              justifyContent: 'center',
              gap: '0.5em',
              maxWidth: '100%',
              textAlign: style.align,
              lineHeight: 1.3,
              textShadow: style.bgImage ? '0 2px 12px rgba(0,0,0,0.6)' : 'none',
            }}
          >
            {slide.lines.map((line, i) => (
              <p
                key={i}
                dir={line.rtl ? 'rtl' : 'ltr'}
                style={{ margin: 0, fontSize: '1em', fontWeight: 500 }}
              >
                {slide.lines.length > 1 && (
                  <span style={{ opacity: 0.5, fontSize: '0.5em', marginRight: '0.6em' }}>
                    {line.translationAbbr}
                  </span>
                )}
                {line.text}
              </p>
            ))}
            {slide.subline && (
              <div
                style={{
                  marginTop: '0.35em',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.3em',
                  maxWidth: '100%',
                }}
              >
                <div style={{ width: '34%', borderTop: '1px solid currentColor', opacity: 0.3 }} />
                <div style={{ fontSize: '0.55em', opacity: 0.92, textAlign: style.align }}>
                  {slide.subline}
                </div>
              </div>
            )}
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
