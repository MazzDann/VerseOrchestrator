import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Presentation sequence ("playlist"): an ordered agenda of items the operator
 * walks during a live show — passages, songs, and free-text slides in one list,
 * saved across reloads. The "connective tissue" that ties the separate projection
 * surfaces (verses / Songs panel / Text panel) into a single running order.
 */

export interface SeqPassage {
  kind: 'passage';
  id: string;
  label: string; // reference, e.g. "Ів 3:16-18"
  translationIds: number[];
  bookNumber: number;
  chapter: number;
  verses: number[];
}

export interface SeqSong {
  kind: 'song';
  id: string;
  label: string; // "№12 Назва"
  songId: number;
  /** the song's bundle (0.10.0): tells apart songs with the same label in two bundles */
  bundle?: string;
  faithful: boolean; // project faithfully (pptx look) or as plain text
}

export interface SeqText {
  kind: 'text';
  id: string;
  label: string; // title or first words
  title: string;
  body: string;
}

export type SeqItem = SeqPassage | SeqSong | SeqText;
/** An item to add — same shape minus the store-assigned id. */
export type NewSeqItem = Omit<SeqPassage, 'id'> | Omit<SeqSong, 'id'> | Omit<SeqText, 'id'>;

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback for older engines; uniqueness is sufficient for a local list.
    return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

interface PlaylistState {
  items: SeqItem[];
  /** Id of the item currently projected from the sequence (highlight + step anchor). */
  currentId: string | null;
  /** Saved running orders ("programs") that can be reloaded week to week. */
  saved: SavedProgram[];
  add: (item: NewSeqItem) => void;
  removeItem: (id: string) => void;
  /** Move an item one slot up (-1) or down (+1). */
  move: (id: string, dir: -1 | 1) => void;
  /** Move the item at `from` to position `to` (drag-and-drop reorder). */
  reorder: (from: number, to: number) => void;
  clear: () => void;
  /**
   * What «Очистити показ» took away (0.9.0), so «Скасувати» can bring it back. Offered while
   * the list stays empty: adding an item or opening a program forgets it. Not saved.
   */
  cleared: { items: SeqItem[]; currentId: string | null } | null;
  /** Bring back the list the last «Очистити показ» emptied. */
  undoClear: () => void;
  setCurrent: (id: string | null) => void;
  /** Snapshot the current items under `name` (overwrites an existing program). */
  saveProgram: (name: string) => void;
  /** Replace the current items with a saved program's (fresh ids; currentId reset). */
  loadProgram: (name: string) => void;
  /**
   * The list a program replaced (0.9.3), so «Скасувати» can bring it back. Offered while the
   * program's list is untouched: adding, removing, moving, clearing or opening another
   * program forgets it. Not saved.
   */
  replaced: { program: string; items: SeqItem[]; currentId: string | null } | null;
  /** Bring back the list the last opened program replaced. */
  undoLoad: () => void;
  deleteProgram: (name: string) => void;
  /**
   * A song's id changed (0.10.0: bundles give stable ids): the running order's and the
   * saved programs' items for that song — same old id, same label — take the new one.
   */
  relinkSong: (oldId: number, label: string, newId: number, bundle?: string) => void;
  /**
   * The program «Видалити програму» took away last and where it stood (0.9.1), so
   * «Скасувати» can put it back. Saving a program forgets it; not saved.
   */
  deleted: { program: SavedProgram; index: number } | null;
  /** Put the last deleted program back in its place. */
  undoDelete: () => void;
}

export interface SavedProgram {
  name: string;
  items: SeqItem[];
}

export const usePlaylist = create<PlaylistState>()(
  persist(
    (set) => ({
      items: [],
      currentId: null,
      saved: [],
      cleared: null,
      replaced: null,
      deleted: null,
      add: (item) =>
        set((s) => ({
          items: [...s.items, { ...item, id: newId() } as SeqItem],
          cleared: null,
          replaced: null,
        })),
      removeItem: (id) =>
        set((s) => ({
          items: s.items.filter((i) => i.id !== id),
          currentId: s.currentId === id ? null : s.currentId,
          replaced: null,
        })),
      move: (id, dir) =>
        set((s) => {
          const idx = s.items.findIndex((i) => i.id === id);
          const to = idx + dir;
          if (idx < 0 || to < 0 || to >= s.items.length) return s;
          const items = [...s.items];
          [items[idx], items[to]] = [items[to], items[idx]];
          return { items, replaced: null };
        }),
      reorder: (from, to) =>
        set((s) => {
          if (from === to || from < 0 || to < 0 || from >= s.items.length || to >= s.items.length)
            return s;
          const items = [...s.items];
          const [moved] = items.splice(from, 1);
          items.splice(to, 0, moved);
          return { items, replaced: null };
        }),
      clear: () =>
        set((s) =>
          s.items.length === 0
            ? s
            : {
                items: [],
                currentId: null,
                cleared: { items: s.items, currentId: s.currentId },
                replaced: null,
              },
        ),
      undoClear: () =>
        set((s) =>
          s.cleared && s.items.length === 0
            ? { items: s.cleared.items, currentId: s.cleared.currentId, cleared: null }
            : { cleared: null },
        ),
      setCurrent: (id) => set({ currentId: id }),
      saveProgram: (name) =>
        set((s) => {
          const n = name.trim();
          if (!n || s.items.length === 0) return s;
          const snapshot: SavedProgram = { name: n, items: JSON.parse(JSON.stringify(s.items)) };
          return {
            saved: [snapshot, ...s.saved.filter((p) => p.name !== n)].slice(0, 50),
            deleted: null,
          };
        }),
      loadProgram: (name) =>
        set((s) => {
          const prog = s.saved.find((p) => p.name === name);
          if (!prog) return s;
          const items = (JSON.parse(JSON.stringify(prog.items)) as SeqItem[]).map((it) => ({
            ...it,
            id: newId(),
          }));
          // an empty list loses nothing: no undo to offer
          const replaced = s.items.length
            ? { program: prog.name, items: s.items, currentId: s.currentId }
            : null;
          return { items, currentId: null, cleared: null, replaced };
        }),
      undoLoad: () =>
        set((s) =>
          s.replaced
            ? { items: s.replaced.items, currentId: s.replaced.currentId, replaced: null }
            : s,
        ),
      deleteProgram: (name) =>
        set((s) => {
          const index = s.saved.findIndex((p) => p.name === name);
          if (index < 0) return s;
          return {
            saved: s.saved.filter((_, i) => i !== index),
            deleted: { program: s.saved[index], index },
          };
        }),
      relinkSong: (oldId, label, newId, bundle) =>
        set((s) => {
          const fix = (list: SeqItem[]) =>
            list.map((it) =>
              it.kind === 'song' && it.songId === oldId && it.label === label
                ? { ...it, songId: newId, ...(bundle ? { bundle } : {}) }
                : it,
            );
          return {
            items: fix(s.items),
            saved: s.saved.map((p) => ({ ...p, items: fix(p.items) })),
          };
        }),
      undoDelete: () =>
        set((s) => {
          if (!s.deleted) return s;
          const { program, index } = s.deleted;
          // a program of that name saved since would clash: it stays, the old one doesn't
          if (s.saved.some((p) => p.name === program.name)) return { deleted: null };
          const saved = [...s.saved];
          saved.splice(Math.min(index, saved.length), 0, program);
          return { saved, deleted: null };
        }),
    }),
    {
      name: 'vo:playlist',
      version: 1,
      // currentId marks what's projected this session — never restore it as
      // "active" after a reload, when nothing has been pushed to the screen yet.
      partialize: (s) => ({ items: s.items, saved: s.saved }),
    },
  ),
);
