export interface Translation {
  id: number;
  abbr: string;
  title: string;
  language: string;
  rtl: boolean;
  hasStrong: boolean;
}

export interface Book {
  bookNumber: number;
  shortName: string;
  longName: string;
  color: string;
}

export interface Verse {
  translationId: number;
  bookNumber: number;
  chapter: number;
  verse: number;
  text: string;
  /** Original module markup (with `<S>` Strong tags); present only where needed. */
  textRaw?: string;
}

/** A set of section titles of its own, the module's *.subheadings.SQLite3 (1.16.0-beta.3). */
export interface SubheadingSet {
  id: number;
  /** the file's name without the extensions — «KJV-s», «Хом-д» */
  abbr: string;
  title: string;
  language: string;
  /** how many titles it holds */
  titles: number;
}

/**
 * «Статистика бібліотеки» (1.18.0-beta.5): what the library holds, counted — the same answer from
 * every engine (queries.ts `libraryStats`). Words = runs between spaces, a fair count for a verse.
 */
export interface LibraryStats {
  translations: {
    id: number;
    abbr: string;
    title: string;
    language: string;
    hasStrong: boolean;
    books: number;
    verses: number;
    words: number;
    /** Strong numbers tagged in its verses (a concordance row each: a number once per verse) */
    strongTags: number;
    subheadings: number;
  }[];
  dictionaries: {
    abbr: string;
    name: string;
    language: string;
    strong: boolean;
    entries: number;
  }[];
  commentaries: { source: string; notes: number }[];
  crossReferences: number;
  subheadingSets: { abbr: string; title: string; titles: number }[];
  songs: { bundle: string; songs: number; stanzas: number }[];
  documents: { documents: number; units: number; refs: number };
}

export interface StrongDefinition {
  dictionary: string;
  language: string;
  topic: string;
  definition: string;
}

export interface SearchResult extends Verse {
  longName: string;
  shortName: string;
  /** «~ …» only: 3 — as close as the best, 2 — close, 1 — related (1.16.0-beta.4) */
  closeness?: 1 | 2 | 3;
}
