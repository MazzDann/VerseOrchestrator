import type { Slide, SlideStyle, SlideVideo } from '../presenterBus';

/**
 * Video on screen (1.8.12-beta.3, F1005-14): the slide carries the clock, never a frame — when the
 * video was at `from` seconds (`at`, ms since the epoch), or `paused` at a position — so every
 * window («Показ», «Сцена»'s previews, the control window's monitors and its sound) plays the same
 * moment, a late one and a window that takes over too, as «Відлік» carries its end (lib/countdown.ts).
 */

/** Where the video is at `now` (seconds), before a loop folds it into its length. */
export const videoPosition = (v: SlideVideo, now = Date.now()) =>
  v.paused != null ? v.paused : v.from + Math.max(0, now - v.at) / 1000;

/** …and in the file of `duration` seconds: a loop starts over, else it stays at the end. */
export function positionIn(v: SlideVideo, duration: number, now = Date.now()) {
  const p = videoPosition(v, now);
  if (!(duration > 0)) return p;
  return v.loop ? p % duration : Math.min(p, duration);
}

/** Has it played to its end (never, while it loops)? */
export const videoEnded = (v: SlideVideo, duration: number, now = Date.now()) =>
  !v.loop && duration > 0 && v.paused == null && videoPosition(v, now) >= duration;

export const pauseVideo = (v: SlideVideo, now = Date.now()): SlideVideo =>
  v.paused != null ? v : { ...v, paused: videoPosition(v, now) };

export const resumeVideo = (v: SlideVideo, now = Date.now()): SlideVideo =>
  v.paused == null ? v : { ...v, at: now, from: v.paused, paused: null };

/** To `to` seconds; paused stays paused there. */
export const seekVideo = (v: SlideVideo, to: number, now = Date.now()): SlideVideo => {
  const t = Math.max(0, to);
  return v.paused != null ? { ...v, paused: t } : { ...v, at: now, from: t };
};

/** The slide that plays a video from its start (`at` = now). */
export function videoSlide(
  video: Omit<SlideVideo, 'at' | 'from' | 'paused'>,
  videoId: string,
  style: SlideStyle,
  now = Date.now(),
): Slide {
  return {
    lines: [],
    reference: video.name,
    blank: false,
    visible: true,
    style,
    video: { ...video, at: now, from: 0, paused: null },
    source: { kind: 'video', videoId },
  };
}

/**
 * What a playing element does to keep to the clock: off by more than `SEEK_S` → jump there; a
 * smaller drift → play a little faster or slower until it is gone (a jump each time stutters).
 */
export const SEEK_S = 0.4;
export function syncStep(
  current: number,
  target: number,
  loopOf = 0,
): { seek: number | null; rate: number } {
  let drift = target - current;
  // a loop: 9.9 s against 0.1 s of a 10 s video is 0.2 s, not 9.8 (each start over stuttered)
  if (loopOf > 0) drift = ((((drift + loopOf / 2) % loopOf) + loopOf) % loopOf) - loopOf / 2;
  if (Math.abs(drift) > SEEK_S) return { seek: target, rate: 1 };
  if (Math.abs(drift) < 0.03) return { seek: null, rate: 1 };
  return { seek: null, rate: 1 + Math.max(-0.1, Math.min(0.1, drift * 0.5)) };
}

/** «1:05» / «1:02:05» for the controls and «Сцена». */
export function clockOf(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * Keep a media element to the slide's clock — «Показ»'s video and the control window's sound
 * alike: paused or at its end it stands at the position; playing, it follows by `syncStep`.
 */
export function syncMedia(el: HTMLMediaElement, v: SlideVideo, now = Date.now()) {
  const d = Number.isFinite(el.duration) ? el.duration : 0;
  const target = positionIn(v, d, now);
  el.loop = v.loop;
  if (v.paused != null || (!v.loop && d > 0 && target >= d - 0.05)) {
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - target) > 0.05) el.currentTime = target;
    return;
  }
  const step = syncStep(el.currentTime, target, v.loop ? d : 0);
  if (step.seek != null) el.currentTime = step.seek;
  if (el.playbackRate !== step.rate) el.playbackRate = step.rate;
  if (el.paused) void el.play().catch(() => {});
}
