import { useEffect, useRef, useState } from 'react';
import { Text } from '@mantine/core';
import { type SlideVideo } from '../presenterBus';
import { positionIn } from '../lib/video';
import {
  loadYouTube,
  youtubeHost,
  showsAd,
  YT_ENDED,
  YT_PAUSED,
  YT_PLAYING,
  type YTPlayer,
} from '../lib/youtube';
import { tr, useLang } from '../i18n';

/** the operator's own move, not a buffering hiccup: off the show's clock by more than this */
const MOVED_S = 2;
/** after the app moves this player itself, its events for this long are the app's, not the operator's */
const OWN_MS = 1500;

/**
 * The operator's YouTube player (1.19.0-beta.7, after the user asked about YouTube's terms): YouTube's
 * own player, seen and whole — its buttons, its bar, its ads — in «Відео» while a YouTube video is on
 * screen. It leads: a pause, a play, a jump the operator makes here goes onto the show's clock
 * (`onMove`), and the «Показ» windows follow (components/YouTubeContent.tsx). A change of the clock
 * from elsewhere (the running order starts it again) moves this player too. Muted at first: the sound
 * comes from a «Показ» window. It also reads the video's length for the control window.
 */
export function YouTubeLead({
  video,
  onMove,
  onLength,
}: {
  video: SlideVideo;
  onMove: (to: { paused: boolean; time: number }) => void;
  onLength: (seconds: number) => void;
}) {
  useLang();
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [failed, setFailed] = useState(false);
  const clock = useRef(video);
  clock.current = video;
  /** until when this player's events are the app's own doing */
  const own = useRef(0);
  /** what this player last put on the clock: that clock coming back is no change to follow (review) */
  const sent = useRef<{ paused: boolean; time: number } | null>(null);
  /** polls in a row the playing player was off the clock: a jump is two (a stall is one — review) */
  const off = useRef(0);
  const live = useRef({ onMove, onLength });
  live.current = { onMove, onLength };

  /** this player to the show's clock (on its start, and when the clock moved from elsewhere) */
  const follow = () => {
    const p = player.current;
    if (!p || showsAd(p, clock.current.duration)) return;
    const v = clock.current;
    const length = v.duration && v.duration > 0 ? v.duration : p.getDuration();
    const target = positionIn(v, length);
    own.current = Date.now() + OWN_MS;
    if (Math.abs(p.getCurrentTime() - target) > 0.5) p.seekTo(target, true);
    if (v.paused != null) p.pauseVideo();
    else p.playVideo();
  };
  const followRef = useRef(follow);
  followRef.current = follow;

  /** the operator moved this player: onto the clock */
  const move = (paused: boolean, time: number) => {
    sent.current = { paused, time: Math.max(0, time) };
    off.current = 0;
    live.current.onMove({ paused, time });
  };
  /** its length isn't known yet: no ad can be told apart, so nothing it does moves the clock (review) */
  const blind = () => !(clock.current.duration! > 0);

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
          playerVars: {
            autoplay: 0,
            controls: 1,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            rel: 0,
            mute: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (gone) return;
              player.current = e.target;
              e.target.mute();
              const length = e.target.getDuration();
              if (length > 0) live.current.onLength(length);
              followRef.current();
            },
            onStateChange: (e) => {
              const p = player.current;
              if (gone || !p) return;
              const v = clock.current;
              // «Повторювати»: at its end it starts over with the clock (review)
              if (e.data === YT_ENDED && v.loop && v.paused == null) {
                followRef.current();
                return;
              }
              if (Date.now() < own.current || blind() || showsAd(p, v.duration)) return;
              const t = p.getCurrentTime();
              if (e.data === YT_PLAYING && v.paused != null) move(false, t);
              else if (e.data === YT_PAUSED && v.paused == null) {
                // the end of a video that doesn't loop pauses too: not a pause of the operator's
                const length = v.duration && v.duration > 0 ? v.duration : p.getDuration();
                if (!(length > 0 && t >= length - 1)) move(true, t);
              }
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
        // gone already
      }
      host.remove();
    };
  }, [video.youtube, video.account]);

  // a jump the operator made (the bar, the arrow keys) shows as the player's time leaving the clock
  useEffect(() => {
    const t = window.setInterval(() => {
      const p = player.current;
      if (!p || Date.now() < own.current || blind()) return;
      const v = clock.current;
      if (showsAd(p, v.duration)) return;
      const at = p.getCurrentTime();
      const state = p.getPlayerState();
      const target = positionIn(v, v.duration!);
      if (v.paused != null) {
        if (state === YT_PAUSED && Math.abs(at - v.paused) > 0.5) move(true, at);
        return;
      }
      // playing only (a buffering player lags behind the clock without anyone's jump); twice in a row
      if (state === YT_PLAYING && Math.abs(at - target) > MOVED_S) {
        off.current += 1;
        if (off.current >= 2) move(false, at);
      } else off.current = 0;
    }, 500);
    return () => window.clearInterval(t);
  }, []);

  // the clock moved from elsewhere (not the clock this player just put there): this player follows it
  useEffect(() => {
    const s = sent.current;
    const pos = video.paused != null ? video.paused : video.from;
    if (s && s.paused === (video.paused != null) && Math.abs(pos - s.time) < 0.5) return;
    followRef.current();
  }, [video.at, video.from, video.paused]);

  return (
    <div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          // YouTube's players are 200×200 at least: a 16:9 one of 356 px or wider
          minWidth: 356,
          aspectRatio: '16 / 9',
          background: '#000',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {failed ? (
          <img
            src={video.poster}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div
            ref={box}
            data-vo-youtube-lead={video.youtube}
            style={{ position: 'absolute', inset: 0 }}
          />
        )}
      </div>
      <Text size="xs" c="dimmed" mt={4}>
        {failed
          ? tr('YouTube не відповідає — перевірте інтернет')
          : tr(
              'Керуйте тут кнопками YouTube: пауза, перемотка — вікна показу повторюють. Звук іде з вікна показу.',
            )}
      </Text>
    </div>
  );
}
