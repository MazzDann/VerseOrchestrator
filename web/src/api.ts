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
});
export type Verse = z.infer<typeof VerseSchema>;

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
};
