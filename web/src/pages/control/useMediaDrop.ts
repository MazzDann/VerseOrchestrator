import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api } from '../../api';
import { type MediaTab } from '../../components/ImagesPanel';
import { droppedKind, readFolder, useDrop } from '../../lib/drop';
import { tr, trn } from '../../i18n';

/**
 * Files and folders dropped anywhere on the control window (1.14.0-beta.1, the author's Q14):
 * pictures → «Зображення» (added as by «Додати…»), a folder → an album, found on disk by its name
 * and its files' sizes, a video → «Відео», found the same way; what is found nowhere opens the
 * folder picker. `dragging`: files are over the window (the overlay says what a drop does). A drop
 * a part of the page took itself (the library's modules in «Джерело даних») is left to it.
 */
export function useMediaDrop({
  openMedia,
  enabled,
}: {
  openMedia: (tab: MediaTab) => void;
  /** the leading control window with its server (a standby window or the desk adds nothing) */
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState(false);
  // the overlay goes when no dragover came for a moment: an enter / leave count stuck when a node
  // under the pointer went away mid-drag, or Esc ended the drag outside (review)
  const quiet = useRef(0);
  const live = useRef({ openMedia, enabled });
  live.current = { openMedia, enabled };

  useEffect(() => {
    const files = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const hide = () => {
      window.clearTimeout(quiet.current);
      setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (!files(e) || !live.current.enabled) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setDragging(true);
      window.clearTimeout(quiet.current);
      quiet.current = window.setTimeout(hide, 400);
    };
    // the pointer left the window: at once
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) hide();
    };
    const drop = (e: DragEvent) => {
      hide();
      if (!files(e) || e.defaultPrevented || !live.current.enabled) return;
      e.preventDefault();
      // the entries now: the drop's items are gone once the handler returns
      const entries = [...(e.dataTransfer?.items ?? [])]
        .filter((i) => i.kind === 'file')
        .map((i) => ({ entry: i.webkitGetAsEntry?.() ?? null, file: i.getAsFile() }));
      void take(entries);
    };
    window.addEventListener('dragenter', over);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('dragend', hide);
    return () => {
      window.removeEventListener('dragenter', over);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      window.removeEventListener('dragend', hide);
      window.clearTimeout(quiet.current);
    };
    // the handlers read the props through a ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const take = async (entries: { entry: FileSystemEntry | null; file: File | null }[]) => {
    const { openMedia } = live.current;
    const images: File[] = [];
    const videos: File[] = [];
    const others: string[] = [];
    const folders: FileSystemDirectoryEntry[] = [];
    for (const { entry, file } of entries) {
      if (entry?.isDirectory) folders.push(entry as FileSystemDirectoryEntry);
      else if (file) {
        const kind = droppedKind(file);
        if (kind === 'image') images.push(file);
        else if (kind === 'video') videos.push(file);
        else others.push(file.name);
      }
    }
    if (others.length > 0)
      notifications.show({
        message: tr('Не зображення й не відео — не додано: {names}', {
          names: others.slice(0, 3).join(', '),
        }),
        color: 'gray',
      });
    if (images.length > 0) {
      useDrop.getState().addImages(images);
      openMedia('images');
    }
    for (const dir of folders) await folderToAlbum(dir);
    for (const v of videos) await fileToVideo(v);
  };

  const folderToAlbum = async (dir: FileSystemDirectoryEntry) => {
    const { openMedia } = live.current;
    openMedia('albums');
    try {
      const folder = await readFolder(dir);
      if (folder.files.length === 0) {
        notifications.show({ message: tr('Папка «{name}» порожня', { name: folder.name }) });
        return;
      }
      const { found } = await api.locateAlbum(folder.name, folder.files);
      if (found.length === 1) {
        const album = await api.addAlbum(found[0]);
        await queryClient.invalidateQueries({ queryKey: ['albums'] });
        notifications.show({
          message: tr('Альбом додано: {name}', { name: album.name }),
          color: 'green',
          autoClose: 2000,
        });
        return;
      }
      notifications.show({
        message:
          found.length === 0
            ? tr('Папку «{name}» не знайдено на диску — виберіть її.', { name: folder.name })
            : trn(
                found.length,
                'Знайдено {n} папку «{name}» — виберіть потрібну.|Знайдено {n} папки «{name}» — виберіть потрібну.|Знайдено {n} папок «{name}» — виберіть потрібну.',
                { name: folder.name },
              ),
        color: 'cue',
      });
      useDrop.getState().openPicker('album', found[0]);
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося додати альбом: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    }
  };

  const fileToVideo = async (file: File) => {
    const { openMedia } = live.current;
    openMedia('videos');
    try {
      // a name and a size alone: added at once only when the search looked everywhere (review)
      const { found, complete } = await api.locateVideo(file.name, file.size);
      if (found.length === 1 && complete) {
        const video = await api.addVideo(found[0]);
        await queryClient.invalidateQueries({ queryKey: ['videos'] });
        notifications.show({
          message: tr('Відео додано: {name}', { name: video.name }),
          color: 'green',
          autoClose: 2000,
        });
        return;
      }
      notifications.show({
        message: tr('Відео «{name}» не знайдено на диску — виберіть його.', { name: file.name }),
        color: 'cue',
      });
      useDrop.getState().openPicker('video', found[0]);
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося додати відео: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    }
  };

  return { dragging };
}
