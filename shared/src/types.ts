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
}

export interface SearchResult extends Verse {
  longName: string;
  shortName: string;
}
