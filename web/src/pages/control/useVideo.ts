import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { api, type VideoInfo } from '../../api';
import { type Slide, type SlideStyle, type SlideVideo } from '../../presenterBus';
import { type SeqItem } from '../../playlistStore';
import {
  pauseVideo,
  positionIn,
  resumeVideo,
  seekVideo,
  syncMedia,
  videoEnded,
  videoSlide,
} from '../../lib/video';
import { drawPoster } from '../../lib/videoPoster';
import { readImageFit } from '../../lib/imageFit';
import { showsSomething } from '../../lib/slide';
import { tr } from '../../i18n';
import { type VideoEnd, type VideoPhones } from '../../settingsStore';
import { standbyNotice } from './standby';

/** The video on screen, if the screen shows one of the list. */
export const videoOnScreen = (s: Slide) =>
  s.video && s.source?.kind === 'video' ? { video: s.video, videoId: s.source.videoId } : null;

const BLACK: Slide = { lines: [], reference: '', blank: false, visible: true, forceBlack: true };

/**
 * Video on screen (1.8.12-beta.3, F1005-14; the author's calls in FEEDBACK.md): the list of files,
 * showing one (it plays from its start), ⏯, a seek, «Повторювати» — each a new clock on the slide
 * (lib/video.ts), so every window follows. The SOUND comes from this window when it leads: an
 * <audio> of the same file kept to the clock, silent while the screen is hidden or black. At the
 * end (not looping) the leader does what «Після кінця відео» says: a black screen, or the next item
 * of the running order when the video came from it, else the next video of the list. The leader
 * also draws the posters the phones get (lib/videoPoster.ts), one at a time.
 *
 * Effects, in order: the sound, the end, the posters. None depends on another hook's effects.
 */
export function useVideo({
  slideStyle,
  pushLive,
  setPreviewOverride,
  setLive,
  liveSlide,
  lastPushed,
  liveSlideRef,
  isLeader,
  leaderRef,
  videosTab,
  openVideosTab,
  setImagesOpen,
  serverAvailable,
  videoEnd,
  videoPhones,
  volume,
  playlistCurrent,
  playlistNextRef,
}: {
  slideStyle: SlideStyle;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
  setLive: (live: boolean) => void;
  liveSlide: Slide;
  lastPushed: MutableRefObject<Slide | null>;
  liveSlideRef: MutableRefObject<Slide>;
  isLeader: boolean;
  leaderRef: MutableRefObject<boolean>;
  videosTab: boolean;
  openVideosTab: () => void;
  setImagesOpen: (v: boolean | ((open: boolean) => boolean)) => void;
  serverAvailable: boolean | null;
  videoEnd: VideoEnd;
  videoPhones: VideoPhones;
  volume: number;
  /** the running order's current item: a video started from it goes on to the next item */
  playlistCurrent: SeqItem | null;
  /** the running order's «Далі» (usePlaylistActions, called after this hook) */
  playlistNextRef: MutableRefObject<(() => void) | null>;
}) {
  const list = useQuery({
    queryKey: ['videos'],
    queryFn: api.videos,
    enabled: serverAvailable !== false && (videosTab || !!videoOnScreen(liveSlide)),
    staleTime: 0,
  });
  const videos = list.data ?? [];
  const [loop, setLoopPref] = useState(false);
  /** the length of the video on screen, once the sound's element knows it */
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(0);

  /** what the screen shows now: the last push, not a render behind */
  const screen = () => lastPushed.current ?? liveSlideRef.current;

  /** A video of the list on screen, from its start. Null, and said why, when it can't play. */
  const showVideo = (v: VideoInfo, opts: { fit?: SlideVideo['fit'] } = {}): Slide | null => {
    if (!leaderRef.current) {
      standbyNotice();
      return null;
    }
    if (v.missing) {
      notifications.show({
        message: tr('Файл не знайдено: {path}', { path: v.path }),
        color: 'gray',
        autoClose: 3000,
      });
      return null;
    }
    const slide = videoSlide(
      {
        src: v.src,
        poster: v.poster,
        name: v.name,
        fit: opts.fit ?? readImageFit(),
        loop,
        phones: videoPhones,
      },
      v.id,
      slideStyle,
    );
    pushLive(slide);
    setPreviewOverride(slide);
    setLive(true);
    return slide;
  };

  /** A new clock for the video on screen (and the preview, when it shows the same video). */
  const changeClock = (change: (v: SlideVideo, now: number) => SlideVideo) => {
    if (!leaderRef.current) return standbyNotice();
    const s = screen();
    const on = videoOnScreen(s);
    if (!on) return;
    const next: Slide = { ...s, video: change(on.video, Date.now()) };
    pushLive(next);
    setPreviewOverride((p) => (p && videoOnScreen(p)?.videoId === on.videoId ? next : p));
  };
  const togglePause = () =>
    changeClock((v, now) => (v.paused != null ? resumeVideo(v, now) : pauseVideo(v, now)));
  const seek = (to: number) => changeClock((v, now) => seekVideo(v, to, now));
  const setLoop = (on: boolean) => {
    setLoopPref(on);
    // the video on screen goes on from where it is, now looping or not
    changeClock((v, now) => {
      const at = positionIn(v, durationRef.current, now);
      return v.paused != null
        ? { ...v, loop: on, paused: at }
        : { ...v, loop: on, at: now, from: at };
    });
  };

  // ── the sound: this window's <audio> of the file on screen, kept to the clock (the leader only)
  const audio = useRef<HTMLAudioElement | null>(null);
  const [needsClick, setNeedsClick] = useState(false);
  const on = videoOnScreen(liveSlide);
  const soundSrc = isLeader && on ? on.video.src : null;
  const audible = !!on && showsSomething(liveSlide);
  const clock = useRef(on?.video ?? null);
  clock.current = on?.video ?? null;
  const audibleRef = useRef(audible);
  audibleRef.current = audible;
  useEffect(() => {
    if (!soundSrc) {
      audio.current?.pause();
      return;
    }
    // in the page (hidden), so a check can find it: `audio[data-vo-video-sound]` (w-video.mjs)
    const el = audio.current ?? (audio.current = document.body.appendChild(new Audio()));
    el.dataset.voVideoSound = '';
    if (el.src !== new URL(soundSrc, window.location.href).href) {
      el.src = soundSrc;
      durationRef.current = 0;
      setDuration(0);
    }
    const meta = () => {
      durationRef.current = Number.isFinite(el.duration) ? el.duration : 0;
      setDuration(durationRef.current);
    };
    el.addEventListener('loadedmetadata', meta);
    const sync = () => {
      const v = clock.current;
      if (!v) return;
      if (!audibleRef.current) {
        if (!el.paused) el.pause();
        return;
      }
      syncMedia(el, v);
    };
    const tick = window.setInterval(sync, 250);
    sync();
    // a page that was reloaded under a playing video may not sound until a click: say so, and
    // take the first click or key
    const blocked = () => setNeedsClick(true);
    el.addEventListener('play', () => setNeedsClick(false));
    const wake = () => {
      if (el.paused && audibleRef.current && clock.current?.paused == null)
        void el.play().then(() => setNeedsClick(false), blocked);
    };
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
    const check = window.setTimeout(() => {
      if (el.paused && audibleRef.current && clock.current?.paused == null) blocked();
    }, 1500);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(check);
      el.removeEventListener('loadedmetadata', meta);
      window.removeEventListener('pointerdown', wake, true);
      window.removeEventListener('keydown', wake, true);
    };
  }, [soundSrc]);
  // the clock changed (pause, seek, a start): the sound follows at once
  const liveVideo = on?.video ?? null;
  useEffect(() => {
    const el = audio.current;
    if (!el || !liveVideo || !soundSrc) return;
    if (audible) syncMedia(el, liveVideo);
    else el.pause();
  }, [liveVideo, audible, soundSrc]);
  // the length on the slide once known: «Сцена» shows the time left (no window needs it to play)
  useEffect(() => {
    const s = screen();
    const at = videoOnScreen(s);
    if (!isLeader || !at || !(duration > 0) || at.video.duration === duration) return;
    pushLive({ ...s, video: { ...at.video, duration } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeader, duration, liveVideo]);
  useEffect(() => {
    if (audio.current) audio.current.volume = Math.max(0, Math.min(1, volume));
  }, [volume, soundSrc]);
  useEffect(
    () => () => {
      audio.current?.pause();
      audio.current?.remove();
      audio.current = null;
    },
    [],
  );

  // ── the end: «Після кінця відео» — black, or the next item / video (the leader, once a video)
  const ended = useRef<string | null>(null);
  const endNow = useRef<() => void>(() => {});
  endNow.current = () => {
    const s = screen();
    const at = videoOnScreen(s);
    if (!at) return;
    const fromOrder = playlistCurrent?.kind === 'video' && playlistCurrent.videoId === at.videoId;
    if (videoEnd === 'next') {
      if (fromOrder && playlistNextRef.current) return playlistNextRef.current();
      const i = videos.findIndex((v) => v.id === at.videoId);
      const next = i >= 0 ? videos.slice(i + 1).find((v) => !v.missing) : undefined;
      if (next) {
        showVideo(next, { fit: at.video.fit });
        return;
      }
    }
    pushLive(BLACK);
    setLive(false);
  };
  useEffect(() => {
    if (!isLeader || !on || on.video.loop || on.video.paused != null || !(duration > 0)) return;
    const key = `${on.video.src}|${on.video.at}|${on.video.from}`;
    const check = () => {
      if (ended.current === key) return;
      const v = videoOnScreen(screen())?.video;
      if (!v || `${v.src}|${v.at}|${v.from}` !== key) return;
      if (videoEnded(v, duration)) {
        ended.current = key;
        endNow.current();
      }
    };
    const t = window.setInterval(check, 200);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLeader,
    on?.video.src,
    on?.video.at,
    on?.video.from,
    on?.video.paused,
    on?.video.loop,
    duration,
  ]);

  // ── posters for the phones: the leader draws the missing ones, one at a time, once per window
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!isLeader || serverAvailable === false) return;
    const todo = videos.filter(
      (v) => !v.missing && !v.hasPoster && v.v && !tried.current.has(`${v.id}|${v.v}`),
    );
    if (todo.length === 0) return;
    let stopped = false;
    void (async () => {
      for (const v of todo) {
        if (stopped) return;
        tried.current.add(`${v.id}|${v.v}`);
        try {
          const jpeg = await drawPoster(v.src);
          await api.putVideoPoster(v.id, v.v!, jpeg);
        } catch {
          /* the phones show the words instead */
        }
      }
      if (!stopped) void list.refetch();
    })();
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeader, serverAvailable, list.data]);

  /** A video of the running order (SeqVideo): open in «Зображення» → «Відео», on screen. */
  const startVideo = async (
    videoId: string,
    fit: SlideVideo['fit'],
    label: string,
  ): Promise<{ slide: Slide } | { reason: string }> => {
    if (!leaderRef.current) {
      standbyNotice();
      return { reason: tr('Показом керує інше вікно керування') };
    }
    openVideosTab();
    setImagesOpen(true);
    const all = await list.refetch().then((r) => r.data ?? []);
    const v = all.find((x) => x.id === videoId);
    if (!v) {
      notifications.show({ message: tr('Відео прибрано: {name}', { name: label }), color: 'gray' });
      return { reason: tr('Відео прибрано: {name}', { name: label }) };
    }
    if (v.missing) {
      notifications.show({
        message: tr('Файл не знайдено: {path}', { path: v.path }),
        color: 'gray',
      });
      return { reason: tr('Файл не знайдено: {name}', { name: label }) };
    }
    const slide = showVideo(v, { fit });
    return slide ? { slide } : { reason: tr('Показом керує інше вікно керування') };
  };

  return {
    videos,
    videosLoading: list.isLoading,
    videosError: list.error as Error | null,
    reloadVideos: () => void list.refetch(),
    onScreen: on,
    duration,
    loop,
    showVideo,
    startVideo,
    togglePause,
    seek,
    setLoop,
    needsClick,
  };
}
