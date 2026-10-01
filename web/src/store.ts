import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chapterOnBookPick } from './lib/bookPick';

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
  /** Book only — the caller opens a chapter next (a jump, the running order, a takeover). */
  selectBook(bookNumber: number): void;
  /**
   * A book picked by the operator (the book list, the palette): it opens at a chapter at once
   * (lib/bookPick.ts) — its first, or the one it is at when it is the open book, which then
   * keeps its selection too. `chapters`: the book's chapter list, when already loaded.
   */
  openBook(bookNumber: number, chapters?: readonly number[]): void;
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
      openBook: (bookNumber, chapters) =>
        set((s) => {
          const chapter = chapterOnBookPick(s, bookNumber, chapters);
          if (s.bookNumber === bookNumber && s.chapter === chapter) return s;
          return { bookNumber, chapter, selectedVerses: [], live: false };
        }),
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
