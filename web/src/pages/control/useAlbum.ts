import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { notifications } from '@mantine/notifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type AlbumInfo } from '../../api';
import { type Slide, type SlideStyle } from '../../presenterBus';
import { albumSlide, photoIndex, photoReady, type AlbumPhoto } from '../../lib/album';
import { heicToJpeg } from '../../lib/heic';
import { readImageFit, type ImageFit } from '../../lib/imageFit';
import { canDrawSmall, drawSmall, smallOrder } from '../../lib/albumSmall';
import { PRIORITY, useCommandHandler, type Outcome } from '../../lib/commands';
import { everyMs } from '../../lib/workerClock';
import { isFormField, isResizeKey } from '../../lib/keyScroll';
import { noticeOnce } from '../../lib/noticeOnce';
import { stepDirection } from '../../hotkeys';
import { useSettings } from '../../settingsStore';
import { tr } from '../../i18n';
import { unusable, unusableNotice } from '../../lib/denied';
import { standbyNotice } from './standby';

import { type PastItem } from '../../lib/orderFlow';
/** The album open in «Зображення» and the photo it stands on (null: none shown yet). */
export interface OpenAlbum {
  id: string;
  index: number | null;
  /** the photo's file name: finds it again when the folder changed */
  name?: string;
}

const EVERY_KEY = 'vo:albumEvery';
export const EVERY_MIN = 2;
export const EVERY_MAX = 600;
const readEvery = () => {
  try {
    const n = Number(localStorage.getItem(EVERY_KEY));
    return n >= EVERY_MIN && n <= EVERY_MAX ? n : 8;
  } catch {
    return 8;
  }
};

/** The album's photo the screen shows, if it shows one of `albumId`'s (hidden or black aside). */
const albumOnScreen = (s: Slide, albumId: string) =>
  s.source?.kind === 'album' && s.source.albumId === albumId ? s.source : null;

/**
 * An album in turn (1.8.12, F1005-13; vo-media, vo-sync): the album open in «Зображення» owns
 * ← → / PageUp PageDown and the clicker's and remotes' «Далі» / «Назад» (lib/commands.ts, the
 * song's priority) while the panel shows it — as an open song does — and stops at its ends.
 * «Міняти кожні N с» steps it from this window while it leads: a key, «Пауза», another slide on
 * screen or the last photo end it; hidden or black, it waits. A window that takes over opens the
 * album at the photo on screen with the timer off (lib/takeover.ts).
 *
 * Only the leader steps (a window on standby says so); the timer's steps change the screen and
 * a preview that shows the album, never «Наживо» or a preview the operator moved on to.
 *
 * The leader also draws the open album's missing small copies for the phones (beta.2), one at a
 * time in a worker: the photo on screen and the next two first.
 *
 * Effects, in order: the album's keys (capture phase, ahead of the hotkeys), its commands, the
 * timer, the timer's end on standby, the small copies. None of them depends on another hook's
 * effects.
 */
export function useAlbum({
  slideStyle,
  pushLive,
  setPreviewOverride,
  setLive,
  liveSlideRef,
  isLeader,
  leaderRef,
  imagesOpen,
  setImagesOpen,
  albumsTab,
  openAlbumsTab,
  keysPaused,
  serverAvailable,
  pastItemRef,
}: {
  slideStyle: SlideStyle;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
  setLive: (live: boolean) => void;
  liveSlideRef: MutableRefObject<Slide>;
  isLeader: boolean;
  leaderRef: MutableRefObject<boolean>;
  imagesOpen: boolean;
  setImagesOpen: (v: boolean | ((open: boolean) => boolean)) => void;
  /** «Альбоми» shown in «Зображення» (not its pictures or videos): only then the album owns the keys */
  albumsTab: boolean;
  openAlbumsTab: () => void;
  keysPaused: boolean;
  serverAvailable: boolean | null;
  /** the running order's answer at the last / first photo (useRunningOrder, 1.10.0-beta.1) */
  pastItemRef: MutableRefObject<PastItem | null>;
}) {
  const queryClient = useQueryClient();
  const [album, setAlbum] = useState<OpenAlbum | null>(null);
  const [playing, setPlayingState] = useState(false);
  // the timer reads it: a «Далі» that stops the show stops the very next tick too (review)
  const playingRef = useRef(false);
  const setPlaying = useCallback((on: boolean) => {
    playingRef.current = on;
    setPlayingState(on);
  }, []);
  const [every, setEveryState] = useState(readEvery);
  /** bumped by a photo picked by hand while playing: its own full interval */
  const [restartAt, setRestartAt] = useState(0);
  const query = useQuery<AlbumInfo>({
    queryKey: ['album', album?.id],
    queryFn: () => api.album(album!.id),
    enabled: !!album && serverAvailable !== false,
    // read from the folder each time it is opened: photos added meanwhile are there
    staleTime: 0,
  });
  const photos = query.data?.id === album?.id ? (query.data?.photos ?? null) : null;
  const current =
    album && album.index != null && photos
      ? photoIndex(photos, { index: album.index, name: album.name })
      : null;
  const currentRef = useRef(current);
  currentRef.current = current;

  // the photo shown last, before the render that says so: two quick presses step twice
  const shown = useRef<{ id: string; photos: unknown; index: number } | null>(null);

  const openAlbum = useCallback(
    (id: string | null, at?: { index: number; name?: string }) => {
      // opened at a place (a takeover): from there, not from what this window showed before
      shown.current = null;
      setAlbum(id ? { id, index: at?.index ?? null, name: at?.name } : null);
      if (id) openAlbumsTab();
      setPlaying(false);
    },
    [setPlaying, openAlbumsTab],
  );
  const place = () => {
    const s = shown.current;
    return album && s && s.id === album.id && s.photos === photos ? s.index : current;
  };

  /**
   * A photo on screen. By hand it is the preview too and «Наживо» goes on, as a picture's click
   * does; the timer's (`quiet`) changes only the screen and a preview that shows this album.
   */
  const put = (
    id: string,
    list: AlbumPhoto[],
    index: number,
    fit: ImageFit,
    quiet = false,
    /** the way the step went: a photo gone from the folder gives way to the next one this way */
    dir: 1 | -1 = 1,
  ) => {
    shown.current = { id, photos: list, index };
    const slide = albumSlide(id, list, index, fit, slideStyle);
    pushLive(slide);
    if (quiet) setPreviewOverride((p) => (p && albumOnScreen(p, id) ? slide : p));
    else {
      setPreviewOverride(slide);
      setLive(true);
    }
    setAlbum({ id, index, name: list[index].name });
    checkPhoto(id, list, index, fit, quiet, dir);
    return slide;
  };
  /**
   * A photo gone from the folder since the album was read — renamed, deleted (1.10.12, the Mac's
   * round: «Показ» stayed on Firefox's loading dots, Chromium showed it from the copy read ahead, and
   * nobody said why). Asked of the server with each photo put up; a 404: the operator is told, the
   * album read again, and the nearest photo still there the way the step went takes its place.
   */
  const checkPhoto = (
    id: string,
    list: AlbumPhoto[],
    index: number,
    fit: ImageFit,
    quiet: boolean,
    dir: 1 | -1,
  ) => {
    const photo = list[index];
    const still = () =>
      shown.current?.id === id && shown.current.photos === list && shown.current.index === index;
    void fetch(photo.src, { method: 'HEAD', cache: 'no-store' })
      .then(async (r) => {
        if (r.status !== 404 || !still()) return;
        const info = await queryClient.fetchQuery({
          queryKey: ['album', id],
          queryFn: () => api.album(id),
          staleTime: 0,
        });
        const now = info.photos ?? [];
        const there = new Set(now.map((p) => p.name));
        // still in the folder: not gone — a file that isn't a picture (yet), one just added; left
        // as it is (review: the same photo put again asked again, round and round)
        if (there.has(photo.name) || now.length === 0 || !still()) return;
        // the screen moved on meanwhile (verses, black, hidden): nothing goes over it
        const s = liveSlideRef.current;
        if (!albumOnScreen(s, id) || (quiet && (s.blank || s.forceBlack || !s.visible))) return;
        noticeOnce(
          'album-gone',
          tr(
            'Фото «{name}» уже немає в папці — його перейменували чи видалили. Альбом прочитано знову.',
            {
              name: photo.name,
            },
          ),
          5000,
          'orange',
        );
        let k = index + dir;
        while (k >= 0 && k < list.length && !there.has(list[k].name)) k += dir;
        const to =
          k >= 0 && k < list.length
            ? now.findIndex((p) => p.name === list[k].name)
            : dir > 0
              ? now.length - 1
              : 0;
        put(id, now, Math.max(0, to), fit, quiet, dir);
      })
      .catch(() => {});
  };
  const showPhoto = (index: number, quiet = false, dir: 1 | -1 = 1) => {
    if (!album || !photos?.[index]) return;
    // an HEIC still converting (1.14.0-beta.2): the screen keeps what it shows; the photo goes up
    // once its view copy is made — converted first
    if (!photoReady(photos[index])) {
      waitFor.current = { id: album.id, name: photos[index].name, quiet, dir };
      setAlbum({ id: album.id, index, name: photos[index].name });
      setConvertNow((n) => n + 1);
      noticeOnce(
        'album-heic',
        tr('Фото «{name}» ще перетворюється — покажу, щойно буде готове.', {
          name: photos[index].name,
        }),
        3000,
        'cue',
      );
      return;
    }
    waitFor.current = null;
    // the photo on screen keeps its «Вписати / Заповнити» when it is this album's (a refit sticks)
    const now = liveSlideRef.current;
    const fit = (albumOnScreen(now, album.id) && now.picture?.fit) || readImageFit();
    put(album.id, photos, index, fit, quiet, dir);
  };

  /**
   * An album of the running order (1.8.12): open in «Зображення», its first photo on screen —
   * read from the folder now. When it can't be shown, the operator is told why and the result
   * says it in words a phone may get (the album's name, never the folder's path).
   */
  const startAlbum = async (
    id: string,
    fit: ImageFit,
    label: string,
  ): Promise<{ slide: Slide } | { reason: string }> => {
    if (!leaderRef.current) {
      standbyNotice();
      return { reason: tr('Показом керує інше вікно керування') };
    }
    shown.current = null;
    openAlbumsTab();
    setImagesOpen(true);
    setPlaying(false);
    setAlbum({ id, index: null });
    let info: AlbumInfo;
    try {
      info = await queryClient.fetchQuery({
        queryKey: ['album', id],
        queryFn: () => api.album(id),
        staleTime: 0,
      });
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
      return { reason: tr('Альбом прибрано: {name}', { name: label }) };
    }
    // the running order's marks («Папку не знайдено») follow what was just read
    void queryClient.invalidateQueries({ queryKey: ['albums'] });
    const list = info.photos ?? [];
    if (info.missing || list.length === 0) {
      notifications.show({
        message: info.missing
          ? unusableNotice('folder', info, info.path)
          : tr('В альбомі немає фото'),
        color: 'gray',
        autoClose: 3000,
      });
      return {
        reason: info.missing ? (unusable('folder', info, label) ?? '') : tr('В альбомі немає фото'),
      };
    }
    return { slide: put(id, list, 0, fit) };
  };

  /** `held`: a key held down (its repeats) — the next item takes a new press (1.10.6) */
  const step = (dir: 1 | -1, quiet = false, held = false): Outcome => {
    if (!album) return { ok: false };
    if (!leaderRef.current) return { ok: false, reason: tr('Показом керує інше вікно керування') };
    if (!photos) return { ok: false, reason: tr('Альбом ще завантажується') };
    if (photos.length === 0) return { ok: false, reason: tr('В альбомі немає фото') };
    const at = place();
    let idx = Math.max(0, Math.min(photos.length - 1, (at ?? -1) + dir));
    // the slideshow's own steps go past HEIC photos still converting (1.14.0-beta.2)
    if (quiet) while (idx > 0 && idx < photos.length - 1 && !photoReady(photos[idx])) idx += dir;
    if (at != null && idx === at) {
      // the running order's next / previous item (1.10.0-beta.1) — never from the slideshow
      const o = quiet
        ? null
        : pastItemRef.current?.(dir, { kind: 'album', albumId: album.id }, held);
      if (o) return o;
      return { ok: false, reason: dir > 0 ? tr('Це останнє фото') : tr('Це перше фото') };
    }
    showPhoto(idx, quiet, dir);
    return { ok: true };
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  /** a photo picked by hand (a tile): shown; a running slideshow goes on from it */
  const pickPhoto = (index: number) => {
    if (!leaderRef.current) return standbyNotice();
    showPhoto(index);
    setRestartAt((n) => n + 1);
  };

  // one notice for the album's edge, however long the key is held (1.10.6)
  const say = (o: Outcome) => {
    if (!o.ok && o.reason) noticeOnce('album-edge', o.reason, 2000);
  };

  // ← → / PageUp PageDown step the open album while the panel shows it (capture phase: the
  // verses' hotkeys don't fire too); a key ends «Міняти кожні N с»
  const owns = imagesOpen && albumsTab && !!album;
  useEffect(() => {
    if (!owns || keysPaused) return;
    const onKey = (e: KeyboardEvent) => {
      // a focused resize handle's arrows resize it; a field's move its caret («кожні N с»)
      if (isResizeKey(e) || isFormField(e.target)) return;
      // the arrows and «Далі / Назад», but not the running order's keys (1.8.12-beta.6)
      const dir = stepDirection(e, useSettings.getState().keymap);
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation();
      setPlaying(false);
      if (!leaderRef.current) return standbyNotice();
      say(stepRef.current(dir, false, e.repeat));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [owns, keysPaused, setPlaying, leaderRef]);

  // the clicker in an output window and the speakers' remotes: «Далі» / «Назад»
  useCommandHandler(
    (cmd, _source, args) => {
      if (cmd !== 'next' && cmd !== 'prev') return null;
      setPlaying(false);
      return stepRef.current(cmd === 'next' ? 1 : -1, false, args.held);
    },
    PRIORITY.song,
    owns,
  );

  // «Міняти кожні N с»: this window steps the album while it leads and the screen shows it — on a
  // worker's clock (1.10.1, the Mac's round: a fully covered window's own timers go 1/s, then 1/min
  // after five minutes, and the photos stopped changing)
  const albumId = album?.id ?? null;
  useEffect(() => {
    if (!playing || !isLeader || !albumId) return;
    return everyMs(every * 1000, () => {
      if (!playingRef.current || !leaderRef.current) return;
      const s = liveSlideRef.current;
      if (!albumOnScreen(s, albumId)) {
        setPlaying(false); // something else went on screen: the slideshow is over
        return;
      }
      if (s.blank || s.forceBlack || !s.visible) return; // hidden or black: it waits
      const o = stepRef.current(1, true);
      if (!o.ok) {
        setPlaying(false);
        if (o.reason) notifications.show({ message: o.reason, color: 'gray', autoClose: 2000 });
      }
    });
  }, [playing, isLeader, albumId, every, restartAt, liveSlideRef, leaderRef, setPlaying]);

  // a window on standby steps nothing: the leader's own timer, if any, goes on there
  useEffect(() => {
    if (!isLeader) setPlaying(false);
  }, [isLeader, setPlaying]);

  // small copies for the phones (beta.2): the leader draws the open album's missing ones, one at a
  // time, the photo on screen and the next two first; each photo once per window (a failure leaves
  // the phones the photo itself). `performance` keeps how long each took (w-album reads it).
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!isLeader || !albumId || !photos || serverAvailable === false || !canDrawSmall()) return;
    let stopped = false;
    const key = (name: string) => `${albumId}|${name}`;
    void (async () => {
      while (!stopped && canDrawSmall()) {
        const order = smallOrder(
          photos.length,
          currentRef.current,
          (i) => !!photos[i].needsSmall && !!photos[i].v && !tried.current.has(key(photos[i].name)),
        );
        if (order.length === 0) return;
        const p = photos[order[0]];
        tried.current.add(key(p.name));
        try {
          const started = performance.now();
          const copy = await drawSmall(p.src);
          await api.putAlbumSmall(albumId, p.name, p.v!, copy.blob);
          performance.measure('vo:album-small', {
            start: started,
            detail: { name: p.name, ms: copy.ms, from: copy.from, bytes: copy.blob.size },
          });
        } catch {
          /* the phones keep getting the photo itself */
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [isLeader, albumId, photos, serverAvailable]);

  // HEIC photos of the open album (1.14.0-beta.2, the author's Q15): the leader makes a view copy
  // of each in the HEIC worker — the one waited for first, then the photo on screen and the next
  // two, then the rest; each once per window. The album is read again after each, so it shows.
  const waitFor = useRef<{ id: string; name: string; quiet: boolean; dir: 1 | -1 } | null>(null);
  const [convertNow, setConvertNow] = useState(0);
  const converted = useRef(new Set<string>());
  const putRef = useRef(put);
  putRef.current = put;
  useEffect(() => {
    if (!isLeader || !albumId || !photos || serverAvailable === false) return;
    let stopped = false;
    const key = (name: string) => `${albumId}|${name}`;
    const due = (i: number) =>
      !photoReady(photos[i]) && !!photos[i].v && !converted.current.has(key(photos[i].name));
    void (async () => {
      while (!stopped) {
        const wanted = waitFor.current?.id === albumId ? waitFor.current.name : null;
        const w = wanted
          ? photos.findIndex((p) => p.name === wanted && due(photos.indexOf(p)))
          : -1;
        const order = w >= 0 ? [w] : smallOrder(photos.length, currentRef.current, due);
        if (order.length === 0) return;
        const p = photos[order[0]];
        converted.current.add(key(p.name));
        try {
          const raw = await api.albumRaw(albumId, p.name);
          const { blob } = await heicToJpeg(raw, 3840, 0.9);
          await api.putAlbumView(albumId, p.name, p.v!, blob);
        } catch {
          /* left as it is: the album says it still converts; a next opening tries again */
          continue;
        }
        if (stopped) return;
        const info = await queryClient
          .fetchQuery({
            queryKey: ['album', albumId],
            queryFn: () => api.album(albumId),
            staleTime: 0,
          })
          .catch(() => null);
        const wait = waitFor.current;
        const list = info?.photos ?? [];
        const at = list.findIndex((x) => x.name === wait?.name);
        if (wait && wait.id === albumId && at >= 0 && photoReady(list[at])) {
          waitFor.current = null;
          const now = liveSlideRef.current;
          const fit = (albumOnScreen(now, albumId) && now.picture?.fit) || readImageFit();
          putRef.current(albumId, list, at, fit, wait.quiet, wait.dir);
        }
        // the new listing restarts this loop with it
        return;
      }
    })();
    return () => {
      stopped = true;
    };
  }, [isLeader, albumId, photos, serverAvailable, convertNow, queryClient, liveSlideRef]);

  const setEvery = (n: number) => {
    const v = Math.max(EVERY_MIN, Math.min(EVERY_MAX, Math.round(n) || EVERY_MIN));
    setEveryState(v);
    try {
      localStorage.setItem(EVERY_KEY, String(v));
    } catch {
      /* a per-viewer convenience */
    }
  };

  /** «Міняти кожні N с» on: from the photo on screen, or the first one when none is shown yet */
  const play = () => {
    if (!leaderRef.current) return standbyNotice();
    if (!album || !photos || photos.length === 0) return;
    if (!albumOnScreen(liveSlideRef.current, album.id)) showPhoto(place() ?? 0);
    setPlaying(true);
  };

  return {
    album,
    albumInfo: query.data?.id === album?.id ? query.data : undefined,
    albumLoading: query.isLoading,
    albumError: query.error as Error | null,
    reloadAlbum: () => void query.refetch(),
    photos,
    current,
    openAlbum,
    startAlbum,
    pickPhoto,
    /** the panel's ← → buttons: a step by hand, as a key */
    stepBy: (dir: 1 | -1) => {
      setPlaying(false);
      if (!leaderRef.current) return standbyNotice();
      say(step(dir));
    },
    playing,
    play,
    pause: () => setPlaying(false),
    every,
    setEvery,
  };
}
