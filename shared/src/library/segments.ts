/**
 * Library segments (see builder/src/segments.ts): small gzip-compressed SQLite files
 * with the library schema that a browser engine downloads selectively and merges.
 */
export interface SegmentInfo {
  /** File name in the segments folder, e.g. "t-17.vodb.gz". */
  file: string;
  kind: 'translation' | 'dictionary' | 'study' | 'songs';
  /** translation / dictionary id in the source library (verse ids are global). */
  id?: number;
  abbr: string;
  title: string;
  language: string;
  /** verses / entries / rows in the segment */
  items: number;
  /** compressed size (what is downloaded) */
  bytes: number;
  /** uncompressed SQLite size (what the browser holds in memory) */
  rawBytes: number;
  /** SHA-256 of the compressed file — the cache key */
  sha256: string;
}

export interface SegmentManifest {
  format: number;
  createdAt: string;
  segments: SegmentInfo[];
}
