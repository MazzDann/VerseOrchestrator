import { z } from 'zod';
import { type BundleSong, type Library, type Vars } from '@vo/shared';
import { type Slide } from './presenterBus';
import { effectiveSource } from './dataSourceStore';
import { useServer, whenBooted } from './serverStore';
import { localEngine } from './lib/engine';
import { tr } from './i18n';

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

const SongInfoSchema = z.object({
  id: z.number(),
  number: z.number().nullable(),
  title: str(),
  /** the song bundle's name (0.10.0); '' from a library built before bundles */
  bundle: z
    .string()
    .nullish()
    .transform((v) => v ?? ''),
});
export type SongInfo = z.infer<typeof SongInfoSchema>;
const SongBundleSchema = z.object({ name: z.string(), count: z.number() });
export type SongBundleInfo = z.infer<typeof SongBundleSchema>;
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
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    key?: string;
    vars?: Vars;
  };
  // the server's messages are keys of the dictionary; one with values sends them apart (0.11.6)
  if (body.key) return new Error(tr(body.key, body.vars));
  if (body.error) return new Error(tr(body.error));
  // No JSON error body on a 5xx = the dev proxy couldn't reach the API process.
  return new Error(
    res.status >= 500
      ? tr(
          'сервер недоступний. Перевірте вікно, де запущено застосунок (start.cmd, start.sh або npm run dev)',
        )
      : tr('сервер відповів помилкою {status}', { status: res.status }),
  );
}

/** fetch that turns "server not running" into an actionable message. */
async function request(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(
      tr(
        'сервер недоступний. Перевірте, чи запущено застосунок (start.cmd / start.command / ./start.sh)',
      ),
    );
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
  return whenBooted().then(() => readLibrary(schema, local, url));
}

function readLibrary<S extends z.ZodTypeAny>(
  schema: S,
  local: (lib: Library) => Promise<unknown>,
  url: string,
): Promise<z.infer<S>> {
  if (effectiveSource() === 'local') {
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
/** Static segments folder of a server-less deployment (next to index.html). */
const STATIC_SEGMENTS = `${import.meta.env.BASE_URL}segments/`;
/** Where segment files are fetched from — follows where the manifest was found. */
let segmentBase = '/api/segments/';

async function staticManifest() {
  const res = await fetch(`${STATIC_SEGMENTS}manifest.json`);
  // a dev server answers unknown paths with index.html — only JSON counts
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) {
    throw new Error(tr('Сегментів немає ні на сервері, ні поруч із застосунком'));
  }
  const m = SegmentManifestSchema.parse(await res.json());
  segmentBase = STATIC_SEGMENTS;
  return m;
}

export const SegmentManifestSchema = z.object({
  format: z.number(),
  createdAt: z.string(),
  segments: z.array(SegmentInfoSchema),
});

/** Marks a state-changing request from the control UI; the server rejects writes
 * without it (it forces a CORS preflight, so other sites can't forge them). */
const CONTROL_HEADERS = { 'X-VO-Control': '1' };

const RemoteCommandSchema = z.enum([
  'next',
  'prev',
  'blank',
  'black',
  'show',
  'pick',
  'songs',
  'playlist',
  'queue',
]);
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

/** The standby waiter (server/src/standby.ts) and its autostart — GET/PUT /api/standby. */
/** The UI state kept in data/ (0.7.4): each store's persisted JSON with its save time. */
const UiEntrySchema = z.object({ value: z.string(), at: z.number() });
const UiStateSchema = z.object({
  'vo:settings': UiEntrySchema.optional(),
  'vo:playlist': UiEntrySchema.optional(),
});
export type UiState = z.infer<typeof UiStateSchema>;
export type UiEntry = z.infer<typeof UiEntrySchema>;

const StandbySchema = z.object({
  enabled: z.boolean(),
  supported: z.boolean(),
  port: z.number(),
  idleMinutes: z.number(),
  waiter: z
    .object({
      state: z.string(),
      appPort: z.number().nullable().optional(),
      rssBytes: z.number().optional(),
      retiring: z.boolean().optional(),
      openSockets: z.number().optional(),
    })
    .nullable(),
  underWaiter: z.boolean(),
  urls: z.object({ local: z.string(), lan: z.array(z.string()) }),
  relaunching: z.boolean().optional(),
});
export type StandbyStatus = z.infer<typeof StandbySchema>;

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
  songs: (q: string, bundle?: string) =>
    fromLibrary(
      z.array(SongInfoSchema),
      (l) => l.searchSongs(q, 60, bundle),
      `/api/songs?q=${encodeURIComponent(q)}${bundle ? `&bundle=${encodeURIComponent(bundle)}` : ''}`,
    ),
  /** The song bundles in the library, with their song counts (0.10.0). */
  songBundles: () =>
    fromLibrary(z.array(SongBundleSchema), (l) => l.listSongBundles(), '/api/song-bundles'),
  song: (id: number) =>
    fromLibrary(
      SongDetailSchema,
      async (l) => {
        const song = await l.getSong(id);
        if (!song) throw new Error(tr('Пісню не знайдено'));
        return song;
      },
      `/api/songs/${id}`,
    ),
  // --- Library segments for the browser engine (server/src/index.ts) ---
  /**
   * The segment manifest: from the API, or — on a static deployment with no server — from
   * the `segments/` folder published next to the app (npm run build:static). Segment files
   * are then fetched from wherever the manifest came from.
   */
  segments: async () => {
    // Known server-less: go straight to the static folder (no doomed /api request).
    if (useServer.getState().available === false) return staticManifest();
    try {
      const m = await getJson('/api/segments', SegmentManifestSchema);
      segmentBase = '/api/segments/';
      return m;
    } catch (apiErr) {
      return staticManifest().catch(() => {
        throw apiErr;
      });
    }
  },
  segmentBytes: async (file: string): Promise<ArrayBuffer> => {
    const res = await request(`${segmentBase}${encodeURIComponent(file)}`);
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
  /** What an existing remote may do (0.6.0); its open page updates at once. */
  updateRemote: async (id: string, allowed: RemoteCommand[]) => {
    const res = await request(`/api/remote/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ allowed }),
    });
    if (!res.ok) throw await failure(res);
    return z
      .object({ id: z.string(), name: z.string(), allowed: z.array(RemoteCommandSchema) })
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
  uiState: () => getJson('/api/ui-state', UiStateSchema),
  saveUiState: async (key: keyof UiState, value: string, at: number) => {
    const res = await request('/api/ui-state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ key, value, at }),
    });
    if (!res.ok) throw await failure(res);
    return z.object({ saved: z.boolean(), entry: UiEntrySchema }).parse(await res.json());
  },
  standby: () => getJson('/api/standby', StandbySchema),
  updateStandby: async (patch: { enabled?: boolean; port?: number }) => {
    const res = await request('/api/standby', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw await failure(res);
    return StandbySchema.parse(await res.json());
  },
  /** The song bundle files, with the ids an import names its target by (0.10.1). */
  songBundleFiles: () =>
    getJson(
      '/api/song-bundles/files',
      z.array(z.object({ id: z.string(), name: z.string(), count: z.number() })),
    ),
  /**
   * Import songs read from .pptx files in the browser into a bundle — an existing one (`id`)
   * or a new one (`name`) — and bring the library's songs up to date (0.10.1).
   */
  importSongs: async (target: { id: string } | { name: string }, songs: BundleSong[]) => {
    const res = await request('/api/song-bundles/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ target, songs }),
    });
    if (!res.ok) throw await failure(res);
    return z
      .object({
        bundle: z.object({ id: z.string(), name: z.string(), count: z.number() }),
        added: z.number(),
        updated: z.number(),
        library: z.number().nullable(),
      })
      .parse(await res.json());
  },
  /** A desktop shortcut that opens the control window as an app window (0.7.5). */
  createShortcut: async () => {
    const res = await request('/api/shortcut', { method: 'POST', headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return z.object({ files: z.array(z.string()) }).parse(await res.json());
  },
  /** «Вимкнути повністю» (0.7.1): the server, its waiter and the autostart entry go. */
  shutdown: async () => {
    const res = await request('/api/shutdown', { method: 'POST', headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return z.object({ ok: z.boolean(), autostartRemoved: z.boolean() }).parse(await res.json());
  },
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
