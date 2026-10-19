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
 * A YouTube video's length, read by a player of its own off the page (the control window, when the
 * video is added): «Після кінця відео», the seek bar and «Сцена»'s time left need it. 0 when YouTube
 * doesn't answer within `ms`.
 */
export async function youtubeLength(id: string, ms = 15_000): Promise<number> {
  const YT = await loadYouTube().catch(() => null);
  if (!YT) return 0;
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;';
  const inner = document.createElement('div');
  box.appendChild(inner);
  document.body.appendChild(box);
  let player: YTPlayer | null = null;
  // the answer came (or the time ran out): the player is going, no more reads of it (review)
  let done = false;
  try {
    return await new Promise<number>((resolve) => {
      const t = window.setTimeout(() => resolve(0), ms);
      player = new YT.Player(inner, {
        videoId: id,
        host: 'https://www.youtube-nocookie.com',
        width: 320,
        height: 180,
        playerVars: playerVars(true),
        events: {
          onReady: (e) => {
            // some videos say their length only once they are cued
            const read = (n: number) => {
              if (done) return;
              let d = 0;
              try {
                d = e.target.getDuration();
              } catch {
                return;
              }
              if (d > 0 || n <= 0) {
                window.clearTimeout(t);
                resolve(d > 0 ? d : 0);
              } else window.setTimeout(() => read(n - 1), 250);
            };
            read(20);
          },
          onError: () => {
            window.clearTimeout(t);
            resolve(0);
          },
        },
      });
    });
  } finally {
    done = true;
    try {
      (player as YTPlayer | null)?.destroy();
    } catch {
      // gone already
    }
    box.remove();
  }
}

/** The channel a «Показ» window tells the control window that the browser kept the sound off on. */
export const YT_CHANNEL = 'vo-youtube';
export type YTNote = { t: 'sound-blocked' } | { t: 'sound-on' };

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
