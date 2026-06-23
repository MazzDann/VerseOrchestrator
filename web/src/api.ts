import { z } from 'zod';

/** Nullable/optional string from the API, normalized to a plain string. */
const str = () =>
  z
    .string()
    .nullish()
    .transform((v) => v ?? '');

const TranslationSchema = z.object({
  id: z.number(),
  abbr: z.string(),
  title: str(),
  language: str(),
  rtl: z.boolean(),
  hasStrong: z.boolean(),
});
export type Translation = z.infer<typeof TranslationSchema>;

const BookSchema = z.object({
  bookNumber: z.number(),
  shortName: str(),
  longName: str(),
  color: str(),
});
export type Book = z.infer<typeof BookSchema>;

const VerseSchema = z.object({
  translationId: z.number(),
  bookNumber: z.number(),
  chapter: z.number(),
  verse: z.number(),
  text: str(),
  textRaw: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
});
export type Verse = z.infer<typeof VerseSchema>;

const StrongDefSchema = z.object({
  dictionary: str(),
  language: str(),
  topic: str(),
  definition: str(),
});
export type StrongDef = z.infer<typeof StrongDefSchema>;

const SearchResultSchema = VerseSchema.extend({
  longName: str(),
  shortName: str(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

const SearchResponseSchema = z.object({
  kind: z.enum(['reference', 'text', 'empty']),
  results: z.array(SearchResultSchema),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;

const StrongRefsSchema = z.object({
  strong: z.number(),
  total: z.number(),
  truncated: z.boolean(),
  results: z.array(SearchResultSchema),
});
export type StrongRefs = z.infer<typeof StrongRefsSchema>;

const CrossRefSchema = z.object({
  bookNumber: z.number(),
  chapter: z.number(),
  verseStart: z.number(),
  verseEnd: z.number(),
});
export type CrossRef = z.infer<typeof CrossRefSchema>;

const CommentarySchema = z.object({ source: str(), marker: str(), text: str() });
export type CommentaryNote = z.infer<typeof CommentarySchema>;

const SongInfoSchema = z.object({ id: z.number(), number: z.number().nullable(), title: str() });
export type SongInfo = z.infer<typeof SongInfoSchema>;
const SongStyleSchema = z
  .object({
    bg: str(),
    color: str(),
    font: str(),
    bold: z.boolean(),
    align: z.enum(['left', 'center', 'right']),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  })
  .nullable();
export type SongStyle = NonNullable<z.infer<typeof SongStyleSchema>>;
const SongDetailSchema = SongInfoSchema.extend({
  slides: z.array(z.object({ text: z.string(), style: SongStyleSchema })),
});
export type SongDetail = z.infer<typeof SongDetailSchema>;

async function getJson<S extends z.ZodTypeAny>(url: string, schema: S): Promise<z.infer<S>> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return schema.parse(await res.json());
}

export const api = {
  translations: () => getJson('/api/translations', z.array(TranslationSchema)),
  books: (id: number) => getJson(`/api/translations/${id}/books`, z.array(BookSchema)),
  chapters: (id: number, book: number) =>
    getJson(`/api/translations/${id}/books/${book}/chapters`, z.array(z.number())),
  verses: (id: number, book: number, chapter: number) =>
    getJson(
      `/api/translations/${id}/books/${book}/chapters/${chapter}/verses`,
      z.array(VerseSchema),
    ),
  search: (q: string, translationIds: number[]) =>
    getJson(
      `/api/search?q=${encodeURIComponent(q)}&translations=${translationIds.join(',')}`,
      SearchResponseSchema,
    ),
  strong: (num: string, book?: number) =>
    getJson(
      `/api/strong/${encodeURIComponent(num)}${book != null ? `?book=${book}` : ''}`,
      z.array(StrongDefSchema),
    ),
  strongRefs: (num: string, opts?: { translationId?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.translationId != null) params.set('translation', String(opts.translationId));
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return getJson(
      `/api/strong/${encodeURIComponent(num)}/refs${qs ? `?${qs}` : ''}`,
      StrongRefsSchema,
    );
  },
  dict: (word: string) =>
    getJson(`/api/dict?q=${encodeURIComponent(word)}`, z.array(StrongDefSchema)),
  crossrefs: (book: number, chapter: number, verse: number) =>
    getJson(`/api/crossrefs?book=${book}&chapter=${chapter}&verse=${verse}`, z.array(CrossRefSchema)),
  commentary: (book: number, chapter: number, verse: number) =>
    getJson(`/api/commentary?book=${book}&chapter=${chapter}&verse=${verse}`, z.array(CommentarySchema)),
  songs: (q: string) => getJson(`/api/songs?q=${encodeURIComponent(q)}`, z.array(SongInfoSchema)),
  song: (id: number) => getJson(`/api/songs/${id}`, SongDetailSchema),
};
