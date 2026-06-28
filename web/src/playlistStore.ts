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
  add: (item: NewSeqItem) => void;
  removeItem: (id: string) => void;
  /** Move an item one slot up (-1) or down (+1). */
  move: (id: string, dir: -1 | 1) => void;
  clear: () => void;
  setCurrent: (id: string | null) => void;
}

export const usePlaylist = create<PlaylistState>()(
  persist(
    (set) => ({
      items: [],
      currentId: null,
      add: (item) => set((s) => ({ items: [...s.items, { ...item, id: newId() } as SeqItem] })),
      removeItem: (id) =>
        set((s) => ({
          items: s.items.filter((i) => i.id !== id),
          currentId: s.currentId === id ? null : s.currentId,
        })),
      move: (id, dir) =>
        set((s) => {
          const idx = s.items.findIndex((i) => i.id === id);
          const to = idx + dir;
          if (idx < 0 || to < 0 || to >= s.items.length) return s;
          const items = [...s.items];
          [items[idx], items[to]] = [items[to], items[idx]];
          return { items };
        }),
      clear: () => set({ items: [], currentId: null }),
      setCurrent: (id) => set({ currentId: id }),
    }),
    {
      name: 'vo:playlist',
      version: 1,
      // currentId marks what's projected this session — never restore it as
      // "active" after a reload, when nothing has been pushed to the screen yet.
      partialize: (s) => ({ items: s.items }),
    },
  ),
);
