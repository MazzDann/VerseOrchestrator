import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * What a control window on another computer (`/desk`, 1.9.0-beta.10) remembers of its own: its
 * translations, the place open, the verses or the stanza chosen, the mode. Under its own key,
 * never `vo:settings`: a desk tab on the operator's computer would rehydrate the control window
 * through the storage event (main.tsx) and change its translations and its place.
 */
export interface DeskPlace {
  mode: 'bible' | 'songs';
  /** up to five, the first leads (books, chapters, the verse list) */
  translationIds: number[];
  bookNumber: number | null;
  chapter: number | null;
  /** the desk's preview: what «На екран» sends */
  verses: number[];
  songId: number | null;
  stanza: number | null;
}

interface DeskStore extends DeskPlace {
  set: (p: Partial<DeskPlace>) => void;
}

export const DESK_KEY = 'vo:desk';

export const useDesk = create<DeskStore>()(
  persist(
    (set) => ({
      mode: 'bible',
      translationIds: [],
      bookNumber: null,
      chapter: null,
      verses: [],
      songId: null,
      stanza: null,
      set: (p) => set(p),
    }),
    {
      name: DESK_KEY,
      version: 1,
      partialize: ({ set: _set, ...place }) => place,
    },
  ),
);
