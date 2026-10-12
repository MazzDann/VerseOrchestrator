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
  /** Original Module markup (with `<S>` Strong tags); present only where needed. */
  textRaw?: string;
}

/** A set of section titles of its own, Module's *.subheadings.SQLite3 (1.16.0-beta.3). */
export interface SubheadingSet {
  id: number;
  /** the file's name without the extensions — «KJV-s», «Хом-д» */
  abbr: string;
  title: string;
  language: string;
  /** how many titles it holds */
  titles: number;
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
