import { Component, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  type Slide,
  type SlideLine,
  type SlideStyle,
  type SlideReveal,
  type SlideCover,
  type SlideCountdown,
  type SlidePicture,
  DEFAULT_STYLE,
} from '../presenterBus';
import {
  formatTimer,
  lookOf,
  TIMER_FONT_CSS,
  TIMER_SIZE_EM,
  timerColor,
  useCountdown,
} from '../lib/countdown';
import { useAutoFit } from '../useAutoFit';
import { mixHex } from '../lib/color';
import { SlideFade } from './SlideFade';
import { QrCard } from './QrCard';
import { reportSlideError } from '../lib/slideErrors';

const ALIGN_ITEMS = { left: 'flex-start', center: 'center', right: 'flex-end' } as const;
/** The cover's text at full size, in cqh — the 1.4.0 look; a longer one fits below it. */
const COVER_TEXT_CQH = 7;
/**
 * How far a small logo may grow (1.4.1): to twice its own pixels on a 1920-wide slide, where
 * 1 cqw is 19.2 px — so a file N px wide gets at most N / 9.6 cqw, the same share on every
 * screen. From 768 px on it fills the 80 % box; a smaller file stays smaller instead of going
 * soft (1.4.0 kept a small file as it was, and stored every logo at 800 px at most).
 */
const LOGO_PX_PER_CQW = 9.6;
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
                    // base text colour toward the chosen accent, not a flat colour. A song's
                    // second part (1.3.0) takes the file's colour, or goes dimmer.
                    color:
                      s.color ??
                      (s.hot
                        ? mixHex(style.color, style.highlightColor ?? '#ffd43b', 0.55)
                        : s.jesus && style.redLetter
                          ? mixHex(style.color, style.jesusColor ?? '#ff6b6b', 0.5)
                          : undefined),
                    fontWeight: s.hot ? 700 : undefined,
                    opacity: s.soft ? 0.6 : undefined,
                  }}
                >
                  {s.text}
                  {!line.exact && j < line.segments!.length - 1 ? ' ' : ''}
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
function RevealLines({
  reveal,
  style,
  calm,
}: {
  reveal: SlideReveal;
  style: SlideStyle;
  calm?: boolean;
}) {
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
              transition: calm ? undefined : 'opacity 0.25s ease',
            }}
          >
            {u}
          </p>
        );
      })}
    </>
  );
}

/**
 * «Заставка» (1.4.0): the operator's logo over its line of text. Sized to the slide (1.4.1), so
 * the preview, the stage display and every output show the same proportions — 1.4.0 drew the
 * logo at its pixel size: a different share of every screen, soft on a Retina one. The logo
 * fills 80 % of the slide's width, as tall as its shape asks but at most 50 % of the height
 * under text (70 % alone), its shape kept. The sizes follow the em of the auto-fitted layer,
 * capped at the 1.4.0 size (7 cqh text, `DrawnSlide`): a long text shrinks with the logo
 * instead of running off the slide. A small file grows at most twice (`LOGO_PX_PER_CQW`). The
 * logo loading after the fit ran asks for a refit.
 */
function CoverContent({
  cover,
  countdown,
  onImageLoad,
}: {
  cover: SlideCover;
  countdown?: SlideCountdown | null;
  onImageLoad: () => void;
}) {
  // the file's width in pixels, known once it has loaded: how far it may grow
  const [pixels, setPixels] = useState(0);
  // past zero (1.8.0) the time counts on (−0:01 …) or stays at 0:00 — or goes, as before;
  // paused (1.8.1) it stands still
  const { left, counting } = useCountdown(countdown);
  const look = lookOf(countdown);
  const shown = counting ? formatTimer(left, look.format).length : 0;
  // the time coming or going changes the content's height: fit it again (the slide's key
  // changes when a countdown starts or goes, not when one ends on screen)
  const refit = useRef(onImageLoad);
  refit.current = onImageLoad;
  useEffect(
    () => refit.current(),
    [counting, look.size, look.font, look.format, look.captionAt, shown],
  );
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.57em', // ≈ 4 cqh
        maxWidth: '100%',
        textAlign: 'center',
      }}
    >
      {cover.image && (
        <img
          src={cover.image}
          alt=""
          onLoad={(e) => {
            setPixels(e.currentTarget.naturalWidth);
            onImageLoad();
          }}
          style={{
            display: 'block',
            width: '80cqw',
            maxWidth:
              pixels > 0 ? `min(100%, ${+(pixels / LOGO_PX_PER_CQW).toFixed(2)}cqw)` : '100%',
            height: 'auto',
            // 50 / 70 cqh at the full size (the fit's whole pixels put 1em a little under
            // 7 cqh: the em bound alone came out up to 5 % smaller in a small preview); less
            // as the fit shrinks the text
            // a running countdown («Відлік», 1.5.0) takes room under it
            maxHeight: counting
              ? cover.text
                ? 'min(32cqh, 4.8em)'
                : 'min(42cqh, 6.3em)'
              : cover.text
                ? 'min(50cqh, 7.5em)'
                : 'min(70cqh, 10.5em)',
            objectFit: 'contain',
          }}
        />
      )}
      {cover.text && <div style={{ lineHeight: 1.25, whiteSpace: 'pre-line' }}>{cover.text}</div>}
      {counting && countdown && <CountdownLines countdown={countdown} left={left} />}
    </div>
  );
}

/**
 * «Відлік» (1.5.0): the words over a big time left; equal-width digits, so the line holds still
 * as it counts. Past the end (1.8.0, «Після нуля») the time counts on as −0:01 …, stays at 0:00,
 * or both go and «Заставка» stays (`CoverContent`). The time alone takes the warning colour
 * before the end and the other one past it (1.8.2); the words keep the slide's. Its size, font,
 * how it is written and where the words go come with the countdown too (1.8.3, `lookOf`).
 */
function CountdownLines({ countdown, left }: { countdown: SlideCountdown; left: number }) {
  // its look (1.8.3): size, font, how the time is written, where the words go
  const look = lookOf(countdown);
  const words = look.captionAt !== 'none' && countdown.caption && (
    <div style={{ fontSize: '0.8em', opacity: 0.85 }}>{countdown.caption}</div>
  );
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        lineHeight: 1.1,
      }}
    >
      {look.captionAt === 'above' && words}
      <div
        style={{
          fontSize: `${TIMER_SIZE_EM[look.size]}em`,
          fontFamily: TIMER_FONT_CSS[look.font],
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
          color: timerColor(countdown, left),
        }}
      >
        {formatTimer(left, look.format)}
      </div>
      {look.captionAt === 'below' && words}
    </div>
  );
}

/**
 * A picture on screen (1.5.0): the server's file over the whole slide. One that doesn't load
 * (deleted meanwhile, the server gone) leaves the black of the slide, never a broken-image sign.
 */
function PictureContent({ picture }: { picture: SlidePicture }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (failed === picture.src) return null;
  return (
    <img
      src={picture.src}
      alt=""
      onError={() => setFailed(picture.src)}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: picture.fit === 'cover' ? 'cover' : 'contain',
      }}
    />
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
 *
 * `calm` (1.2.1): no animation between slides or revealed lines, whatever the slide's own
 * transition — for the operator's monitors when the system asks for less motion. The output
 * windows keep the transition the operator chose for the audience.
 */
export function SlideCanvas({ slide, calm }: { slide: Slide; calm?: boolean }) {
  return (
    <SlideGuard slide={slide} fallback={() => BLACK}>
      <SlideGuard
        slide={slide}
        fallback={(last) => (last ? <DrawnSlide slide={last} calm={calm} /> : BLACK)}
      >
        <DrawnSlide slide={slide} calm={calm} />
      </SlideGuard>
    </SlideGuard>
  );
}

/**
 * The drawing itself. Two layouts: the default centred stack, and (when `slide.template`
 * is set) a positioned template — each object placed in % of the slide so preview ≡
 * presenter.
 */
function DrawnSlide({ slide, calm }: { slide: Slide; calm?: boolean }) {
  const style = slide.style ?? DEFAULT_STYLE;
  const transition = calm ? 'none' : style.transition;
  const show =
    slide.visible &&
    !slide.blank &&
    (slide.lines.length > 0 || !!slide.qr || !!slide.cover || !!slide.picture);
  const slideKey = !show
    ? 'blank'
    : slide.picture
      ? `picture|${slide.picture.src}|${slide.picture.fit}`
      : slide.qr
        ? `qr|${slide.qr}`
        : slide.cover
          ? // a countdown starting or going fades like a new slide; «+1 хв» only changes the time
            `cover|${slide.cover.text}|${slide.cover.image?.length ?? 0}|${slide.cover.image?.slice(-24) ?? ''}|${slide.countdown ? slide.countdown.caption : '-'}`
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
  // «Заставка» (1.4.1) fits too, never past its 1.4.0 size: text 7 cqh (CoverContent)
  const maxCqh = slide.cover ? COVER_TEXT_CQH : quoteMaxCqh > 0 ? quoteMaxCqh : undefined;
  const { containerRef, contentRef, refit } = useAutoFit(
    [slideKey, style.font, style.align],
    6,
    240,
    maxCqh,
  );
  // A picture is drawn in the layout of the last text slide: the text layer leaving for it keeps
  // its place and fades out — a layout switch unmounted it at once (review of #46: a faithful
  // song's stanza or a «Макет» preset cut to the picture)
  const ownTemplate = slide.qr || slide.cover || slide.picture ? null : (slide.template ?? null);
  const lastTemplate = useRef(ownTemplate);
  if (!slide.picture) lastTemplate.current = ownTemplate;

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

  // A picture («Зображення», 1.5.0): its own layer over the whole slide, on black, under the
  // text layer — text and picture fade into each other like any two slides (review of #46:
  // a picture had its own root, so switching cut instead of fading)
  const picture = show ? (slide.picture ?? null) : null;
  const textKey = picture ? null : show ? slideKey : null;
  const pictureLayer = (
    <SlideFade
      slideKey={picture ? slideKey : null}
      mode={transition}
      style={{ position: 'absolute', inset: 0, background: '#000' }}
    >
      {picture && <PictureContent picture={picture} />}
    </SlideFade>
  );

  // --- Positioned template layout ---------------------------------------------
  const template = slide.picture ? lastTemplate.current : ownTemplate;
  if (template) {
    return (
      <div style={rootStyle}>
        {scrim}
        {pictureLayer}
        <SlideFade
          slideKey={textKey}
          mode={transition}
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
                      <RevealLines reveal={slide.reveal} style={style} calm={calm} />
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
      {pictureLayer}
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
          slideKey={textKey}
          mode={transition}
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
          ) : slide.cover ? (
            <CoverContent cover={slide.cover} countdown={slide.countdown} onImageLoad={refit} />
          ) : slide.reveal ? (
            <RevealLines reveal={slide.reveal} style={style} calm={calm} />
          ) : (
            <QuoteLines lines={slide.lines} style={style} />
          )}
          {!slide.qr && !slide.cover && slide.subline && (
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
          {!slide.qr && !slide.cover && (
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
