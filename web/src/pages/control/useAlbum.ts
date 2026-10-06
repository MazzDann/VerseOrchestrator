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
import { albumSlide, photoIndex, type AlbumPhoto } from '../../lib/album';
import { readImageFit, type ImageFit } from '../../lib/imageFit';
import { PRIORITY, useCommandHandler, type Outcome } from '../../lib/commands';
import { isFormField, isResizeKey } from '../../lib/keyScroll';
import { tr } from '../../i18n';

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
 * Effects, in order: the album's keys (capture phase, ahead of the hotkeys), its commands, the
 * timer, the timer's end on standby. None of them depends on another hook's effects.
 */
export function useAlbum({
  slideStyle,
  pushLive,
  setPreviewOverride,
  setLive,
  liveSlideRef,
  isLeader,
  imagesOpen,
  setImagesOpen,
  keysPaused,
  serverAvailable,
}: {
  slideStyle: SlideStyle;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
  setLive: (live: boolean) => void;
  liveSlideRef: MutableRefObject<Slide>;
  isLeader: boolean;
  imagesOpen: boolean;
  setImagesOpen: (v: boolean | ((open: boolean) => boolean)) => void;
  keysPaused: boolean;
  serverAvailable: boolean | null;
}) {
  const queryClient = useQueryClient();
  const [album, setAlbum] = useState<OpenAlbum | null>(null);
  /** «Альбоми» shown in «Зображення» (not its pictures): only then the album owns the keys */
  const [albumsTab, setAlbumsTab] = useState(false);
  const [playing, setPlaying] = useState(false);
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

  const openAlbum = useCallback((id: string | null, at?: { index: number; name?: string }) => {
    setAlbum(id ? { id, index: at?.index ?? null, name: at?.name } : null);
    if (id) setAlbumsTab(true);
    setPlaying(false);
  }, []);

  // the photo shown last, before the render that says so: two quick presses step twice
  const shown = useRef<{ id: string; photos: unknown; index: number } | null>(null);
  const place = () => {
    const s = shown.current;
    return album && s && s.id === album.id && s.photos === photos ? s.index : current;
  };

  const put = (id: string, list: AlbumPhoto[], index: number, fit: ImageFit) => {
    shown.current = { id, photos: list, index };
    const slide = albumSlide(id, list, index, fit, slideStyle);
    pushLive(slide);
    setPreviewOverride(slide);
    setLive(true);
    setAlbum({ id, index, name: list[index].name });
    return slide;
  };
  const showPhoto = (index: number) => {
    if (!album || !photos?.[index]) return;
    // the photo on screen keeps its «Вписати / Заповнити» when it is this album's (a refit sticks)
    const now = liveSlideRef.current;
    const fit = (albumOnScreen(now, album.id) && now.picture?.fit) || readImageFit();
    put(album.id, photos, index, fit);
  };

  /**
   * An album of the running order (1.8.12): open in «Зображення», its first photo on screen —
   * read from the folder now. Null, and the reason said, when it can't be shown.
   */
  const startAlbum = async (id: string, fit: ImageFit): Promise<Slide | null> => {
    setAlbumsTab(true);
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
      return null;
    }
    const list = info.photos ?? [];
    if (info.missing || list.length === 0) {
      notifications.show({
        message: info.missing
          ? tr('Папку не знайдено: {path}', { path: info.path })
          : tr('В альбомі немає фото'),
        color: 'gray',
        autoClose: 3000,
      });
      return null;
    }
    return put(id, list, 0, fit);
  };

  const step = (dir: 1 | -1): Outcome => {
    if (!album) return { ok: false };
    if (!photos) return { ok: false, reason: tr('Альбом ще завантажується') };
    if (photos.length === 0) return { ok: false, reason: tr('В альбомі немає фото') };
    const at = place();
    const idx = Math.max(0, Math.min(photos.length - 1, (at ?? -1) + dir));
    if (at != null && idx === at)
      return { ok: false, reason: dir > 0 ? tr('Це останнє фото') : tr('Це перше фото') };
    showPhoto(idx);
    return { ok: true };
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  /** a photo picked by hand (a tile): shown; a running slideshow goes on from it */
  const pickPhoto = (index: number) => {
    showPhoto(index);
    setRestartAt((n) => n + 1);
  };

  const say = (o: Outcome) => {
    if (!o.ok && o.reason)
      notifications.show({ message: o.reason, color: 'gray', autoClose: 2000 });
  };

  // ← → / PageUp PageDown step the open album while the panel shows it (capture phase: the
  // verses' hotkeys don't fire too); a key ends «Міняти кожні N с»
  const owns = imagesOpen && albumsTab && !!album;
  useEffect(() => {
    if (!owns || keysPaused) return;
    const onKey = (e: KeyboardEvent) => {
      // a focused resize handle's arrows resize it; a field's move its caret («кожні N с»)
      if (isResizeKey(e) || isFormField(e.target)) return;
      const dir = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)
        ? 1
        : ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)
          ? -1
          : 0;
      if (!dir || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      setPlaying(false);
      say(stepRef.current(dir));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [owns, keysPaused]);

  // the clicker in an output window and the speakers' remotes: «Далі» / «Назад»
  useCommandHandler(
    (cmd) => {
      if (cmd !== 'next' && cmd !== 'prev') return null;
      setPlaying(false);
      return stepRef.current(cmd === 'next' ? 1 : -1);
    },
    PRIORITY.song,
    owns,
  );

  // «Міняти кожні N с»: this window steps the album while it leads and the screen shows it
  const albumId = album?.id ?? null;
  useEffect(() => {
    if (!playing || !isLeader || !albumId) return;
    const t = window.setInterval(() => {
      const s = liveSlideRef.current;
      if (!albumOnScreen(s, albumId)) {
        setPlaying(false); // something else went on screen: the slideshow is over
        return;
      }
      if (s.blank || s.forceBlack || !s.visible) return; // hidden or black: it waits
      const o = stepRef.current(1);
      if (!o.ok) {
        setPlaying(false);
        if (o.reason) notifications.show({ message: o.reason, color: 'gray', autoClose: 2000 });
      }
    }, every * 1000);
    return () => window.clearInterval(t);
  }, [playing, isLeader, albumId, every, restartAt, liveSlideRef]);

  // a window on standby steps nothing: the leader's own timer, if any, goes on there
  useEffect(() => {
    if (!isLeader) setPlaying(false);
  }, [isLeader]);

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
    if (!album || !photos || photos.length === 0) return;
    if (!albumOnScreen(liveSlideRef.current, album.id)) showPhoto(place() ?? 0);
    setPlaying(true);
  };

  return {
    albumsTab,
    setAlbumsTab,
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
      say(step(dir));
    },
    playing,
    play,
    pause: () => setPlaying(false),
    every,
    setEvery,
  };
}
