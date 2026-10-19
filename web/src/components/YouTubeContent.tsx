import { useContext, useEffect, useRef, useState } from 'react';
import { type SlideVideo } from '../presenterBus';
import { positionIn } from '../lib/video';
import {
  loadYouTube,
  youtubeHost,
  playerVars,
  YT_BUFFERING,
  YT_CHANNEL,
  YT_PLAYING,
  type YTNote,
  type YTPlayer,
  showsAd,
  VideoSoundContext,
} from '../lib/youtube';

/** a drift under this is left alone: YouTube's player can't play a little faster to catch up */
const DRIFT_S = 1.2;
/** after a jump, the player buffers: no new jump for this long */
const SEEK_PAUSE_MS = 2500;
/**
 * playing was asked for this long and the player still isn't playing: the browser kept the sound off. A player that
 * stands with its video there (ended, paused, cued) waits 4 s; one that never started (-1 — what a
 * refused start looks like, and a slow connection's loading too) waits 8 s (review)
 */
const BLOCKED_MS: Record<number, number> = { [-1]: 8000, 0: 4000, 2: 4000, 5: 4000 };

/**
 * A YouTube video on a slide (1.19.0-beta.6): YouTube's player, kept to the slide's clock — the
 * same moment in every window, a pause, a jump, «Повторювати»; at the end it stays on the last frame
 * (no screen of other videos). The sound only where VideoSoundContext says so, at the slide's
 * loudness. A video that won't play (no internet, its owner forbids it) leaves YouTube's picture.
 */
export function YouTubeContent({ video }: { video: SlideVideo }) {
  const sound = useContext(VideoSoundContext);
  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [failed, setFailed] = useState(false);
  const clock = useRef(video);
  clock.current = video;
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const lastSeek = useRef(0);
  const wanted = useRef<number | null>(null);
  const blocked = useRef(false);

  const sync = () => {
    const p = player.current;
    if (!p) return;
    const v = clock.current;
    const length = v.duration && v.duration > 0 ? v.duration : p.getDuration();
    const target = positionIn(v, length);
    const state = p.getPlayerState();
    const at = p.getCurrentTime();
    const now = Date.now();
    const seek = (to: number) => {
      if (now - lastSeek.current < SEEK_PAUSE_MS) return;
      lastSeek.current = now;
      p.seekTo(to, true);
    };
    // what the player does, for a check from outside (w-youtube.mjs): it is another site's frame
    const mark = wrap.current?.dataset;
    if (mark) {
      mark.ytState = String(state);
      mark.ytAt = at.toFixed(1);
      mark.ytMuted = p.isMuted() ? '1' : '0';
    }
    // an ad plays as YouTube plays it: no jump, no pause over it (1.19.0-beta.7, YouTube's terms)
    if (showsAd(p, v.duration)) return;
    const running = state === YT_PLAYING || state === YT_BUFFERING;
    if (v.paused != null) {
      if (running) p.pauseVideo();
      if (Math.abs(at - target) > 0.5) seek(target);
      wanted.current = null;
      return;
    }
    // its end, not looping: the last frame stays (YouTube's end screen would show other videos) —
    // in a window that opens after the end too (review)
    if (!v.loop && length > 0 && target >= length - 0.3) {
      if (running) p.pauseVideo();
      if (Math.abs(at - (length - 0.5)) > 1) seek(length - 0.5);
      wanted.current = null;
      return;
    }
    // no jump while its length is unknown: an ad couldn't be told apart from the video (review)
    if (v.duration! > 0 && Math.abs(at - target) > DRIFT_S) seek(target);
    if (running) {
      wanted.current = null;
      return;
    }
    p.playVideo();
    const wait = BLOCKED_MS[state];
    if (wait == null) {
      wanted.current = null;
      return;
    }
    // (its time is no sign: the clock's jumps move it while it stands)
    if (wanted.current == null) wanted.current = now;
    // asked to play with the sound on and its time stands: the browser wants a click first — muted
    // now, the sound with the first click in this window, the control window is told
    if (soundRef.current && !p.isMuted() && now - wanted.current > wait) {
      p.mute();
      p.playVideo();
      blocked.current = true;
      note({ t: 'sound-blocked' });
    }
  };
  const syncRef = useRef(sync);
  syncRef.current = sync;

  // the player, once per video
  useEffect(() => {
    const id = video.youtube;
    const el = box.current;
    if (!id || !el) return;
    let gone = false;
    let made: YTPlayer | null = null;
    const host = document.createElement('div');
    el.appendChild(host);
    loadYouTube().then(
      (YT) => {
        if (gone) return;
        made = new YT.Player(host, {
          videoId: id,
          host: youtubeHost(clock.current.account),
          width: '100%',
          height: '100%',
          playerVars: playerVars(!soundRef.current),
          events: {
            onReady: (e) => {
              if (gone) return;
              player.current = e.target;
              if (soundRef.current) {
                e.target.unMute();
                e.target.setVolume(Math.round((clock.current.volume ?? 1) * 100));
              } else e.target.mute();
              // its length for the control window when it didn't know it (no player off the page reads it)
              const length = e.target.getDuration();
              if (soundRef.current && !(clock.current.duration! > 0) && length > 0)
                note({ t: 'length', youtube: id, duration: length });
              syncRef.current();
            },
            onError: () => !gone && setFailed(true),
          },
        });
      },
      () => !gone && setFailed(true),
    );
    return () => {
      gone = true;
      player.current = null;
      try {
        made?.destroy();
      } catch {
        // gone with its window
      }
      host.remove();
    };
  }, [video.youtube, video.account]);

  // to the clock: at once on its change, then twice a second
  useEffect(() => {
    syncRef.current();
    const t = window.setInterval(() => syncRef.current(), 500);
    return () => window.clearInterval(t);
  }, [video.youtube, video.at, video.from, video.paused, video.loop, video.duration]);

  // the sound here or not, and its loudness
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    if (sound && !blocked.current) {
      p.unMute();
      p.setVolume(Math.round((video.volume ?? 1) * 100));
    } else if (!sound) p.mute();
  }, [sound, video.volume]);

  // the browser kept the sound off: the first click or key in this window gives it back
  useEffect(() => {
    if (!sound) return;
    const wake = () => {
      const p = player.current;
      if (!p || !blocked.current) return;
      blocked.current = false;
      p.unMute();
      p.setVolume(Math.round((clock.current.volume ?? 1) * 100));
      note({ t: 'sound-on' });
    };
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
    return () => {
      window.removeEventListener('pointerdown', wake, true);
      window.removeEventListener('keydown', wake, true);
    };
  }, [sound]);

  const fit = video.fit === 'cover';
  return (
    <div
      ref={wrap}
      data-vo-youtube={video.youtube}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' }}
    >
      {failed ? (
        video.poster && (
          <img
            src={video.poster}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: fit ? 'cover' : 'contain' }}
          />
        )
      ) : (
        // YouTube's player as it is (its clicks too — 1.19.0-beta.7); the operator's player keeps the clock
        <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      )}
    </div>
  );
}

const note = (msg: YTNote) => {
  try {
    const bc = new BroadcastChannel(YT_CHANNEL);
    bc.postMessage(msg);
    bc.close();
  } catch {
    // no channel: nothing to tell
  }
};
