import { z } from 'zod';
import { type Library } from '@vo/shared';
import { type Slide } from './presenterBus';
import { useDataSource } from './dataSourceStore';
import { localEngine } from './lib/engine';

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
  suggestions: z.array(SearchResultSchema).optional(),
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
    size: z
      .number()
      .nullish()
      .transform((v) => v ?? 0),
  })
  .nullable();
export type SongStyle = NonNullable<z.infer<typeof SongStyleSchema>>;
const SongDetailSchema = SongInfoSchema.extend({
  slides: z.array(z.object({ text: z.string(), style: SongStyleSchema })),
});
export type SongDetail = z.infer<typeof SongDetailSchema>;

/** Human-readable failure: the server's own message, else what went wrong in plain words. */
async function failure(res: Response): Promise<Error> {
  const body = await res.json().catch(() => ({}));
  const msg = (body as { error?: string }).error;
  if (msg) return new Error(msg);
  // No JSON error body on a 5xx = the dev proxy couldn't reach the API process.
  return new Error(
    res.status >= 500
      ? 'сервер недоступний. Перевірте термінал, де запущено npm run dev'
      : `сервер відповів помилкою ${res.status}`,
  );
}

/** fetch that turns "server not running" into an actionable message. */
async function request(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error('сервер недоступний. Перевірте, чи запущено npm run dev');
  }
}

async function getJson<S extends z.ZodTypeAny>(url: string, schema: S): Promise<z.infer<S>> {
  const res = await request(url);
  if (!res.ok) throw await failure(res);
  return schema.parse(await res.json());
}

/**
 * Library reads go to the server over HTTP, or — when the data source is «у браузері» —
 * to the browser engine running the very same shared queries on SQLite-in-WASM. Both
 * paths are validated by the same schema, so the UI can't tell them apart.
 */
function fromLibrary<S extends z.ZodTypeAny>(
  schema: S,
  local: (lib: Library) => Promise<unknown>,
  url: string,
): Promise<z.infer<S>> {
  if (useDataSource.getState().source === 'local') {
    return localEngine
      .whenReady()
      .then(() => local(localEngine.library()))
      .then((r) => schema.parse(r));
  }
  return getJson(url, schema);
}

const SegmentInfoSchema = z.object({
  file: z.string(),
  kind: z.enum(['translation', 'dictionary', 'study', 'songs']),
  id: z.number().optional(),
  abbr: z.string(),
  title: z.string(),
  language: z.string(),
  items: z.number(),
  bytes: z.number(),
  rawBytes: z.number(),
  sha256: z.string(),
});
export type SegmentInfo = z.infer<typeof SegmentInfoSchema>;
export const SegmentManifestSchema = z.object({
  format: z.number(),
  createdAt: z.string(),
  segments: z.array(SegmentInfoSchema),
});

/** Marks a state-changing request from the control UI; the server rejects writes
 * without it (it forces a CORS preflight, so other sites can't forge them). */
const CONTROL_HEADERS = { 'X-VO-Control': '1' };

const RemoteCommandSchema = z.enum(['next', 'prev', 'blank', 'black']);
export type RemoteCommand = z.infer<typeof RemoteCommandSchema>;
const PairingSchema = z.object({
  id: z.string(),
  name: z.string(),
  allowed: z.array(RemoteCommandSchema),
  createdAt: z.number(),
  lastSeen: z.number().nullable(),
  online: z.boolean(),
});
export type Pairing = z.infer<typeof PairingSchema>;

const ServerSettingsSchema = z.object({
  version: z.number(),
  remotes: z.object({ persist: z.boolean() }),
});

export const api = {
  // --- Library reads: server or browser engine (see fromLibrary) ---
  translations: () =>
    fromLibrary(z.array(TranslationSchema), (l) => l.getTranslations(), '/api/translations'),
  books: (id: number) =>
    fromLibrary(z.array(BookSchema), (l) => l.getBooks(id), `/api/translations/${id}/books`),
  chapters: (id: number, book: number) =>
    fromLibrary(
      z.array(z.number()),
      (l) => l.getChapters(id, book),
      `/api/translations/${id}/books/${book}/chapters`,
    ),
  verses: (id: number, book: number, chapter: number) =>
    fromLibrary(
      z.array(VerseSchema),
      (l) => l.getVerses(id, book, chapter),
      `/api/translations/${id}/books/${book}/chapters/${chapter}/verses`,
    ),
  search: (q: string, translationIds: number[]) =>
    fromLibrary(
      SearchResponseSchema,
      (l) => l.search(q, translationIds),
      `/api/search?q=${encodeURIComponent(q)}&translations=${translationIds.join(',')}`,
    ),
  strong: (num: string, book?: number) =>
    fromLibrary(
      z.array(StrongDefSchema),
      (l) => l.lookupStrong(num, book),
      `/api/strong/${encodeURIComponent(num)}${book != null ? `?book=${book}` : ''}`,
    ),
  strongRefs: (num: string, opts?: { translationId?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.translationId != null) params.set('translation', String(opts.translationId));
    if (opts?.limit != null) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return fromLibrary(
      StrongRefsSchema,
      (l) => l.strongRefs(num, opts),
      `/api/strong/${encodeURIComponent(num)}/refs${qs ? `?${qs}` : ''}`,
    );
  },
  dict: (word: string) =>
    fromLibrary(
      z.array(StrongDefSchema),
      (l) => l.lookupWord(word),
      `/api/dict?q=${encodeURIComponent(word)}`,
    ),
  crossrefs: (book: number, chapter: number, verse: number) =>
    fromLibrary(
      z.array(CrossRefSchema),
      (l) => l.getCrossrefs(book, chapter, verse),
      `/api/crossrefs?book=${book}&chapter=${chapter}&verse=${verse}`,
    ),
  commentary: (book: number, chapter: number, verse: number) =>
    fromLibrary(
      z.array(CommentarySchema),
      (l) => l.getCommentary(book, chapter, verse),
      `/api/commentary?book=${book}&chapter=${chapter}&verse=${verse}`,
    ),
  songs: (q: string) =>
    fromLibrary(
      z.array(SongInfoSchema),
      (l) => l.searchSongs(q),
      `/api/songs?q=${encodeURIComponent(q)}`,
    ),
  song: (id: number) =>
    fromLibrary(
      SongDetailSchema,
      async (l) => {
        const song = await l.getSong(id);
        if (!song) throw new Error('Пісню не знайдено');
        return song;
      },
      `/api/songs/${id}`,
    ),
  // --- Library segments for the browser engine (server/src/index.ts) ---
  segments: () => getJson('/api/segments', SegmentManifestSchema),
  segmentBytes: async (file: string): Promise<ArrayBuffer> => {
    const res = await request(`/api/segments/${encodeURIComponent(file)}`);
    if (!res.ok) throw await failure(res);
    return res.arrayBuffer();
  },
  // Audience follow-along relay (server-side in-memory state polled by phones).
  livePost: async (slide: Slide): Promise<void> => {
    await fetch('/api/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify(slide),
    }).catch(() => {
      /* best-effort; phones poll and will catch up */
    });
  },
  live: () =>
    getJson(
      '/api/live',
      z.object({ version: z.number(), slide: z.any().nullable(), paused: z.boolean().optional() }),
    ),
  /** Follow-along switched off: phones show «paused» instead of the last slide. */
  livePause: async (): Promise<void> => {
    await fetch('/api/live/pause', { method: 'POST', headers: CONTROL_HEADERS }).catch(() => {
      /* best-effort, like livePost */
    });
  },
  host: () => getJson('/api/host', z.object({ ips: z.array(z.string()) })),
  // Speaker remotes (server/src/remote.ts). The token comes back ONLY from create.
  remotes: () => getJson('/api/remote', z.array(PairingSchema)),
  createRemote: async (name: string, allowed: RemoteCommand[]) => {
    const res = await request('/api/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ name, allowed }),
    });
    if (!res.ok) throw await failure(res);
    return z
      .object({
        id: z.string(),
        name: z.string(),
        allowed: z.array(RemoteCommandSchema),
        token: z.string(),
      })
      .parse(await res.json());
  },
  /** New code for an existing remote: the phone holding the old one loses control. */
  reissueRemote: async (id: string) => {
    const res = await request(`/api/remote/${encodeURIComponent(id)}/reissue`, {
      method: 'POST',
      headers: CONTROL_HEADERS,
    });
    if (!res.ok) throw await failure(res);
    return z
      .object({ id: z.string(), name: z.string(), token: z.string() })
      .parse(await res.json());
  },
  /** Server options (data/settings.json) — not secrets. */
  serverSettings: () => getJson('/api/server-settings', ServerSettingsSchema),
  updateServerSettings: async (patch: { remotes?: { persist?: boolean } }) => {
    const res = await request('/api/server-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw await failure(res);
    return ServerSettingsSchema.parse(await res.json());
  },
  revokeRemote: async (id: string) => {
    const res = await request(`/api/remote/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: CONTROL_HEADERS,
    });
    if (!res.ok) throw await failure(res);
  },
  rebuild: async (): Promise<{ ok: boolean }> => {
    const res = await request('/api/rebuild', { method: 'POST', headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return res.json() as Promise<{ ok: boolean }>;
  },
};
