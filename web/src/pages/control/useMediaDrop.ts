import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { api } from '../../api';
import { type MediaTab } from '../../components/ImagesPanel';
import { droppedKind, readFolder, useDrop } from '../../lib/drop';
import { tr, trn } from '../../i18n';
import {
  importDocuments,
  isConvertedDocument,
  isConvertedSong,
  loadConvertKinds,
  useDocOpen,
} from '../../lib/documents';
import { addToBrowserLibrary } from '../../lib/browserLibrary';
import { effectiveSource } from '../../dataSourceStore';
import { NEEDS_SERVER } from '../../serverStore';
import { fileToPicture } from '../../lib/image';
import { readImageFit } from '../../lib/imageFit';
import { usePlaylist, type NewSeqItem } from '../../playlistStore';
import { fileFromAddress, imageAddressOf, looksLikeAddress } from '../../lib/webImage';
import { isFormField } from '../../lib/keyScroll';

/** The running order under the monitors («Показ», ShowList) marks itself a drop zone (1.18.2). */
const zoneOf = (e: DragEvent): 'order' | null =>
  e.target instanceof Element && e.target.closest('[data-drop-zone="order"]') ? 'order' : null;

/** A document's title: its file's name without the folder and the extension (as the library has it). */
const titleOf = (file: string) => (file.split('/').pop() ?? file).replace(/\.[^.]+$/, '') || file;

/**
 * Files and folders dropped anywhere on the control window (1.14.0-beta.1, the author's Q14):
 * pictures → «Зображення» (added as by «Додати…»), a folder → an album, found on disk by its name
 * and its files' sizes, a video → «Відео», found the same way; what is found nowhere opens the
 * folder picker. `dragging`: files are over the window (the overlay says what a drop does). A drop
 * a part of the page took itself (the library's modules in «Джерело даних») is left to it.
 * Since 1.17.1 (the user's ask: everything droppable anywhere, not only in the settings): a document
 * → «Документи», a module → the library (the server's modules/ and a rescan; without a server, this
 * browser's engine), a segment → this browser's engine, a presentation → «Презентації»'s import, another
 * copy's vectors.db → the vectors.
 * Since 1.19.0-beta.3 (the users' F1017-16): a picture dragged from a web page (its address — the
 * server fetches it) and a picture pasted with Ctrl+V (copied, or its address) are added the same way.
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
  /** «Презентації» (1.17.1): dropped presentations open its import */
  openSongs: () => void;
  /** the leading control window (a standby window or the desk adds nothing) */
  enabled: boolean;
  /** the app's server answers: pictures, videos, albums, documents, vectors need it */
  server: boolean;
}) {
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState(false);
  /** over the running order («Показ», 1.18.2): a drop there goes next in it */
  const [zone, setZone] = useState<'order' | null>(null);
  // the overlay goes when no dragover came for a moment: an enter / leave count stuck when a node
  // under the pointer went away mid-drag, or Esc ended the drag outside (review)
  const quiet = useRef(0);
  const live = useRef({ openMedia, openDocs, openSongs, enabled, server });
  live.current = { openMedia, openDocs, openSongs, enabled, server };

  useEffect(() => {
    // a drag that started in this page (a row, a tile) is not something brought in
    let inside = false;
    const started = () => {
      inside = true;
    };
    // after the drop's own handlers have read it (a capture listener runs first — review); a mouse move
    // means no drag is on (none fires during one): a drag whose node went away mid-way left it set
    const ended = () => {
      window.setTimeout(() => {
        inside = false;
      }, 0);
    };
    const moved = () => {
      inside = false;
    };
    /** files, or a picture from a web page (an address — 1.19.0-beta.3) */
    const files = (e: DragEvent) => {
      const types = e.dataTransfer?.types ?? [];
      return types.includes('Files') || (!inside && types.includes('text/uri-list'));
    };
    const hide = () => {
      window.clearTimeout(quiet.current);
      setDragging(false);
      setZone(null);
    };
    const over = (e: DragEvent) => {
      if (!files(e)) return;
      // a window not in charge takes nothing — but never lets the browser (or the desktop app)
      // open the file in its place (F1017-03)
      e.preventDefault();
      if (!live.current.enabled) {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
        return;
      }
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setDragging(true);
      setZone(zoneOf(e));
      window.clearTimeout(quiet.current);
      quiet.current = window.setTimeout(hide, 400);
    };
    // the pointer left the window: at once
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) hide();
    };
    const drop = (e: DragEvent) => {
      hide();
      if (!files(e) || e.defaultPrevented) return;
      e.preventDefault();
      if (!live.current.enabled) return;
      // the entries now: the drop's items are gone once the handler returns
      const entries = [...(e.dataTransfer?.items ?? [])]
        .filter((i) => i.kind === 'file')
        .map((i) => ({ entry: i.webkitGetAsEntry?.() ?? null, file: i.getAsFile() }));
      const address =
        entries.length === 0 && e.dataTransfer ? imageAddressOf(e.dataTransfer) : null;
      if (address) void fromAddress(address, zoneOf(e) === 'order');
      else void take(entries, zoneOf(e) === 'order');
    };
    // Ctrl+V (1.19.0-beta.3): a copied picture, or a picture's address — not where a field takes the text
    const paste = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      if (!data || e.defaultPrevented || !live.current.enabled) return;
      const field = isFormField(e.target);
      const pictures = [...data.files].filter((f) => f.type.startsWith('image/'));
      if (pictures.length > 0 && (!field || !data.types.includes('text/plain'))) {
        e.preventDefault();
        void take(pictures.map((file) => ({ entry: null, file })));
        return;
      }
      const text = data.getData('text/plain');
      if (field || !looksLikeAddress(text)) return;
      e.preventDefault();
      void fromAddress(text.trim());
    };
    window.addEventListener('dragstart', started);
    window.addEventListener('dragend', ended);
    window.addEventListener('drop', ended, true);
    window.addEventListener('mousemove', moved, { passive: true });
    window.addEventListener('paste', paste);
    window.addEventListener('dragenter', over);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    window.addEventListener('dragend', hide);
    return () => {
      window.removeEventListener('dragstart', started);
      window.removeEventListener('dragend', ended);
      window.removeEventListener('drop', ended, true);
      window.removeEventListener('mousemove', moved);
      window.removeEventListener('paste', paste);
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

  /** A picture at an address (a web page's, a pasted one): fetched, then added as a dropped file. */
  const fromAddress = async (address: string, next = false) => {
    if (!live.current.server) {
      notifications.show({ message: tr(NEEDS_SERVER), color: 'orange' });
      return;
    }
    notifications.show({
      id: 'vo-web-image',
      message: tr('Завантажую зображення з інтернету…'),
      color: 'gray',
      loading: true,
      autoClose: false,
    });
    try {
      const file = await fileFromAddress(address);
      notifications.hide('vo-web-image');
      await take([{ entry: null, file }], next);
    } catch (e) {
      notifications.hide('vo-web-image');
      // a link dragged in that is no picture is a slip, not a failure: said, not alarmed (review)
      notifications.show({ message: tr((e as Error).message), color: 'orange' });
    }
  };

  /**
   * `next` (1.18.2, the user's ask): dropped on «Показ» — each one, added as before, also goes
   * right after the item on screen, in the order dropped; the view stays where the show is.
   */
  const take = async (
    entries: { entry: FileSystemEntry | null; file: File | null }[],
    next = false,
  ) => {
    const { openMedia, server } = live.current;
    // each one kept with its place in the drop: the running order gets them as dropped (review)
    const queue: { at: number; item: NewSeqItem }[] = [];
    const place = new Map<File | FileSystemEntry, number>();
    entries.forEach(({ entry, file }, i) => {
      if (file) place.set(file, i);
      if (entry) place.set(entry, i);
    });
    const at = (x: File | FileSystemEntry) => place.get(x) ?? entries.length;
    const by = new Map<string, File[]>();
    const others: string[] = [];
    const folders: FileSystemDirectoryEntry[] = [];
    // a Mac's own formats (convert.ts): a document (.pages, .rtf, .doc …) goes as it is, the
    // server reads it into the library; a Keynote file becomes a .pptx for «Презентації» first
    if (server) await loadConvertKinds();
    for (const { entry, file: dropped } of entries) {
      if (entry?.isDirectory) folders.push(entry as FileSystemDirectoryEntry);
      else if (dropped) {
        let file = dropped;
        if (isConvertedDocument(file.name)) {
          by.set('document', [...(by.get('document') ?? []), file]);
          continue;
        }
        if (isConvertedSong(file.name))
          try {
            notifications.show({
              message: tr('Перетворюю «{file}»…', { file: file.name }),
              color: 'gray',
              autoClose: 2500,
            });
            file = await api.convertFile(file);
          } catch (e) {
            notifications.show({ message: tr((e as Error).message), color: 'red' });
            continue;
          }
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
      // a presentation needs its bundle chosen in the import: added to the running order from there
      if (next)
        notifications.show({
          message: tr(
            'Файл .pptx — у «Презентації»: виберіть збірку, а тоді додайте пісню у показ',
          ),
          color: 'gray',
          autoClose: 5000,
        });
    }
    if (of('image').length > 0) {
      if (next) queue.push(...(await imagesForOrder(of('image'), at)));
      else {
        useDrop.getState().addImages(of('image'));
        openMedia('images');
      }
    }
    const fit = readImageFit();
    for (const dir of folders) {
      const album = await folderToAlbum(dir, next);
      if (next && album)
        queue.push({
          at: at(dir),
          item: { kind: 'album', label: album.name, albumId: album.id, fit },
        });
    }
    for (const v of of('video')) {
      const video = await fileToVideo(v, next);
      if (next && video)
        queue.push({
          at: at(v),
          item: { kind: 'video', label: video.name, videoId: video.id, fit },
        });
    }
    if (of('document').length > 0) {
      if (!next) live.current.openDocs();
      const docs = new Set<number>();
      const last = await importDocuments(of('document'), queryClient, (d, from) => {
        // the same document twice in one drop: once (review)
        if (!next || docs.has(d.id)) return;
        docs.add(d.id);
        queue.push({
          at: at(from),
          item: { kind: 'doc', label: titleOf(d.file), docId: d.id, file: d.file },
        });
      });
      if (last != null && !next) useDocOpen.getState().open(last);
    }
    for (const f of of('vectors')) await vectorsToServer(f);
    if (queue.length > 0) {
      const items = queue.sort((a, b) => a.at - b.at).map((q) => q.item);
      usePlaylist.getState().addNext(items);
      notifications.show({
        message: tr('Наступним у показі: {items}', {
          items: items
            .slice(0, 3)
            .map((q) => q.label)
            .join(', ')
            .concat(items.length > 3 ? ` +${items.length - 3}` : ''),
        }),
        color: 'green',
        autoClose: 2500,
      });
    }
  };

  /** Pictures for the running order: kept as by «Додати…», each one a picture item. */
  const imagesForOrder = async (
    files: File[],
    at: (f: File) => number,
  ): Promise<{ at: number; item: NewSeqItem }[]> => {
    const fit = readImageFit();
    const items: { at: number; item: NewSeqItem }[] = [];
    const id = notifications.show({
      message: tr('Додаю зображення…'),
      loading: true,
      autoClose: false,
    });
    for (const file of files)
      try {
        const img = await api.addImage(await fileToPicture(file));
        items.push({
          at: at(file),
          item: {
            kind: 'image',
            label: img.name,
            imageId: img.id,
            src: img.src,
            small: img.small,
            fit,
          },
        });
      } catch (e) {
        notifications.show({
          message: tr('Не вдалося додати «{file}»: {error}', {
            file: file.name,
            error: tr((e as Error).message),
          }),
          color: 'red',
        });
      }
    notifications.hide(id);
    await queryClient.invalidateQueries({ queryKey: ['images'] });
    return items;
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

  /** The album added, or null (empty, not found at once — the picker asks —, failed). */
  const folderToAlbum = async (
    dir: FileSystemDirectoryEntry,
    next = false,
  ): Promise<{ id: string; name: string } | null> => {
    const { openMedia } = live.current;
    // for the running order the view stays on the show — unless the picker must ask
    if (!next) openMedia('albums');
    try {
      const folder = await readFolder(dir);
      if (folder.files.length === 0) {
        notifications.show({ message: tr('Папка «{name}» порожня', { name: folder.name }) });
        return null;
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
        return album;
      }
      if (next) openMedia('albums');
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
    return null;
  };

  /** The video added, or null (not found at once — the picker asks —, failed). */
  const fileToVideo = async (
    file: File,
    next = false,
  ): Promise<{ id: string; name: string } | null> => {
    const { openMedia } = live.current;
    if (!next) openMedia('videos');
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
        return video;
      }
      if (next) openMedia('videos');
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
    return null;
  };

  return { dragging, zone };
}
