import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api } from '../../api';
import { type MediaTab } from '../../components/ImagesPanel';
import { droppedKind, readFolder, useDrop } from '../../lib/drop';
import { tr, trn } from '../../i18n';
import { importDocuments, useDocOpen } from '../../lib/documents';
import { addToBrowserLibrary } from '../../lib/browserLibrary';
import { effectiveSource } from '../../dataSourceStore';
import { NEEDS_SERVER } from '../../serverStore';

/**
 * Files and folders dropped anywhere on the control window (1.14.0-beta.1, the author's Q14):
 * pictures → «Зображення» (added as by «Додати…»), a folder → an album, found on disk by its name
 * and its files' sizes, a video → «Відео», found the same way; what is found nowhere opens the
 * folder picker. `dragging`: files are over the window (the overlay says what a drop does). A drop
 * a part of the page took itself (the library's modules in «Джерело даних») is left to it.
 * Since 1.17.1 (the user's ask: everything droppable anywhere, not only in the settings): a document
 * → «Документи», a module → the library (the server's modules/ and a rescan; without a server, this
 * browser's engine), a segment → this browser's engine, a presentation → «Пісні»'s import, another
 * copy's vectors.db → the vectors.
 */
export function useMediaDrop({
  openMedia,
  openDocs,
  openSongs,
  enabled,
  server,
}: {
  openMedia: (tab: MediaTab) => void;
  /** «Документи» (1.17.0-beta.1): a dropped .docx / .md / .txt / .pdf goes there */
  openDocs: () => void;
  /** «Пісні» (1.17.1): dropped presentations open its import */
  openSongs: () => void;
  /** the leading control window (a standby window or the desk adds nothing) */
  enabled: boolean;
  /** the app's server answers: pictures, videos, albums, documents, vectors need it */
  server: boolean;
}) {
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState(false);
  // the overlay goes when no dragover came for a moment: an enter / leave count stuck when a node
  // under the pointer went away mid-drag, or Esc ended the drag outside (review)
  const quiet = useRef(0);
  const live = useRef({ openMedia, openDocs, openSongs, enabled, server });
  live.current = { openMedia, openDocs, openSongs, enabled, server };

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
    const { openMedia, server } = live.current;
    const by = new Map<string, File[]>();
    const others: string[] = [];
    const folders: FileSystemDirectoryEntry[] = [];
    for (const { entry, file } of entries) {
      if (entry?.isDirectory) folders.push(entry as FileSystemDirectoryEntry);
      else if (file) {
        const kind = droppedKind(file);
        if (kind === 'other') others.push(file.name);
        else by.set(kind, [...(by.get(kind) ?? []), file]);
      }
    }
    const of = (kind: string) => by.get(kind) ?? [];
    if (others.length > 0)
      notifications.show({
        message: tr('Цього застосунок не бере — не додано: {names}', {
          names: others.slice(0, 3).join(', '),
        }),
        color: 'gray',
      });
    // what only the app's server keeps: said once, the rest goes on
    const serverOnly = [
      ...of('image'),
      ...of('video'),
      ...of('document'),
      ...of('song'),
      ...of('vectors'),
    ];
    if (!server && (serverOnly.length > 0 || folders.length > 0)) {
      notifications.show({
        message: `${tr(NEEDS_SERVER)} — ${[...serverOnly.map((f) => f.name), ...folders.map((d) => d.name)].slice(0, 3).join(', ')}`,
        color: 'orange',
      });
    }
    // a module or a segment: into the library (before the rest — a rescan takes a while)
    const modules = of('module');
    const segments = of('segment');
    // modules to the server's library when it serves the reads, else (and segments always) to
    // this browser's engine — once for all of them
    const toServer = server && effectiveSource() === 'server';
    const toBrowser = [...(toServer ? [] : modules), ...segments];
    if (toServer && modules.length > 0) await modulesToServer(modules);
    if (toBrowser.length > 0) await addToBrowserLibrary(toBrowser, queryClient);
    if (!server) return;
    if (of('song').length > 0) {
      useDrop.getState().addSongs(of('song'));
      live.current.openSongs();
    }
    if (of('image').length > 0) {
      useDrop.getState().addImages(of('image'));
      openMedia('images');
    }
    for (const dir of folders) await folderToAlbum(dir);
    for (const v of of('video')) await fileToVideo(v);
    if (of('document').length > 0) {
      live.current.openDocs();
      const last = await importDocuments(of('document'), queryClient);
      if (last != null) useDocOpen.getState().open(last);
    }
    for (const f of of('vectors')) await vectorsToServer(f);
  };

  /** Modules into the server's modules/ and the library's selection, then one rescan for them all. */
  const modulesToServer = async (files: File[]) => {
    const added: string[] = [];
    for (const f of files) {
      const id = notifications.show({
        message: tr('Додаю модуль {file}…', { file: f.name }),
        loading: true,
        autoClose: false,
      });
      try {
        const r = await api.importModule(f);
        if (!r.same) added.push(r.file);
        notifications.update({
          id,
          message: r.same
            ? tr('Модуль «{file}» уже є в modules/', { file: r.file })
            : tr('Модуль додано: {file}', { file: r.file }),
          color: r.same ? 'gray' : 'green',
          loading: false,
          autoClose: 3000,
        });
      } catch (e) {
        notifications.update({
          id,
          message: tr('Не вдалося додати «{file}»: {error}', {
            file: f.name,
            error: tr((e as Error).message),
          }),
          color: 'red',
          loading: false,
          autoClose: false,
        });
      }
    }
    if (added.length === 0) return;
    try {
      await api.rebuild();
      notifications.show({
        message: tr('Бібліотека перебудовується з новими модулями — це триває хвилину-дві.'),
        color: 'gray',
        autoClose: 5000,
      });
    } catch (e) {
      notifications.show({ message: tr((e as Error).message), color: 'red' });
    }
  };

  /** Another copy's vectors.db: the sets this copy lacks come in. */
  const vectorsToServer = async (file: File) => {
    try {
      const r = await api.importVectors(file);
      await queryClient.invalidateQueries({ queryKey: ['semantic'] });
      notifications.show({
        message:
          r.sets > 0
            ? trn(
                r.sets,
                'Вектори додано: {n} набір ({verses} віршів)|Вектори додано: {n} набори ({verses} віршів)|Вектори додано: {n} наборів ({verses} віршів)',
                { verses: r.verses },
              )
            : tr('Нових векторів у файлі немає — ці набори тут уже є'),
        color: r.sets > 0 ? 'green' : 'gray',
        autoClose: 4000,
      });
    } catch (e) {
      notifications.show({
        message: tr('Не вдалося додати вектори: {error}', { error: tr((e as Error).message) }),
        color: 'red',
      });
    }
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
