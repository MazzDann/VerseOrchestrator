import { type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { type Slide, type SlideLine, type SlideStyle, DEFAULT_STYLE } from '../presenterBus';
import { useAutoFit } from '../useAutoFit';

const ALIGN_ITEMS = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;

/** The verse line(s) with red-letter / highlighted-word colouring — shared by both layouts. */
function QuoteLines({ lines, style }: { lines: SlideLine[]; style: SlideStyle }) {
  return (
    <>
      {lines.map((line, i) => (
        <p
          key={i}
          dir={line.rtl ? 'rtl' : 'ltr'}
          style={{
            margin: 0,
            fontSize: '1em',
            fontWeight: style.bold ? 700 : 500,
            whiteSpace: 'pre-line',
          }}
        >
          {lines.length > 1 && (
            <span style={{ opacity: 0.5, fontSize: '0.5em', marginRight: '0.6em' }}>
              {line.translationAbbr}
            </span>
          )}
          {line.segments
            ? line.segments.map((s, j) => (
                <span
                  key={j}
                  style={{
                    color: s.hot
                      ? (style.highlightColor ?? '#ffd43b')
                      : s.jesus && style.redLetter
                        ? (style.jesusColor ?? '#ff6b6b')
                        : undefined,
                    fontWeight: s.hot ? 700 : undefined,
                  }}
                >
                  {s.text}
                  {j < line.segments!.length - 1 ? ' ' : ''}
                </span>
              ))
            : line.text}
        </p>
      ))}
    </>
  );
}

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
 *
 * Two layouts: the default centred stack, and (when `slide.template` is set) a
 * positioned template — each object placed in % of the slide so preview ≡ presenter.
 */
export function SlideCanvas({ slide }: { slide: Slide }) {
  const style = slide.style ?? DEFAULT_STYLE;
  const show = slide.visible && !slide.blank && slide.lines.length > 0;
  const slideKey = show
    ? `${slide.reference}|${slide.subline ?? ''}|${slide.lines.map((l) => l.text).join('¦')}`
    : 'blank';
  const { containerRef, contentRef } = useAutoFit([slideKey, style.font, style.align]);

  // Pure-black override: paint solid black over everything, ignoring the
  // background image/colour (the operator's "force black" key/button).
  if (slide.forceBlack) {
    return <div style={{ position: 'absolute', inset: 0, background: '#000' }} />;
  }

  const background = style.bgImage
    ? `center / cover no-repeat url(${JSON.stringify(style.bgImage)})`
    : style.bgColor === '#000000'
      ? 'radial-gradient(ellipse at 50% 42%, #0c0c14 0%, #000 78%)'
      : style.bgColor;

  const rootStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    background,
    color: style.color,
    overflow: 'hidden',
    fontFamily: style.font,
    // Enable cqh units so template objects size their fonts to the slide height.
    containerType: 'size',
  };
  const scrim = style.bgImage ? (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
  ) : null;

  // --- Positioned template layout ---------------------------------------------
  const template = slide.template;
  if (template) {
    return (
      <div style={rootStyle}>
        {scrim}
        <AnimatePresence mode="wait">
          {show && (
            <motion.div
              key={slideKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                inset: 0,
                textShadow: style.bgImage ? '0 2px 12px rgba(0,0,0,0.6)' : 'none',
              }}
            >
              {template.objects.map((o, i) => {
                if (!o.visible) return null;
                if (o.kind === 'subline' && !slide.subline) return null;
                if (o.kind === 'divider') {
                  if (o.tiedToSubline && !slide.subline) return null;
                  return (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        left: `${o.x}%`,
                        top: `${o.y}%`,
                        width: `${o.w}%`,
                        height: `${Math.max(o.h, 0.2)}%`,
                        background: o.color ?? 'currentColor',
                        opacity: 0.4,
                        borderRadius: 2,
                      }}
                    />
                  );
                }
                const box: CSSProperties = {
                  position: 'absolute',
                  left: `${o.x}%`,
                  top: `${o.y}%`,
                  width: `${o.w}%`,
                  height: `${o.h}%`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: ALIGN_ITEMS[o.align],
                  textAlign: o.align,
                  color: o.color,
                  overflow: 'hidden',
                  lineHeight: 1.25,
                };
                if (o.kind === 'quote') {
                  return (
                    <div key={i} ref={containerRef} style={box}>
                      <div ref={contentRef} style={{ maxWidth: '100%', textAlign: o.align }}>
                        <QuoteLines lines={slide.lines} style={style} />
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={i}
                    style={{
                      ...box,
                      fontSize: `${o.size}cqh`,
                      opacity: o.kind === 'reference' ? 0.85 : 0.95,
                      letterSpacing: o.kind === 'reference' ? 1 : undefined,
                    }}
                  >
                    {o.kind === 'reference' ? slide.reference : slide.subline}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // --- Default centred layout (legacy; proportional inset) ---------------------
  const u = style.padUnit ?? '%';
  const vPad = (n: number | undefined) => (u === '%' ? (n ?? 4) : (n ?? 0) / 10.8);
  const hPad = (n: number | undefined) => (u === '%' ? (n ?? 4) : (n ?? 0) / 19.2);
  const inset = {
    top: vPad(style.padTop),
    bottom: vPad(style.padBottom),
    left: hPad(style.padLeft),
    right: hPad(style.padRight),
  };

  return (
    <div style={rootStyle}>
      {scrim}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: `${inset.top}%`,
          right: `${inset.right}%`,
          bottom: `${inset.bottom}%`,
          left: `${inset.left}%`,
          display: 'flex',
          alignItems: ALIGN_ITEMS[style.align],
          justifyContent: 'center',
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
              <QuoteLines lines={slide.lines} style={style} />
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
                  <div
                    style={{ width: '34%', borderTop: '1px solid currentColor', opacity: 0.3 }}
                  />
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
    </div>
  );
}
