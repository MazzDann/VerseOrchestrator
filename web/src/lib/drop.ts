import { create } from 'zustand';

/**
 * Files and folders dropped on the control window (1.14.0-beta.1, the author's ask: «перетягнута
 * папка стає альбомом»): pictures go to «Зображення», a folder becomes an album, a video joins
 * «Відео». The browser gives a dropped folder's name and files, never its path — the server finds
 * it on disk (server/src/locate.ts).
 */

export type DroppedKind = 'image' | 'video' | 'other';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif|hif)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv)$/i;

/** What a dropped file is, by its type or, when the system gives none, by its name. */
export function droppedKind(file: { name: string; type: string }): DroppedKind {
  if (file.type.startsWith('image/') || IMAGE_EXT.test(file.name)) return 'image';
  if (file.type.startsWith('video/') || VIDEO_EXT.test(file.name)) return 'video';
  return 'other';
}

/** A dropped folder: its name and the files right in it (an album reads only those). */
export interface DroppedFolder {
  name: string;
  files: { name: string; size: number }[];
}

/** The files right in a dropped folder, with their sizes (readEntries gives them in batches). */
export async function readFolder(dir: FileSystemDirectoryEntry): Promise<DroppedFolder> {
  const reader = dir.createReader();
  const entries: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((ok, fail) => reader.readEntries(ok, fail));
    if (batch.length === 0) break;
    entries.push(...batch);
    if (entries.length >= 500) break;
  }
  const files = await Promise.all(
    entries
      .filter((e): e is FileSystemFileEntry => e.isFile)
      .slice(0, 500)
      .map(
        (e) =>
          new Promise<{ name: string; size: number } | null>((ok) =>
            e.file(
              (f) => ok({ name: f.name, size: f.size }),
              () => ok(null),
            ),
          ),
      ),
  );
  return { name: dir.name, files: files.filter((f) => f !== null) };
}

/** What the media views take from a drop: pictures to add, a folder picker to open. */
interface DropState {
  images: File[];
  /** the folder picker, opened by a drop that wasn't found on disk; `start`: a folder to show */
  pick: { kind: 'album' | 'video'; start?: string } | null;
  addImages: (files: File[]) => void;
  takeImages: () => File[];
  openPicker: (kind: 'album' | 'video', start?: string) => void;
  pickerOpened: () => void;
}

export const useDrop = create<DropState>((set, get) => ({
  images: [],
  pick: null,
  addImages: (files) => set((s) => ({ images: [...s.images, ...files] })),
  takeImages: () => {
    const files = get().images;
    if (files.length > 0) set({ images: [] });
    return files;
  },
  openPicker: (kind, start) => set({ pick: { kind, start } }),
  pickerOpened: () => set({ pick: null }),
}));

/** The folder a path is in (either separator: the server's paths are this computer's). */
export function parentOf(p: string): string {
  const s = p.replace(/[\\/]+$/, '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  if (i <= 0) return s;
  // «C:\Photos» → «C:\»: a drive's root keeps its separator
  return /^[A-Za-z]:$/.test(s.slice(0, i)) ? s.slice(0, i + 1) : s.slice(0, i);
}
