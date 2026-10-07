import { notifications } from '@mantine/notifications';
import { type NewSeqItem } from '../../playlistStore';
import { type SlidePicture } from '../../presenterBus';
import { tr } from '../../i18n';

/**
 * Adding to the running order («+ у показ»): the verse selection, a song, an album, a video, a
 * text. Putting its items on screen and stepping through them: useRunningOrder. No effects.
 */
export function usePlaylistActions({
  playlistAdd,
  selectedIds,
  bookNumber,
  chapter,
  selectedVerses,
  reference,
  referenceShort,
}: {
  playlistAdd: (item: NewSeqItem) => void;
  selectedIds: number[];
  bookNumber: number | null;
  chapter: number | null;
  selectedVerses: number[];
  reference: string;
  referenceShort: string;
}) {
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
    addCurrentPassage,
    addSongToPlaylist,
    addAlbumToPlaylist,
    addVideoToPlaylist,
    addTextToPlaylist,
  };
}
