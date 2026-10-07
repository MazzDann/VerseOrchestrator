import { useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { type QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type SongStyle, type Translation } from '../../api';
import { type Appearance } from '../../settingsStore';
import {
  type SeqImage,
  type SeqItem,
  type SeqPassage,
  type SeqSong,
  stepIndex,
} from '../../playlistStore';
import {
  type Slide,
  type SlideLine,
  type SlidePicture,
  type SlideSource,
  type SlideStyle,
  type SlideTemplate,
} from '../../presenterBus';
import { findSong } from '../../lib/songLink';
import { tr } from '../../i18n';
import { joinVerses, redLetterSegments } from './slideText';

/**
 * The running order on screen («Послідовність показу»; out of usePlaylistActions and Control.tsx
 * before 1.10, where it leads the whole show): an item put on screen (a passage, a song's first
 * stanza, a text, a picture, an album's first photo, a video) and one step on or back —
 * `orderStep`, the one way the keys and a video's end take. No effects.
 */
export function useRunningOrder({
  setTranslations,
  selectBook,
  selectChapter,
  setSelectedVerses,
  setScrollTarget,
  queryClient,
  appearance,
  translations,
  slideStyle,
  slideTemplate,
  pushLive,
  setPreviewOverride,
  setLive,
  openSong,
  setSongsOpen,
  followItem,
  setSongsPanelStanza,
  playlistRelinkSong,
  projectText,
  projectPicture,
  pictureOf,
  startAlbum,
  startVideo,
  playlistSetCurrent,
  playlistItems,
  playlistCurrentId,
  playlistNextRef,
}: {
  setTranslations: (ids: number[]) => void;
  selectBook: (bookNumber: number) => void;
  selectChapter: (chapter: number) => void;
  setSelectedVerses: (verses: number[]) => void;
  setScrollTarget: (verse: number | null) => void;
  queryClient: QueryClient;
  appearance: Appearance;
  translations: Translation[];
  slideStyle: SlideStyle;
  slideTemplate: SlideTemplate | null;
  pushLive: (pushed: Slide, opts?: { audience?: boolean }) => void;
  setPreviewOverride: Dispatch<SetStateAction<Slide | null>>;
  setLive: (live: boolean) => void;
  openSong: (id: number | null) => void;
  setSongsOpen: (v: boolean | ((open: boolean) => boolean)) => void;
  /** the item's mode (1.8.12-beta.7): a passage — «Біблія», a text or a picture — «Медіа» */
  followItem: (kind: SeqItem['kind']) => void;
  setSongsPanelStanza: (stanza: number | null) => void;
  playlistRelinkSong: (oldId: number, label: string, newId: number, bundle?: string) => void;
  projectText: (
    text: string,
    reference: string,
    faithful?: SongStyle | null,
    source?: SlideSource,
    look?: SongStyle | null,
  ) => void;
  projectPicture: (picture: SlidePicture) => void;
  pictureOf: (it: SeqImage) => SlidePicture;
  startAlbum: (
    albumId: string,
    fit: SlidePicture['fit'],
    label: string,
  ) => Promise<{ slide: Slide } | { reason: string }>;
  startVideo: (
    videoId: string,
    fit: SlidePicture['fit'],
    label: string,
  ) => Promise<{ slide: Slide } | { reason: string }>;
  playlistSetCurrent: (id: string | null) => void;
  playlistItems: SeqItem[];
  playlistCurrentId: string | null;
  /** a video at its end goes on with the next item (useVideo: «Після кінця» → «Наступний елемент»); filled here */
  playlistNextRef: MutableRefObject<(() => boolean) | null>;
}) {
  // --- Presentation sequence (playlist) ---------------------------------------
  // Project a saved passage: set the selection (so the list/preview follow) and
  // push the slide directly from freshly-fetched verses (don't wait on the
  // selection-derived `slideLines`, which only updates on the next render/query).
  const activatePassage = async (it: SeqPassage) => {
    setTranslations(it.translationIds);
    selectBook(it.bookNumber);
    selectChapter(it.chapter);
    setSelectedVerses(it.verses);
    setScrollTarget(it.verses[0] ?? null);
    const lines: SlideLine[] = [];
    let total: number | undefined;
    for (const id of it.translationIds) {
      try {
        const verses = await queryClient.fetchQuery({
          queryKey: ['verses', id, it.bookNumber, it.chapter],
          queryFn: () => api.verses(id, it.bookNumber, it.chapter),
        });
        total ??= verses.length > 0 ? verses[verses.length - 1].verse : undefined;
        const text = joinVerses(verses, it.verses, appearance.showVerseNumbers);
        if (!text.trim()) continue;
        const t = translations.find((x) => x.id === id);
        const segments = redLetterSegments(verses, it.verses, appearance.showVerseNumbers);
        lines.push({ translationAbbr: t?.abbr ?? '', text, rtl: !!t?.rtl, segments });
      } catch {
        /* skip a translation that fails to load */
      }
    }
    if (lines.length === 0) {
      // Every translation failed to load (e.g. ids changed after a library rebuild).
      notifications.show({
        message: tr('Уривок недоступний — переклад змінився. Оновіть елемент показу.'),
        color: 'red',
        autoClose: 2500,
      });
      return;
    }
    pushLive({
      lines,
      reference: it.label,
      blank: false,
      visible: true,
      style: slideStyle,
      template: slideTemplate,
      source: {
        kind: 'verses',
        translationIds: it.translationIds,
        bookNumber: it.bookNumber,
        chapter: it.chapter,
        verses: it.verses,
        page: 0,
        reveal: 1,
        // «вірш 16 з 36» on «Сцена» (1.9.0-beta.11): the first translation's last verse
        ...(total ? { total } : {}),
      },
    });
    setPreviewOverride(null);
    setLive(true);
  };

  // Open a saved song in the Songs panel and project its first stanza; further
  // stanzas are stepped with the arrows inside the panel (existing behaviour).
  const activateSong = async (it: SeqSong) => {
    openSong(it.songId);
    setSongsOpen(true);
    try {
      // by its id — or by its label when the id changed (song bundles, 0.10.0)
      const s = await findSong(it.songId, it.label, it.bundle, {
        song: (id) =>
          queryClient.fetchQuery({ queryKey: ['song', id], queryFn: () => api.song(id) }),
        search: (q) => api.songs(q),
      });
      if (!s) return;
      if (s.id !== it.songId) {
        playlistRelinkSong(it.songId, it.label, s.id, s.bundle);
        openSong(s.id);
      }
      if (s.slides.length > 0) {
        projectText(
          s.slides[0].text,
          `№${s.number ?? ''} ${s.title}`.trim(),
          it.faithful ? s.slides[0].style : null,
          { kind: 'song', songId: s.id, stanza: 0, total: s.slides.length },
          s.slides[0].style,
        );
        // Seed the panel's stanza highlight to 0 so the first arrow/clicker advances
        // to stanza 1 (not re-projects the title we just put on screen).
        setSongsPanelStanza(0);
      }
    } catch {
      /* ignore a song that fails to load */
    }
  };

  const activateItem = (it: SeqItem) => {
    // an item a newer version added (1.9.1): it stays in the list, nothing goes on screen
    if (it.kind === 'foreign') {
      notifications.show({
        message: tr(
          'Цей пункт додала новіша версія застосунку — оновіть застосунок, щоб показати його',
        ),
        color: 'gray',
        autoClose: 3000,
      });
      return;
    }
    playlistSetCurrent(it.id);
    followItem(it.kind);
    if (it.kind === 'passage') void activatePassage(it);
    else if (it.kind === 'text') projectText(it.body, it.title.trim());
    else if (it.kind === 'image') projectPicture(pictureOf(it));
    else if (it.kind === 'album') void startAlbum(it.albumId, it.fit, it.label);
    else if (it.kind === 'video') void startVideo(it.videoId, it.fit, it.label);
    else if (it.kind === 'song') void activateSong(it);
  };

  // one item on (or back), over items of a newer version; at an end the edge item again
  const stepPlaylist = (delta: 1 | -1) => {
    const at = playlistItems.findIndex((i) => i.id === playlistCurrentId);
    const next = stepIndex(playlistItems, playlistCurrentId, delta) ?? (at >= 0 ? at : null);
    if (next != null) activateItem(playlistItems[next]);
  };

  /**
   * One item on or back over the playable ones (1.9.1). `key` (Shift+PageDown / PageUp,
   * 1.8.12-beta.6): at an end, or with nothing to show, says why nothing moved. `end` (a video's
   * end, 1.8.12-beta.3): only on from an item of the order, silently. Says whether it moved.
   */
  const orderStep = (delta: 1 | -1, why: 'key' | 'end'): boolean => {
    const at = playlistItems.findIndex((i) => i.id === playlistCurrentId);
    const to = stepIndex(playlistItems, playlistCurrentId, delta);
    if (why === 'end') {
      if (at < 0 || to == null) return false;
      stepPlaylist(delta);
      return true;
    }
    const say = (message: string) => {
      notifications.show({ message, color: 'gray', autoClose: 2000 });
      return false;
    };
    if (playlistItems.length === 0)
      return say(tr('Послідовність показу порожня — додавайте елементи кнопкою «+ у показ»'));
    // nothing further that can go on screen (items of a newer version are passed over, 1.9.1)
    if (to == null) {
      const beyond = at >= 0 && at + delta >= 0 && at + delta < playlistItems.length;
      return say(
        at < 0
          ? tr('У послідовності лише пункти новішої версії — оновіть застосунок, щоб показати їх')
          : beyond
            ? delta > 0
              ? tr('Далі лише пункти новішої версії — оновіть застосунок, щоб показати їх')
              : tr('Перед ним лише пункти новішої версії — оновіть застосунок, щоб показати їх')
            : delta > 0
              ? tr('Це останній елемент показу')
              : tr('Це перший елемент показу'),
      );
    }
    stepPlaylist(delta);
    return true;
  };
  // the keys (useControlHotkeys freezes its callbacks) and a video's end (useVideo) read refs
  const playlistStepRef = useRef<(delta: 1 | -1) => void>(() => {});
  playlistStepRef.current = (delta) => void orderStep(delta, 'key');
  playlistNextRef.current = () => orderStep(1, 'end');
  return { activatePassage, activateItem, stepPlaylist, orderStep, playlistStepRef };
}
