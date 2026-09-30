import { Component, type CSSProperties, type ReactNode } from 'react';
import {
  type Slide,
  type SlideLine,
  type SlideStyle,
  type SlideReveal,
  DEFAULT_STYLE,
} from '../presenterBus';
import { useAutoFit } from '../useAutoFit';
import { mixHex } from '../lib/color';
import { SlideFade } from './SlideFade';
import { QrCard } from './QrCard';
import { reportSlideError } from '../lib/slideErrors';

const ALIGN_ITEMS = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;
const VALIGN_ITEMS = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const;

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
                    // Words of Jesus / highlighted words render as a *tint* of the
                    // base text colour toward the chosen accent, not a flat colour.
                    color: s.hot
                      ? mixHex(style.color, style.highlightColor ?? '#ffd43b', 0.55)
                      : s.jesus && style.redLetter
                        ? mixHex(style.color, style.jesusColor ?? '#ff6b6b', 0.5)
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

/**
 * Progressive-reveal rendering: each unit is its own line. Unrevealed units always
 * occupy their space (so the font/layout never jumps as you reveal) — invisible by
 * default, faint when `placeholders` is on. In spotlight mode only the last revealed
 * unit stays bright.
 */
function RevealLines({ reveal, style }: { reveal: SlideReveal; style: SlideStyle }) {
  return (
    <>
      {reveal.units.map((u, i) => {
        const revealed = i < reveal.count;
        const isCurrent = i === reveal.count - 1;
        const hidden = !revealed && !reveal.placeholders;
        const opacity = revealed
          ? reveal.mode === 'spotlight' && !isCurrent
            ? 0.4
            : 1
          : reveal.placeholders
            ? 0.12
            : 0;
        return (
          <p
            key={i}
            style={{
              margin: 0,
              fontSize: '1em',
              fontWeight: style.bold ? 700 : 500,
              whiteSpace: 'pre-line',
              opacity,
              visibility: hidden ? 'hidden' : 'visible',
              transition: 'opacity 0.25s ease',
            }}
          >
            {u}
          </p>
        );
      })}
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

const BLACK = <div style={{ position: 'absolute', inset: 0, background: '#000' }} />;

interface GuardProps {
  slide: Slide;
  /** what to show while `slide` can't be drawn — given the last slide that could */
  fallback: (lastGood: Slide | null) => ReactNode;
  children: ReactNode;
}

interface GuardState {
  slide: Slide;
  failed: boolean;
}

/**
 * A slide that fails to draw — a malformed slide from another window, an old stored copy
 * after an update — must not take its window with it: React unmounts the whole page on an
 * uncaught render error, and the projector shows a white window. The guard shows
 * `fallback` instead, reports the error (lib/slideErrors.ts) and tries again with the next
 * slide (0.13.0).
 */
class SlideGuard extends Component<GuardProps, GuardState> {
  state: GuardState = { slide: this.props.slide, failed: false };
  private lastGood: Slide | null = null;

  static getDerivedStateFromProps(
    props: GuardProps,
    state: GuardState,
  ): Partial<GuardState> | null {
    return props.slide !== state.slide ? { slide: props.slide, failed: false } : null;
  }

  static getDerivedStateFromError(): Partial<GuardState> {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    reportSlideError(error);
  }

  componentDidMount(): void {
    this.remember();
  }

  componentDidUpdate(): void {
    this.remember();
  }

  private remember(): void {
    if (!this.state.failed) this.lastGood = this.props.slide;
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback(this.lastGood) : this.props.children;
  }
}

/**
 * Renders a slide exactly like the presenter screen — same background, font,
 * colour, alignment and auto-fit. Fills its (positioned) parent, so it works
 * full-screen in the presenter window and as a scaled WYSIWYG preview.
 *
 * A slide that can't be drawn leaves the last one that could on screen, and if even that
 * fails, black — never an empty white window (0.13.0). The inner guard shows the last good
 * slide; an error while drawing it again goes up to the outer guard.
 */
export function SlideCanvas({ slide }: { slide: Slide }) {
  return (
    <SlideGuard slide={slide} fallback={() => BLACK}>
      <SlideGuard slide={slide} fallback={(last) => (last ? <DrawnSlide slide={last} /> : BLACK)}>
        <DrawnSlide slide={slide} />
      </SlideGuard>
    </SlideGuard>
  );
}

/**
 * The drawing itself. Two layouts: the default centred stack, and (when `slide.template`
 * is set) a positioned template — each object placed in % of the slide so preview ≡
 * presenter.
 */
function DrawnSlide({ slide }: { slide: Slide }) {
  const style = slide.style ?? DEFAULT_STYLE;
  const show = slide.visible && !slide.blank && (slide.lines.length > 0 || !!slide.qr);
  const slideKey = !show
    ? 'blank'
    : slide.qr
      ? `qr|${slide.qr}`
      : `${slide.reference}|${slide.subline ?? ''}|${slide.lines.map((l) => l.text).join('¦')}`;
  // the viewers' QR in a corner (0.6.16) — over any slide but the QR slide itself
  const corner =
    style.qrCorner && !slide.qr ? (
      <QrCard url={style.qrCorner} variant="corner" look={style.qrStyle} />
    ) : null;
  // …and the content keeps out of its band (0.6.19: long text ran under the card). The
  // card is 17cqh of QR + padding + caption ≈ 22cqh tall, 2.5cqh off the bottom: keep the
  // lowest 26 % of the slide free; the text auto-fits the rest, centred as before.
  const qrBand = corner ? 26 : 0;
  // A faithful pptx song's quote carries the original font size (cqh); cap the
  // auto-fit at it so stanzas render "as made" and only shrink when too long.
  const quoteMaxCqh = slide.template?.objects.find((o) => o.kind === 'quote')?.size ?? 0;
  const { containerRef, contentRef } = useAutoFit(
    [slideKey, style.font, style.align],
    6,
    240,
    quoteMaxCqh > 0 ? quoteMaxCqh : undefined,
  );

  // Pure-black override: paint solid black over everything, ignoring the
  // background image/colour (the operator's "force black" key/button).
  if (slide.forceBlack) return BLACK;

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
  const template = slide.qr ? null : slide.template;
  if (template) {
    return (
      <div style={rootStyle}>
        {scrim}
        <SlideFade
          slideKey={show ? slideKey : null}
          mode={style.transition}
          style={{
            position: 'absolute',
            inset: 0,
            // font and colour belong to the slide: a leaving slide keeps its own
            fontFamily: style.font,
            color: style.color,
            textShadow: style.bgImage ? '0 2px 12px rgba(0,0,0,0.6)' : 'none',
          }}
        >
          {template.objects.map((o, i) => {
            if (!o.visible) return null;
            if (o.kind === 'subline' && !slide.subline) return null;
            // Clamp geometry to the slide so a box taller/wider than the screen
            // (some .pptx text boxes extend past the slide — e.g. h ≈ 119%) can't
            // push the auto-fit content off the visible area.
            const cx = Math.max(0, Math.min(100, o.x));
            const cy = Math.max(0, Math.min(100, o.y));
            const cw = Math.max(0, Math.min(100 - cx, o.w));
            const ch = Math.max(0, Math.min(100 - qrBand - cy, o.h));
            if (o.kind === 'divider') {
              if (o.tiedToSubline && !slide.subline) return null;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: `${cx}%`,
                    top: `${cy}%`,
                    width: `${cw}%`,
                    height: `${Math.max(ch, 0.2)}%`,
                    background: o.color ?? 'currentColor',
                    opacity: 0.4,
                    borderRadius: 2,
                  }}
                />
              );
            }
            const box: CSSProperties = {
              position: 'absolute',
              left: `${cx}%`,
              top: `${cy}%`,
              width: `${cw}%`,
              height: `${ch}%`,
              display: 'flex',
              alignItems: VALIGN_ITEMS[o.valign ?? 'middle'],
              justifyContent: ALIGN_ITEMS[o.align],
              textAlign: o.align,
              color: o.color,
              overflow: 'hidden',
              lineHeight: 1.25,
            };
            if (o.kind === 'quote') {
              // Auto-fit the box, capped at the original font size for faithful
              // songs (see `quoteMaxCqh` above) so the look matches the pptx.
              return (
                <div key={i} ref={containerRef} style={box}>
                  <div ref={contentRef} style={{ maxWidth: '100%', textAlign: o.align }}>
                    {slide.reveal ? (
                      <RevealLines reveal={slide.reveal} style={style} />
                    ) : (
                      <QuoteLines lines={slide.lines} style={style} />
                    )}
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
                  // a faithful song's second box keeps its lines (a title slide's authors)
                  whiteSpace: 'pre-line',
                }}
              >
                {o.kind === 'reference' ? slide.reference : slide.subline}
              </div>
            );
          })}
        </SlideFade>
        {corner}
      </div>
    );
  }

  // --- Default centred layout (legacy; proportional inset) ---------------------
  const u = style.padUnit ?? '%';
  const vPad = (n: number | undefined) => (u === '%' ? (n ?? 4) : (n ?? 0) / 10.8);
  const hPad = (n: number | undefined) => (u === '%' ? (n ?? 4) : (n ?? 0) / 19.2);
  const inset = {
    top: vPad(style.padTop),
    bottom: Math.max(vPad(style.padBottom), qrBand),
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
        <SlideFade
          slideKey={show ? slideKey : null}
          mode={style.transition}
          layerRef={contentRef}
          style={{
            position: 'relative',
            fontFamily: style.font,
            color: style.color,
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
          {slide.qr ? (
            <QrCard url={slide.qr} variant="full" look={style.qrStyle} />
          ) : slide.reveal ? (
            <RevealLines reveal={slide.reveal} style={style} />
          ) : (
            <QuoteLines lines={slide.lines} style={style} />
          )}
          {!slide.qr && slide.subline && (
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
          {!slide.qr && (
            <div
              style={{ marginTop: '0.3em', fontSize: '0.42em', opacity: 0.75, letterSpacing: 1 }}
            >
              {slide.reference}
            </div>
          )}
        </SlideFade>
      </div>
      {corner}
    </div>
  );
}
