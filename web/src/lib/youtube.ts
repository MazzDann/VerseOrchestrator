import { createContext } from 'react';

/**
 * YouTube on screen (1.19.0-beta.6, the users' F1017-06 «Відео ютуб не можу відтворити, коли це
 * програма»): YouTube's own player (the IFrame API, loaded once, on first use — it needs the internet)
 * in an output window, kept to the slide's clock like a video file (lib/video.ts). One «Показ» window
 * plays the sound (the Web Lock `vo-youtube-sound`); every other window — monitors, «Сцена», a second
 * «Показ» — plays it muted.
 */

/** The bits of YouTube's player this app uses. */
export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(volume: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      width?: number | string;
      height?: number | string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

/** The player's states: -1 not started, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued. */
export const YT_ENDED = 0;
export const YT_PLAYING = 1;
export const YT_PAUSED = 2;
export const YT_BUFFERING = 3;

let api: Promise<YTNamespace> | null = null;

/** YouTube's IFrame API, once per page; it fails after 20 s without the internet. */
export function loadYouTube(): Promise<YTNamespace> {
  const w = window as unknown as {
    YT?: YTNamespace & { loaded?: number };
    onYouTubeIframeAPIReady?: () => void;
  };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (api) return api;
  api = new Promise<YTNamespace>((resolve, reject) => {
    const before = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      before?.();
      if (w.YT?.Player) resolve(w.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => {
      api = null;
      reject(new Error('youtube'));
    };
    document.head.appendChild(s);
    window.setTimeout(() => {
      if (!w.YT?.Player) {
        api = null;
        reject(new Error('youtube'));
      }
    }, 20_000);
  });
  return api;
}

/** The player's settings for a slide: no controls, no keyboard, no suggestions of other channels. */
export const playerVars = (muted: boolean): Record<string, string | number> => ({
  autoplay: 0,
  controls: 0,
  disablekb: 1,
  fs: 0,
  iv_load_policy: 3,
  modestbranding: 1,
  playsinline: 1,
  rel: 0,
  mute: muted ? 1 : 0,
  origin: window.location.origin,
});

/**
 * What a «Показ» window tells the control window: the browser kept the sound off (and back on), and a
 * video's length once its player knows it (1.19.0-beta.7: no player of the control window's own reads it
 * off the page — YouTube's players must be seen)
 */
export const YT_CHANNEL = 'vo-youtube';
export type YTNote =
  | { t: 'sound-blocked' }
  | { t: 'sound-on' }
  | { t: 'length'; youtube: string; duration: number };

/**
 * Is the player showing an ad? Its length isn't the video's then (YouTube's player says no more); while
 * it is, the app neither jumps nor pauses it — an ad plays as YouTube plays it (1.19.0-beta.7)
 */
export const showsAd = (p: YTPlayer, length: number | undefined) =>
  !!length && length > 0 && Math.abs(p.getDuration() - length) > 2;

/** A YouTube video's id: 11 letters, digits, «-» and «_». */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * The video's id in a YouTube address — watch?v=…, youtu.be/…, /shorts/…, /embed/…, /live/…, a bare
 * id; null for anything else (the server checks it the same way: server/src/videos.ts youtubeIdOf).
 */
export function youtubeIdOf(raw: string): string | null {
  const t = raw.trim();
  if (YOUTUBE_ID.test(t)) return t;
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, first, second] = u.pathname.split('/');
    if (first === 'watch') id = u.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(first ?? '')) id = second ?? null;
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** This window plays a YouTube video's sound (one «Показ» window, pages/Presenter.tsx); else muted. */
export const VideoSoundContext = createContext(false);

/**
 * A YouTube video on a slide is YouTube's player only where the slide is big — a «Показ» window
 * (1.19.0-beta.7: players under 200×200 aren't allowed, and every monitor a copy was many players);
 * monitors, «Сцена», the desk and /key show its picture
 */
export const VideoPlayerContext = createContext(false);
