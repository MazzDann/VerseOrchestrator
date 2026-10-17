import { create } from 'zustand';

/**
 * Files and folders dropped on the control window (1.14.0-beta.1, the author's ask: «перетягнута
 * папка стає альбомом»): pictures go to «Зображення», a folder becomes an album, a video joins
 * «Відео». The browser gives a dropped folder's name and files, never its path — the server finds
 * it on disk (server/src/locate.ts).
 */

export type DroppedKind =
  | 'image'
  | 'video'
  /** a .docx / .md / .txt / .pdf (1.17.0) */
  | 'document'
  /** a module (.SQLite3, 1.17.1): into the library */
  | 'module'
  /** a library segment (.vodb): into the browser's engine */
  | 'segment'
  /** a song in a presentation (1.17.1): «Презентації» → import */
  | 'song'
  /** another copy's vectors.db (1.17.1) */
  | 'vectors'
  | 'other';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif|hif)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv)$/i;
const DOC_EXT = /\.(docx|md|markdown|txt|pdf)$/i;

/** What a dropped file is, by its type or, when the system gives none, by its name. */
export function droppedKind(file: { name: string; type: string }): DroppedKind {
  const name = file.name.replace(/^.*[\\/]/, '');
  if (file.type.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (file.type.startsWith('video/') || VIDEO_EXT.test(name)) return 'video';
  if (/\.sqlite3$/i.test(name)) return 'module';
  if (/\.vodb(\.gz)?$/i.test(name)) return 'segment';
  if (/\.pptx$/i.test(name) && !name.startsWith('~$')) return 'song';
  // the vectors file travels by its name (data/vectors.db), a copy perhaps renamed
  if (/^vectors.*\.db$/i.test(name)) return 'vectors';
  if (DOC_EXT.test(name) && !name.startsWith('~$') && !name.startsWith('.')) return 'document';
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
  /** presentations dropped (1.17.1): «Презентації» opens its import with them */
  songs: File[];
  addSongs: (files: File[]) => void;
  takeSongs: () => File[];
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
  songs: [],
  addSongs: (files) => set((s) => ({ songs: [...s.songs, ...files] })),
  takeSongs: () => {
    const files = get().songs;
    if (files.length > 0) set({ songs: [] });
    return files;
  },
  // the first one asked keeps the picker: several not found at once each say so in a notice (review)
  openPicker: (kind, start) => set((s) => (s.pick ? s : { pick: { kind, start } })),
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
