import { type Dispatch, type SetStateAction } from 'react';
import { type QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api, type SongStyle, type Translation } from '../../api';
import { type Appearance } from '../../settingsStore';
import {
  type NewSeqItem,
  type SeqImage,
  type SeqItem,
  type SeqPassage,
  type SeqSong,
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
 * The running order's actions («Послідовність показу»): an item put on screen (a passage, a
 * song's first stanza, a text, a picture, an album's first photo), a step through the list, and
 * adding to it. No effects.
 */
export function usePlaylistActions({
  followItem,
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
  playlistAdd,
  selectedIds,
  bookNumber,
  chapter,
  selectedVerses,
  reference,
  referenceShort,
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
  playlistAdd: (item: NewSeqItem) => void;
  selectedIds: number[];
  bookNumber: number | null;
  chapter: number | null;
  selectedVerses: number[];
  reference: string;
  referenceShort: string;
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
    for (const id of it.translationIds) {
      try {
        const verses = await queryClient.fetchQuery({
          queryKey: ['verses', id, it.bookNumber, it.chapter],
          queryFn: () => api.verses(id, it.bookNumber, it.chapter),
        });
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
    playlistSetCurrent(it.id);
    followItem(it.kind);
    if (it.kind === 'passage') void activatePassage(it);
    else if (it.kind === 'text') projectText(it.body, it.title.trim());
    else if (it.kind === 'image') projectPicture(pictureOf(it));
    else if (it.kind === 'album') void startAlbum(it.albumId, it.fit, it.label);
    else if (it.kind === 'video') void startVideo(it.videoId, it.fit, it.label);
    else void activateSong(it);
  };

  const stepPlaylist = (delta: 1 | -1) => {
    if (playlistItems.length === 0) return;
    const idx = playlistItems.findIndex((i) => i.id === playlistCurrentId);
    const next =
      idx < 0
        ? delta > 0
          ? 0
          : playlistItems.length - 1
        : Math.min(playlistItems.length - 1, Math.max(0, idx + delta));
    activateItem(playlistItems[next]);
  };

  const addCurrentPassage = () => {
    if (
      selectedIds.length === 0 ||
      bookNumber == null ||
      chapter == null ||
      selectedVerses.length === 0
    )
      return;
    playlistAdd({
      kind: 'passage',
      label: reference || referenceShort || tr('Уривок'),
      translationIds: selectedIds,
      bookNumber,
      chapter,
      verses: selectedVerses,
    });
    notifications.show({
      message: tr('Додано у показ: {item}', { item: referenceShort || reference }),
      color: 'green',
      autoClose: 1200,
    });
  };

  const addSongToPlaylist = (song: {
    songId: number;
    label: string;
    bundle: string;
    faithful: boolean;
  }) => {
    playlistAdd({
      kind: 'song',
      label: song.label || tr('Пісня'),
      songId: song.songId,
      ...(song.bundle ? { bundle: song.bundle } : {}),
      faithful: song.faithful,
    });
    notifications.show({
      message: tr('Додано у показ: {item}', { item: song.label }),
      color: 'green',
      autoClose: 1200,
    });
  };

  const addAlbumToPlaylist = (album: { id: string; name: string }, fit: SlidePicture['fit']) => {
    playlistAdd({ kind: 'album', label: album.name, albumId: album.id, fit });
    notifications.show({
      message: tr('Додано у показ: {item}', { item: album.name }),
      color: 'green',
      autoClose: 1200,
    });
  };

  const addVideoToPlaylist = (video: { id: string; name: string }, fit: SlidePicture['fit']) => {
    playlistAdd({ kind: 'video', label: video.name, videoId: video.id, fit });
    notifications.show({
      message: tr('Додано у показ: {item}', { item: video.name }),
      color: 'green',
      autoClose: 1200,
    });
  };

  const addTextToPlaylist = (item: { title: string; body: string }) => {
    if (!item.body.trim()) return;
    const label = item.title.trim() || item.body.trim().split('\n')[0].slice(0, 40);
    playlistAdd({ kind: 'text', label, title: item.title, body: item.body });
    notifications.show({ message: tr('Текст додано у показ'), color: 'green', autoClose: 1200 });
  };
  return {
    activatePassage,
    activateSong,
    activateItem,
    stepPlaylist,
    addCurrentPassage,
    addSongToPlaylist,
    addAlbumToPlaylist,
    addVideoToPlaylist,
    addTextToPlaylist,
  };
}
