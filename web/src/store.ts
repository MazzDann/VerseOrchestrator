import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  /** Translations chosen for display; the first is the navigation "primary". */
  selectedTranslationIds: number[];
  bookNumber: number | null;
  chapter: number | null;
  /** Selected verse numbers, kept sorted ascending. */
  selectedVerses: number[];
  /** Whether the presenter is currently showing the live selection. */
  live: boolean;

  primaryTranslationId(): number | null;
  setTranslations(ids: number[]): void;
  makePrimary(id: number): void;
  selectBook(bookNumber: number): void;
  selectChapter(chapter: number): void;
  setSelectedVerses(verses: number[]): void;
  toggleVerse(verse: number): void;
  setLive(live: boolean): void;
  clearVerses(): void;
}

const sortNums = (a: number[]) => [...a].sort((x, y) => x - y);

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      selectedTranslationIds: [],
      bookNumber: null,
      chapter: null,
      selectedVerses: [],
      live: false,

      primaryTranslationId: () => get().selectedTranslationIds[0] ?? null,

      setTranslations: (ids) =>
        set((s) => ({
          selectedTranslationIds: ids,
          // Reset navigation if the primary translation changed.
          bookNumber: ids[0] === s.selectedTranslationIds[0] ? s.bookNumber : null,
          chapter: ids[0] === s.selectedTranslationIds[0] ? s.chapter : null,
          selectedVerses: ids[0] === s.selectedTranslationIds[0] ? s.selectedVerses : [],
        })),

      makePrimary: (id) =>
        set((s) => ({
          selectedTranslationIds: [id, ...s.selectedTranslationIds.filter((x) => x !== id)],
        })),

      selectBook: (bookNumber) =>
        set({ bookNumber, chapter: null, selectedVerses: [], live: false }),
      selectChapter: (chapter) => set({ chapter, selectedVerses: [], live: false }),
      setSelectedVerses: (verses) => set({ selectedVerses: sortNums(verses) }),
      toggleVerse: (verse) =>
        set((s) => ({
          selectedVerses: s.selectedVerses.includes(verse)
            ? s.selectedVerses.filter((v) => v !== verse)
            : sortNums([...s.selectedVerses, verse]),
        })),
      setLive: (live) => set({ live }),
      clearVerses: () => set({ selectedVerses: [], live: false }),
    }),
    {
      name: 'vo:selection',
      // Persist the selection only — not `live` (don't auto-go-live on reload) or actions.
      partialize: (s) => ({
        selectedTranslationIds: s.selectedTranslationIds,
        bookNumber: s.bookNumber,
        chapter: s.chapter,
        selectedVerses: s.selectedVerses,
      }),
    },
  ),
);
