import {
  type Slide,
  type SlideCountdown,
  type SlideCover,
  type SlidePicture,
  type SlideSource,
  type SlideStyle,
  type StageMessage,
} from '../presenterBus';
import { type StageTimer } from './countdown';
import { tr } from '../i18n';

/** True when two slides show the same content (used to merge preview into the live monitor). */
export function sameContent(a: Slide, b: Slide): boolean {
  if ((a.reference ?? '') !== (b.reference ?? '') || a.lines.length !== b.lines.length)
    return false;
  if ((a.subline ?? '') !== (b.subline ?? '')) return false;
  return a.lines.every((l, i) => l.text === b.lines[i].text);
}

/**
 * Exactly the same slide (text, state, style, template, reveal)? The images — data URLs of
 * up to ~1.5 MB: the background, «Заставка»'s image (1.4.2) — are compared on their own: the
 * same string instance (the appearance setting) is equal in O(1), so re-projecting never
 * serializes them. So is the slide a QR slide or «Заставка» covers, which has its own.
 */
export function sameSlide(a: Slide, b: Slide): boolean {
  if (a === b) return true;
  if ((a.style?.bgImage ?? null) !== (b.style?.bgImage ?? null)) return false;
  if ((a.cover?.image ?? null) !== (b.cover?.image ?? null)) return false;
  const [ra, rb] = [a.returnTo ?? null, b.returnTo ?? null];
  if (ra !== rb && (!ra || !rb || !sameSlide(ra, rb))) return false;
  const rest = (s: Slide) =>
    JSON.stringify({
      ...s,
      style: s.style && { ...s.style, bgImage: null },
      cover: s.cover && { ...s.cover, image: null },
      returnTo: undefined,
    });
  return rest(a) === rest(b);
}

/** What a speaker remote needs to know about a slide — compact, no styling or images. */
export interface ScreenSummary {
  status: 'live' | 'blank' | 'black' | 'empty';
  /** the control window's words; for an app-made slide see `kind` */
  reference: string;
  /** First line's text, capped — enough to recognise the slide on a phone. */
  text: string;
  /**
   * An app-made slide (1.4.2): the viewers' QR or «Заставка». The phone names it in its own
   * language (`inPhoneWords`) — `reference` and `text` were the control window's, and a phone
   * in English read «Заставка». They stay for a remote page of an older version.
   * `countdown` (1.5.0): «Заставка» with «Відлік» (an older page names it «Заставка»).
   */
  kind?: 'qr' | 'cover' | 'countdown' | 'picture' | 'video';
  /**
   * «Відлік» on screen (1.11.0-beta.1) — over «Заставка» or in a corner: its clock, so a remote shows
   * the time left and knows pause from go on — by the computer's clock (the phone asks the hub)
   */
  countdown?: Pick<SlideCountdown, 'until' | 'pausedLeft' | 'afterZero' | 'item'>;
  /**
   * The speaker's timer and «Повідомлення на сцену» (1.11.0-beta.2): a remote is the speaker's —
   * it shows them as «Сцена» does. Only in this summary, which only remotes get (never viewers).
   */
  stageTimer?: StageTimer;
  stageMessage?: StageMessage;
  font?: string;
  /** where it comes from (0.6.1): a remote knows whether its own cursor is on screen */
  source?: SlideSource;
}

/** Anything to show — text, the viewers' QR slide, «Заставка» or a picture (no lines there). */
const hasContent = (s: Slide) =>
  s.lines.length > 0 || !!s.qr || !!s.cover || !!s.picture || !!s.video;

/**
 * Do the viewers see the slide now — something to show, neither hidden nor black? The
 * control window's toggles and the stage display ask this (1.4.1: they counted only lines,
 * so «Заставка» read as an empty screen).
 */
export function showsSomething(s: Slide): boolean {
  return s.visible && !s.blank && !s.forceBlack && hasContent(s);
}

export function summarize(slide: Slide | null | undefined): ScreenSummary {
  if (!slide) return { status: 'empty', reference: '', text: '' };
  // «Відлік» over «Заставка», or in the corner of what is on screen (review: the corner's was missed)
  const timed = (slide.cover && slide.countdown) || slide.cornerCountdown || null;
  const status: ScreenSummary['status'] = slide.forceBlack
    ? 'black'
    : slide.blank
      ? 'blank'
      : slide.visible && hasContent(slide)
        ? 'live'
        : 'empty';
  return {
    status,
    reference: slide.reference ?? '',
    text: slide.qr
      ? tr('QR для глядачів')
      : slide.cover && slide.countdown
        ? tr('Відлік')
        : slide.cover
          ? tr('Заставка')
          : slide.picture
            ? slide.picture.name
            : slide.video
              ? slide.video.name
              : (slide.lines[0]?.text ?? '').slice(0, 400),
    font: slide.style?.font,
    source: slide.source,
    kind: slide.qr
      ? 'qr'
      : slide.cover
        ? slide.countdown
          ? 'countdown'
          : 'cover'
        : slide.picture
          ? 'picture'
          : slide.video
            ? 'video'
            : undefined,
    ...(slide.stageTimer ? { stageTimer: slide.stageTimer } : {}),
    ...(slide.stageMessage ? { stageMessage: slide.stageMessage } : {}),
    ...(timed
      ? {
          countdown: {
            until: timed.until,
            ...(timed.pausedLeft != null ? { pausedLeft: timed.pausedLeft } : {}),
            ...(timed.afterZero ? { afterZero: timed.afterZero } : {}),
            // a running-order item's (1.11.0-beta.4): «Сцена» on the phone says what follows it
            ...(timed.item ? { item: timed.item } : {}),
          },
        }
      : {}),
  };
}

/**
 * A summary as the phone shows it (1.4.2): an app-made slide named in the phone's own
 * language, anything else as it came.
 */
export function inPhoneWords(s: ScreenSummary | null): ScreenSummary | null {
  // a picture (1.5.0) and a video (1.8.12) are named by their file: the operator's words
  if (!s?.kind || s.kind === 'picture' || s.kind === 'video') return s;
  const name =
    s.kind === 'qr'
      ? tr('QR для глядачів')
      : s.kind === 'countdown'
        ? tr('Відлік')
        : tr('Заставка');
  return { ...s, reference: name, text: name };
}

/**
 * The slide under app-made ones — the viewers' QR, «Заставка» — what they cover (null: none
 * known). Never deeper than lib/bus.ts lets a slide nest.
 */
function underneath(s: Slide | null | undefined, depth = 0): Slide | null {
  if (!s || !(s.qr || s.cover)) return s ?? null;
  return depth < 2 ? underneath(s.returnTo, depth + 1) : null;
}

/**
 * «QR на екран» (0.6.16): the viewers' address as a big QR over what is on screen. It keeps
 * that slide (`returnTo`, 1.4.2: on the slide itself — it was the covering window's own, so
 * after «Взяти керування» or a reload the screen went empty); over the QR itself, what that
 * covers. «Заставка» under it stays whole: taking the QR away brings the cover back.
 */
export function qrOver(now: Slide, url: string, style: SlideStyle, reference: string): Slide {
  const returnTo = now.qr ? (now.returnTo ?? null) : now;
  return { lines: [], reference, blank: false, visible: true, style, qr: url, returnTo };
}

/**
 * «Заставка» (1.4.0): the operator's logo and text over what is on screen. It keeps the slide
 * it covers as `qrOver` does — under the viewers' QR, the slide that one covers: L again gives
 * back text, never an app-made slide.
 */
export function coverOver(
  now: Slide,
  cover: SlideCover,
  style: SlideStyle,
  reference: string,
): Slide {
  return {
    lines: [],
    reference,
    blank: false,
    visible: true,
    style,
    cover,
    returnTo: underneath(now),
  };
}

/**
 * «Відлік» (1.5.0): «Заставка» with a countdown under it, over what is on screen — what it
 * covers comes back as from «Заставка» (L, or «Прибрати відлік»). Over a cover or a running
 * countdown it covers what those cover: a new countdown replaces the old one.
 */
export function countdownOver(
  now: Slide,
  cover: SlideCover,
  countdown: SlideCountdown,
  style: SlideStyle,
  reference: string,
): Slide {
  return { ...coverOver(now, cover, style, reference), countdown };
}

/**
 * A picture on screen («Зображення», 1.5.0): on the slide's style, named by its file — the
 * monitors and the remotes say that name.
 */
export function pictureSlide(picture: SlidePicture, style: SlideStyle): Slide {
  return { lines: [], reference: picture.name, blank: false, visible: true, style, picture };
}

/**
 * What taking the QR or «Заставка» away gives back: exactly the slide it covered, when that
 * still shows something; null — empty the screen (it covered nothing, black, or the same kind).
 */
export function uncover(now: Slide): Slide | null {
  const back = now.returnTo;
  if (!back || !back.visible || back.forceBlack) return null;
  if (now.qr ? back.qr : back.cover) return null;
  return back;
}

/**
 * A slide as the phones get it (the hub's follow-along relay): no background image — a data
 * URL of up to ~1.5 MB, past the hub's 256 KB frame (server/src/live.ts `MAX_FRAME_BYTES`:
 * the hub closes the socket) — and no «Заставка» image (1.4.0: an empty slide there). Nor
 * the slide a cover or the QR slide covers (1.4.2): it is for the control windows, and
 * carries its own background. A countdown («Відлік», 1.5.0) stays: the phones show it. A
 * speaker's timer (1.8.4) is for «Сцена» only.
 */
export function forAudience(slide: Slide): Slide {
  const s =
    slide.cover || slide.returnTo || slide.stageTimer || slide.stageMessage
      ? {
          ...slide,
          cover: undefined,
          returnTo: undefined,
          stageTimer: undefined,
          // the speaker's message (1.9.0-beta.11) is for «Сцена» only
          stageMessage: undefined,
        }
      : slide;
  // a video (1.8.12-beta.3): the phones never load the file (it is this machine's only), only
  // its poster or the words
  if (s.video?.src) return forAudience({ ...s, video: { ...s.video, src: '' } });
  if (!s.style?.bgImage) return s;
  return { ...s, style: { ...s.style, bgImage: null } };
}

/**
 * What a control window on another computer (`/desk`, 1.9.0-beta.10) draws on its monitors: the
 * audience's slide — no images, under the hub's frame cap — that still shows what covers the
 * screen: «Заставка» (its words, not its logo) with the countdown under it.
 */
export function forDesk(slide: Slide): Slide {
  const s = forAudience(slide);
  return slide.cover ? { ...s, cover: { text: slide.cover.text, image: null } } : s;
}

/**
 * The hub closes a socket on a frame over 256 KiB (server/src/live.ts MAX_FRAME_BYTES): a desk's
 * frame keeps well under it. Psalm 119 in five translations is about 170 KB for the screen alone
 * (review of 1.9.0-beta.10) — and the control window would resend it after every reconnect.
 */
export const DESK_FRAME_MAX = 192 * 1024;
/** A line's text on a desk's monitor at most (a slide that long is unreadable there anyway). */
const DESK_LINE_MAX = 2000;
const utf8 = (s: string) => new TextEncoder().encode(s).length;

/**
 * The `slides` frame for the desks: the screen and «Далі», each through forDesk. Too big: first
 * «Далі» goes, then the screen's lines are cut (their red-letter parts with them).
 */
export function deskFrame(
  live: Slide,
  next: Slide | null,
): { frame: { type: 'slides'; live: Slide; next: Slide | null }; key: string } {
  let frame = { type: 'slides' as const, live: forDesk(live), next: next ? forDesk(next) : null };
  let key = JSON.stringify(frame);
  if (utf8(key) <= DESK_FRAME_MAX) return { frame, key };
  frame = { ...frame, next: null };
  key = JSON.stringify(frame);
  if (utf8(key) <= DESK_FRAME_MAX) return { frame, key };
  const lines = frame.live.lines.map((l) => ({
    ...l,
    text: l.text.length > DESK_LINE_MAX ? `${l.text.slice(0, DESK_LINE_MAX)}…` : l.text,
    segments: undefined,
  }));
  frame = { ...frame, live: { ...frame.live, lines } };
  return { frame, key: JSON.stringify(frame) };
}

/**
 * «Сховати текст» (0.6.18) over what is on screen — the operator: «щоб вертався рівно
 * той же контент». Hiding keeps the whole slide (lines, style, source) with blank: the
 * text fades, the background and the corner QR stay; again → the same slide back. From
 * black it goes to «hidden». Null: nothing on screen to hide.
 */
export function toggleHidden(s: Slide): Slide | null {
  if (s.forceBlack) return { ...s, forceBlack: false, blank: true };
  if (s.blank) return { ...s, blank: false };
  if (!s.visible || !hasContent(s)) return null;
  return { ...s, blank: true };
}

/**
 * «Чорний екран» (0.6.18): an instant cut to black — background and corner QR included —
 * over whatever is there (kept inside the slide); again → exactly that back.
 */
export function toggleBlack(s: Slide): Slide {
  return s.forceBlack ? { ...s, forceBlack: false } : { ...s, forceBlack: true, visible: true };
}
