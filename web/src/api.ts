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

const StrongRefsSchema = z.object({
  strong: z.number(),
  total: z.number(),
  truncated: z.boolean(),
  results: z.array(SearchResultSchema),
});

const CrossRefSchema = z.object({
  bookNumber: z.number(),
  chapter: z.number(),
  verseStart: z.number(),
  verseEnd: z.number(),
});

const CommentarySchema = z.object({ source: str(), marker: str(), text: str() });

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
const AnchorSchema = z.enum(['top', 'middle', 'bottom']);
/** A slide's second text box (1.2.1): a title slide's authors, a «Приспів:» label. */
const SongBoxSchema = z.object({
  text: z.string(),
  color: str(),
  align: z.enum(['left', 'center', 'right']),
  anchor: AnchorSchema,
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  size: z.number(),
});
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
    anchor: AnchorSchema.optional(),
    sub: SongBoxSchema.optional(),
    /** words in another colour (1.3.0): the main text with them marked, and that colour */
    second: z.object({ text: z.string(), color: str() }).optional(),
  })
  .nullable();
export type SongStyle = NonNullable<z.infer<typeof SongStyleSchema>>;
const SongDetailSchema = SongInfoSchema.extend({
  slides: z.array(z.object({ text: z.string(), style: SongStyleSchema })),
});
export type SongDetail = z.infer<typeof SongDetailSchema>;

/**
 * A request the server refused: the message in the reader's language, plus the status and
 * the server's key, so a page can tell one refusal from another (0.13.1: no library yet).
 */
export class ApiFailure extends Error {
  readonly status: number;
  readonly key: string | undefined;
  constructor(message: string, status: number, key?: string) {
    super(message);
    this.status = status;
    this.key = key;
  }
}

/** Human-readable failure: the server's own message, else what went wrong in plain words. */
async function failure(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    key?: string;
    vars?: Vars;
  };
  // the server's messages are keys of the dictionary; one with values sends them apart (0.11.6)
  if (body.key) return new ApiFailure(tr(body.key, body.vars), res.status, body.key);
  if (body.error) return new ApiFailure(tr(body.error), res.status);
  // No JSON error body on a 5xx = the dev proxy couldn't reach the API process.
  return new ApiFailure(
    res.status >= 500
      ? tr(
          'сервер недоступний. Перевірте вікно, де запущено застосунок (start.cmd, start.sh або npm run dev)',
        )
      : tr('сервер відповів помилкою {status}', { status: res.status }),
    res.status,
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
  'cover',
  'countdown',
  'timer',
]);
export type RemoteCommand = z.infer<typeof RemoteCommandSchema>;
/** A phone (`/remote`, a QR) or a control window on another computer (`/desk`, 1.9.0-beta.10). */
const PairingKindSchema = z.enum(['phone', 'desk']).catch('phone');
export type PairingKind = z.infer<typeof PairingKindSchema>;
const PairingSchema = z.object({
  id: z.string(),
  name: z.string(),
  // a server before 1.9.0-beta.10 sends none: a phone
  kind: PairingKindSchema.optional().transform((k) => k ?? 'phone'),
  // a permission of a newer version (a server updated under an open window) is left out, not a
  // broken list of remotes (1.11.0-beta.2 review)
  allowed: z
    .array(z.string())
    .transform((a) =>
      a.filter((c): c is RemoteCommand => RemoteCommandSchema.safeParse(c).success),
    ),
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

/** «Відкривати вікно керування в…» (server/src/browsers.ts): 'system' or a browser's id. */
const LaunchSchema = z.object({ browser: z.string(), appWindow: z.boolean() });
export type LaunchSettings = z.infer<typeof LaunchSchema>;
export const DEFAULT_LAUNCH: LaunchSettings = { browser: 'system', appWindow: false };

const ServerSettingsSchema = z.object({
  version: z.number(),
  remotes: z.object({ persist: z.boolean() }),
  updates: z.object({
    check: z.boolean(),
    /** «Канал» (1.8.11); absent until chosen — the server follows the installed version */
    channel: z.enum(['stable', 'beta']).optional(),
  }),
  launch: LaunchSchema.catch(DEFAULT_LAUNCH),
  /** «Робити копії автоматично» (1.12.0-beta.3); an older server has none: on */
  backups: z.object({ auto: z.boolean() }).catch({ auto: true }),
});

/** The browsers the server knows, and which of them are on this computer (GET /api/browsers). */
const BrowsersSchema = z.object({
  browsers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      installed: z.boolean(),
      appWindow: z.boolean(),
    }),
  ),
});
export type BrowserListing = z.infer<typeof BrowsersSchema>['browsers'][number];

/** Is there a newer version (1.0.0, server/src/updates.ts)? */
const UpdateStateSchema = z.object({
  current: z.string(),
  /** «Стабільний»: regular releases; «Бета» (1.8.11): pre-releases too */
  channel: z.enum(['stable', 'beta']),
  install: z.enum(['release', 'source']),
  enabled: z.boolean(),
  checkedAt: z.number().nullable(),
  latest: z
    .object({
      version: z.string(),
      url: z.string(),
      publishedAt: z.string(),
      prerelease: z.boolean(),
      asset: z.object({ name: z.string(), url: z.string(), size: z.number() }).nullable(),
      sums: z.string().nullable().optional(),
    })
    .nullable(),
  available: z.boolean(),
  /**
   * an older version chosen over the newest release (1.6.3): no reminder of what it skipped —
   * «Поточний реліз» is the way back
   */
  pinned: z.boolean().optional(),
  error: z.string().nullable(),
  /** installing (server/src/installer.ts) — only a copy from a release archive */
  installer: z
    .object({
      phase: z.enum(['idle', 'download', 'verify', 'unpack', 'ready', 'restarting', 'error']),
      version: z.string().nullable(),
      received: z.number(),
      total: z.number(),
      error: z.string().nullable(),
      vars: z.record(z.string(), z.string()).optional(),
    })
    .nullable()
    .optional(),
  /** how the last update went (server/src/swap.ts), for a day */
  lastUpdate: z
    .object({
      ok: z.boolean(),
      from: z.string(),
      to: z.string(),
      at: z.number(),
      error: z.string().optional(),
      /** a new version, or back to the one before (1.4.0) */
      kind: z.enum(['update', 'rollback']).optional(),
    })
    .nullable()
    .optional(),
  /** the version the last update left behind, to go back to (1.4.0) */
  previous: z.string().nullish(),
  /** …and whether it has «Повернути версію» of its own (1.4.0 or later; 1.4.1) */
  previousHasRollback: z.boolean().nullish(),
  /** the version left can update back by itself here (Windows: 1.8.8 or later) — said before going */
  previousUpdatesBack: z.boolean().nullish(),
  /** every release of the channel, newest first: the dropdown (1.6.2) — a release copy only */
  versions: z
    .array(
      z.object({
        version: z.string(),
        url: z.string(),
        publishedAt: z.string(),
        /** the archive for this system, bytes (0: none) */
        size: z.number(),
        /** it has an archive for this system and a checksum file */
        installable: z.boolean(),
        /** it has «Повернути версію» of its own (1.4.0 or later) */
        selfReturn: z.boolean(),
        /** once installed here it can update back (Windows: 1.8.8 or later); absent: yes */
        updatesBack: z.boolean().optional(),
        /** a beta (1.8.11) */
        prerelease: z.boolean().optional(),
      }),
    )
    .optional(),
});
export type UpdateState = z.infer<typeof UpdateStateSchema>;

/** Where a copy of the repository stands against its upstream (upd2, 1.6.1, server/src/gitSync.ts). */
const GitSyncSchema = z.object({
  branch: z.string().nullable(),
  upstream: z.string().nullable(),
  ahead: z.number(),
  behind: z.number(),
  clean: z.boolean(),
  midway: z.boolean(),
  fetchedAt: z.number().nullable(),
  /** dictionary keys: the last fetch/pull failed; a pull would need the operator */
  error: z.string().nullable(),
  detail: z.string().nullable(),
  why: z.string().nullable(),
});
export type GitSync = z.infer<typeof GitSyncSchema>;

/** A copy of the repository: has its code changed under it (upd2, 1.6.0, server/src/codeChange.ts)? */
const CodeStateSchema = z.object({
  changed: z.boolean(),
  from: z.string(),
  to: z.string(),
  restarting: z.boolean(),
  /** missing from a server of 1.6.0 */
  git: GitSyncSchema.optional(),
});
export type CodeState = z.infer<typeof CodeStateSchema>;

/** A picture as the server lists it (1.5.0, server/src/images.ts `imageEntry`). */
const ImageSchema = z.object({
  id: z.string(),
  name: z.string(),
  w: z.number(),
  h: z.number(),
  size: z.number(),
  added: z.string(),
  /** the file for the screen */
  src: z.string(),
  /** the small one, for the phones and the thumbnails */
  small: z.string(),
});
export type ImageInfo = z.infer<typeof ImageSchema>;

/** An album as the server lists it (1.8.12, server/src/albums.ts `albumEntry`). */
const AlbumSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** the folder on this computer */
  path: z.string(),
  added: z.string(),
  /** the folder can't be used here: not there (moved, a drive taken out) — or `denied` */
  missing: z.boolean(),
  /**
   * why it's `missing`: the system won't open the folder (macOS privacy, rights) — there, no
   * photos served. Words before `missing`: where to allow it, not «plug the drive in»
   */
  denied: z.boolean().optional(),
  /** added on another computer (a Windows path on a Mac, or back): missing here, kept there */
  elsewhere: z.boolean().optional(),
  count: z.number(),
  /** HEIC photos left out: browsers can't draw them */
  heic: z.number(),
  /** more than 5 000 photos: the rest left out */
  truncated: z.boolean(),
  /** in folder order, with the album asked for by id */
  photos: z
    .array(
      z.object({
        name: z.string(),
        src: z.string(),
        /** for the phones (1.8.12-beta.2): the small copy, the photo itself until there is one */
        small: z.string().optional(),
        /** no small copy yet: the control window draws one */
        needsSmall: z.boolean().optional(),
        /** the photo's version the copy is drawn of (sent back with it) */
        v: z.string().optional(),
      }),
    )
    .optional(),
});
export type AlbumInfo = z.infer<typeof AlbumSchema>;

/** The folder picker (server/src/albums.ts `browse`). */
const FolderListSchema = z.object({
  path: z.string().nullable(),
  /** a pasted path named this file: its folder is shown */
  file: z.string().optional(),
  parent: z.string().nullable(),
  folders: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      kind: z.enum(['home', 'pictures', 'drive']).optional(),
    }),
  ),
  photos: z.number(),
  heic: z.number(),
  denied: z.boolean().optional(),
  /** with `files: 'video'` (1.8.12-beta.3): the folder's video files, and those browsers can't play */
  videos: z.array(z.object({ name: z.string(), path: z.string(), size: z.number() })).optional(),
  unplayable: z.number().optional(),
});
export type FolderList = z.infer<typeof FolderListSchema>;

/** A video as the server lists it (1.8.12-beta.3, server/src/videos.ts `videoEntry`). */
const VideoSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  added: z.string(),
  /** the file can't be used here: not there, not a video — or `denied` */
  missing: z.boolean(),
  /** why it's `missing`: the system won't open the file (macOS privacy, rights) — not served */
  denied: z.boolean().optional(),
  /** added on another computer (a Windows path on a Mac, or back): missing here, kept there */
  elsewhere: z.boolean().optional(),
  size: z.number(),
  /** the file's version a poster is drawn of */
  v: z.string().optional(),
  /** the file (this machine's windows only) and the poster (the phones) */
  src: z.string(),
  poster: z.string(),
  hasPoster: z.boolean(),
});
export type VideoInfo = z.infer<typeof VideoSchema>;

/** What a backup holds (1.5.0, server/src/backup.ts `BackupSummary`). */
const BackupSummarySchema = z.object({
  app: z.string(),
  created: z.string(),
  settings: z.boolean(),
  /** 1.12.0-beta.4: the running order and the programs are there (a part of their own) */
  playlist: z.boolean().optional(),
  programs: z.number(),
  items: z.number(),
  bundles: z.array(z.string()),
  pictures: z.number(),
  /** 1.12.0-beta.3: false — made without the pictures; this copy's stay as they are */
  withPictures: z.boolean().optional(),
  /** 1.12.0-beta.3: the start settings it carries */
  start: z.object({ browser: z.string(), port: z.number() }).nullable().optional(),
  /** the checked file's id: the restore names it */
  id: z.string().optional(),
});
export type BackupSummary = z.infer<typeof BackupSummarySchema>;

/** The parts a restore puts in place (1.12.0-beta.4, server/src/backup.ts `RestoreParts`). */
export interface RestoreParts {
  look: boolean;
  programs: boolean;
  songs: boolean;
  pictures: boolean;
  start: boolean;
}

/** An automatic backup (1.12.0-beta.3, server/src/autoBackup.ts `AutoBackup`). */
const AutoBackupSchema = z.object({
  name: z.string(),
  kind: z.enum(['daily', 'update']),
  created: z.string(),
  app: z.string(),
  to: z.string().optional(),
  size: z.number(),
  pictures: z.boolean(),
});
export type AutoBackup = z.infer<typeof AutoBackupSchema>;

/** Another copy of the app on this computer (1.12.0-beta.2, server/src/otherCopy.ts `CopyInfo`). */
const CopyInfoSchema = z.object({
  folder: z.string(),
  dataDir: z.string(),
  version: z.string().nullable(),
  /** an app folder is there: only then are its pairings offered */
  app: z.boolean(),
  running: z.boolean(),
  newer: z.boolean(),
  changed: z.number().nullable(),
  browser: z.string().nullable(),
  settings: z.boolean(),
  look: z.boolean(),
  pairings: z.number(),
  pairingNames: z.array(z.string()),
  bundles: z.number(),
  pictures: z.number(),
  programs: z.number(),
  albums: z.number(),
  videos: z.number(),
});
export type CopyInfo = z.infer<typeof CopyInfoSchema>;
export interface CopyParts {
  things: boolean;
  launch: boolean;
  pairings: boolean;
}

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
  /** Chapter lengths that align numberings (1.8.12-beta.5, shared versification.ts). */
  profiles: (translationIds: number[], books: number[]) =>
    fromLibrary(
      z.array(
        z.object({
          translationId: z.number(),
          bookNumber: z.number(),
          chapter: z.number(),
          verses: z.number(),
        }),
      ),
      (l) => l.chapterProfiles(translationIds, books),
      `/api/profiles?translations=${translationIds.join(',')}&books=${books.join(',')}`,
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
      z.object({
        version: z.number(),
        slide: z.any().nullable(),
        paused: z.boolean().optional(),
        // the hub's clock (1.7.3)
        now: z.number().optional(),
      }),
    ),
  /** Follow-along switched off: phones show «paused» instead of the last slide. */
  livePause: async (): Promise<void> => {
    await fetch('/api/live/pause', { method: 'POST', headers: CONTROL_HEADERS }).catch(() => {
      /* best-effort, like livePost */
    });
  },
  /**
   * An output window opened, moved or changed full screen (F1005-05): the server keeps the output
   * windows out of Windows «Peek» (server/src/peekGuard.ts). Best-effort: a server without it,
   * «у браузері» without a server — nothing to do.
   */
  peekGuard: async (): Promise<'queued' | 'off' | 'gone' | 'retry'> => {
    try {
      const res = await fetch('/api/windows/peek-guard', {
        method: 'POST',
        headers: CONTROL_HEADERS,
      });
      // a server without it (an older one, «у браузері»): ask no more
      if (res.status === 404 || res.status === 405) return 'gone';
      if (!res.ok) return 'retry';
      const body = (await res.json().catch(() => null)) as { state?: unknown } | null;
      return body?.state === 'off' ? 'off' : 'queued';
    } catch {
      return 'retry'; // no answer (the server restarting): the next change asks again
    }
  },
  // `local` (1.9.0-beta.10): this page runs on the computer with the app (absent before: yes)
  host: () =>
    getJson('/api/host', z.object({ ips: z.array(z.string()), local: z.boolean().default(true) })),
  // Speaker remotes (server/src/remote.ts). The token comes back ONLY from create.
  remotes: () => getJson('/api/remote', z.array(PairingSchema)),
  createRemote: async (name: string, allowed: RemoteCommand[], kind: PairingKind = 'phone') => {
    const res = await request('/api/remote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ name, allowed, kind }),
    });
    if (!res.ok) throw await failure(res);
    return z
      .object({
        id: z.string(),
        name: z.string(),
        kind: PairingKindSchema.optional().transform((k) => k ?? 'phone'),
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
      .object({
        id: z.string(),
        name: z.string(),
        kind: PairingKindSchema.optional().transform((k) => k ?? 'phone'),
        token: z.string(),
      })
      .parse(await res.json());
  },
  /** Server options (data/settings.json) — not secrets. */
  serverSettings: () => getJson('/api/server-settings', ServerSettingsSchema),
  /** The browsers on this computer, for «Відкривати вікно керування в…». */
  browsers: () => getJson('/api/browsers', BrowsersSchema),
  /**
   * «Відкрити в {browser} зараз»: the server opens this page's control window in the chosen
   * browser, with a one-time token that puts it in charge (server/src/handover.ts).
   */
  openControlWindow: async (origin: string) => {
    const res = await request('/api/control-window/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ origin }),
    });
    if (!res.ok) throw await failure(res);
    return z.object({ ok: z.literal(true), browser: z.string() }).parse(await res.json());
  },
  /** Is the token this control window was opened with still good (not used, not expired)? */
  checkHandover: async (token: string) => {
    const res = await request('/api/control-window/handover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) throw await failure(res);
    return z.object({ valid: z.boolean() }).parse(await res.json());
  },
  /** `fresh`: «Оновлення» is in sight — the server asks GitHub on an answer over ten minutes old (1.12.3) */
  update: (fresh = false) => getJson(`/api/update${fresh ? '?fresh=1' : ''}`, UpdateStateSchema),
  /** «Перевірити зараз»: the releases — and, for a copy of the repository, its upstream (1.6.1). */
  checkUpdate: async () => {
    const res = await request('/api/update/check', { method: 'POST', headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return UpdateStateSchema.extend({ git: GitSyncSchema.optional() }).parse(await res.json());
  },
  /**
   * Download, check and unpack a version next to this one — the newest, or the one picked in the
   * dropdown, older too (1.6.2); the page follows the phases.
   */
  downloadUpdate: async (version?: string) => {
    const res = await request('/api/update/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify(version ? { version } : {}),
    });
    if (!res.ok) throw await failure(res);
    return UpdateStateSchema.parse(await res.json());
  },
  /** «Повернути попередню версію» (1.4.0): restart as the version the last update replaced. */
  rollbackUpdate: async () => {
    const res = await request('/api/update/rollback', {
      method: 'POST',
      headers: CONTROL_HEADERS,
    });
    if (!res.ok) throw await failure(res);
    return z.object({ from: z.string(), to: z.string() }).parse(await res.json());
  },
  /**
   * null: a release copy (it updates by «Завантажити оновлення»), or a copy of the repository that
   * can't restart itself — not started by the start file (`npm run dev`), or git didn't answer.
   */
  codeState: () => getJson('/api/update/code', CodeStateSchema.nullable()),
  /** «Отримати оновлення» (1.6.1): fetch and fast-forward; how many commits came, and the new state. */
  pullUpdates: async () => {
    const res = await request('/api/update/pull', { method: 'POST', headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return z
      .object({ pulled: z.number(), code: CodeStateSchema.nullable() })
      .parse(await res.json());
  },
  /** A copy of the repository starts again with its new code; the app goes away for a while. */
  relaunch: async () => {
    const res = await request('/api/update/relaunch', { method: 'POST', headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return z.object({ from: z.string(), boot: z.string() }).parse(await res.json());
  },
  /** Restart into the downloaded version; the app goes away for a while. */
  restartForUpdate: async () => {
    const res = await request('/api/update/restart', { method: 'POST', headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return z.object({ from: z.string(), to: z.string() }).parse(await res.json());
  },
  /** «Резервна копія» (1.5.0): the backup .zip and the name the server gives it. */
  /** `pictures: false` (1.12.0-beta.4): without the pictures — when they'd pass 1 GB. */
  downloadBackup: async (pictures = true) => {
    const res = await request(pictures ? '/api/backup' : '/api/backup?pictures=0', {
      headers: CONTROL_HEADERS,
    });
    if (!res.ok) throw await failure(res);
    const name =
      /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
      'VerseOrchestrator-backup.zip';
    return { blob: await res.blob(), name };
  },
  /** Send a backup file to restore: the server reads it and says what it holds. */
  checkBackup: async (file: File) => {
    const res = await request('/api/backup/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip', ...CONTROL_HEADERS },
      body: file,
    });
    if (!res.ok) throw await failure(res);
    return BackupSummarySchema.parse(await res.json());
  },
  /** Restore the checked file `id` (checkBackup); another one checked since is refused. */
  /** `parts` (1.12.0-beta.4): what to put in place; none given: all of it. */
  restoreBackup: async (id: string, parts?: RestoreParts) => {
    const res = await request('/api/backup/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify(parts ? { id, parts } : { id }),
    });
    if (!res.ok) throw await failure(res);
    return BackupSummarySchema.parse(await res.json());
  },
  /** The automatic backups, newest first (1.12.0-beta.3). */
  autoBackups: async () => {
    const res = await request('/api/backup/auto', { headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return z.object({ backups: z.array(AutoBackupSchema) }).parse(await res.json()).backups;
  },
  /** An automatic backup checked for a restore: what it holds, and the id the restore names. */
  checkAutoBackup: async (name: string) => {
    const res = await request('/api/backup/auto/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw await failure(res);
    return BackupSummarySchema.parse(await res.json());
  },
  backupState: () =>
    getJson(
      '/api/backup/state',
      z.object({
        lastRestore: z
          .object({
            created: z.string(),
            at: z.string(),
            undo: z.string(),
            /** an import from another copy (1.12.0-beta.2): its folder */
            from: z.string().optional(),
          })
          .nullable(),
      }),
    ),
  /** «Перенести з іншої копії…» (1.12.0-beta.2): the other copies of this computer. */
  copies: async () => {
    const res = await request('/api/copies', { headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return z.object({ copies: z.array(CopyInfoSchema) }).parse(await res.json()).copies;
  },
  /** A folder the operator picked, as a copy (or why not). */
  describeCopy: async (path: string) => {
    const res = await request(`/api/copies/describe?${new URLSearchParams({ path })}`, {
      headers: CONTROL_HEADERS,
    });
    if (!res.ok) throw await failure(res);
    return CopyInfoSchema.parse(await res.json());
  },
  importCopy: async (path: string, parts: CopyParts) => {
    const res = await request('/api/copies/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ path, ...parts }),
    });
    if (!res.ok) throw await failure(res);
    // `warning`: the carry-over stands, a step after it failed (the pairings' file held)
    return z.object({ warning: z.string().optional() }).parse(await res.json());
  },
  /**
   * «Повернути як було»; `uiCleared` (1.12.0-beta.2): the copy had no UI state before the import,
   * so the page drops its own and starts from the defaults.
   */
  undoRestore: async () => {
    const res = await request('/api/backup/undo', { method: 'POST', headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return z.object({ uiCleared: z.boolean().optional() }).parse(await res.json());
  },
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
  /** Pictures on screen (1.5.0): what the server keeps in data/images/, newest first. */
  images: () => getJson('/api/images', z.array(ImageSchema)),
  /** Keep a picture the browser prepared (lib/image.ts `fileToPicture`). */
  addImage: async (picture: {
    name: string;
    full: string;
    small: string;
    w: number;
    h: number;
  }) => {
    const res = await request('/api/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify(picture),
    });
    if (!res.ok) throw await failure(res);
    return ImageSchema.parse(await res.json());
  },
  /** Delete a picture: it waits aside for «Скасувати» (`restoreImage`). */
  deleteImage: async (id: string) => {
    const res = await request(`/api/images/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: CONTROL_HEADERS,
    });
    if (!res.ok) throw await failure(res);
    return z.object({ trashed: z.string(), name: z.string() }).parse(await res.json());
  },
  /** «Перейменувати» (1.14.0-beta.1): the app's name of a picture, an album or a video */
  renameMedia: async (kind: 'images' | 'albums' | 'videos', id: string, name: string) => {
    const res = await request(`/api/${kind}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...CONTROL_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw await failure(res);
    return z.object({ name: z.string() }).parse(await res.json());
  },
  restoreImage: async (trashed: string) => {
    const res = await request('/api/images/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ trashed }),
    });
    if (!res.ok) throw await failure(res);
    return ImageSchema.parse(await res.json());
  },
  /** Albums (1.8.12): folders of photos on this computer, read where they are. */
  albums: () => getJson('/api/albums', z.array(AlbumSchema)),
  /** An album with its photos, read from the folder now (new photos are there). */
  album: (id: string) => getJson(`/api/albums/${encodeURIComponent(id)}`, AlbumSchema),
  /** The folder picker: the starting points (no path) or a folder's subfolders. */
  /** A folder dropped on the window (1.14.0-beta.1): where it is on this computer */
  locateAlbum: async (name: string, files: { name: string; size: number }[]) => {
    const res = await request('/api/albums/locate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ name, files }),
    });
    if (!res.ok) throw await failure(res);
    return z
      .object({ found: z.array(z.string()), complete: z.boolean().default(true) })
      .parse(await res.json());
  },
  /** A video dropped on the window (1.14.0-beta.1): where the file is on this computer */
  locateVideo: async (name: string, size: number) => {
    const res = await request('/api/videos/locate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ name, size }),
    });
    if (!res.ok) throw await failure(res);
    return z
      .object({ found: z.array(z.string()), complete: z.boolean().default(true) })
      .parse(await res.json());
  },
  browseFolders: async (path?: string, files?: 'video') => {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    if (files) params.set('files', files);
    const q = params.size > 0 ? `?${params}` : '';
    const res = await request(`/api/albums/browse${q}`, { headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return FolderListSchema.parse(await res.json());
  },
  addAlbum: async (path: string, name?: string) => {
    const res = await request('/api/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ path, name }),
    });
    if (!res.ok) throw await failure(res);
    return AlbumSchema.parse(await res.json());
  },
  /** Keep a small copy of an album's photo for the phones (lib/albumSmall.ts drew it). */
  putAlbumSmall: async (id: string, name: string, version: string, jpeg: Blob) => {
    const res = await request(
      `/api/albums/${encodeURIComponent(id)}/small/${encodeURIComponent(name)}?v=${encodeURIComponent(version)}`,
      { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', ...CONTROL_HEADERS }, body: jpeg },
    );
    if (!res.ok) throw await failure(res);
  },
  /** Video (1.8.12-beta.3): files on this computer, read where they are. */
  videos: () => getJson('/api/videos', z.array(VideoSchema)),
  addVideo: async (path: string) => {
    const res = await request('/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw await failure(res);
    return VideoSchema.parse(await res.json());
  },
  removeVideo: async (id: string) => {
    const res = await request(`/api/videos/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: CONTROL_HEADERS,
    });
    if (!res.ok) throw await failure(res);
    return z.object({ name: z.string() }).parse(await res.json());
  },
  /** Keep a video's poster for the phones (lib/videoPoster.ts drew it of the file's version `v`). */
  putVideoPoster: async (id: string, version: string, jpeg: Blob) => {
    const res = await request(
      `/api/videos/${encodeURIComponent(id)}/poster?v=${encodeURIComponent(version)}`,
      { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', ...CONTROL_HEADERS }, body: jpeg },
    );
    if (!res.ok) throw await failure(res);
  },
  /** Forget an album; the folder stays as it is. */
  removeAlbum: async (id: string) => {
    const res = await request(`/api/albums/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: CONTROL_HEADERS,
    });
    if (!res.ok) throw await failure(res);
    return z.object({ name: z.string() }).parse(await res.json());
  },
  songBundleFiles: () =>
    getJson(
      '/api/song-bundles/files',
      z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          count: z.number(),
          /** the .pptx folder that keeps it up to date (1.4.0) */
          source: z.string().optional(),
        }),
      ),
    ),
  /** Rename a bundle (1.4.0): its songs keep their ids. */
  renameSongBundle: async (id: string, name: string) => {
    const res = await request(`/api/song-bundles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw await failure(res);
    return z
      .object({ id: z.string(), name: z.string(), count: z.number() })
      .parse(await res.json());
  },
  /** Delete a bundle (1.4.0): it waits aside for «Скасувати» (`restoreSongBundle`). */
  deleteSongBundle: async (id: string) => {
    const res = await request(`/api/song-bundles/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: CONTROL_HEADERS,
    });
    if (!res.ok) throw await failure(res);
    return z
      .object({ trashed: z.string(), name: z.string(), source: z.string().optional() })
      .parse(await res.json());
  },
  restoreSongBundle: async (trashed: string) => {
    const res = await request('/api/song-bundles/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...CONTROL_HEADERS },
      body: JSON.stringify({ trashed }),
    });
    if (!res.ok) throw await failure(res);
    return z
      .object({ id: z.string(), name: z.string(), count: z.number() })
      .parse(await res.json());
  },
  /** «Скасувати» the last import (1.4.0): the bundle as it was, or gone if the import made it. */
  undoSongImport: async () => {
    const res = await request('/api/song-bundles/import/undo', {
      method: 'POST',
      headers: CONTROL_HEADERS,
    });
    if (!res.ok) throw await failure(res);
  },
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
  updateServerSettings: async (patch: {
    remotes?: { persist?: boolean };
    updates?: { check?: boolean; channel?: 'stable' | 'beta' };
    launch?: Partial<LaunchSettings>;
    backups?: { auto?: boolean };
  }) => {
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
  /** «Пересканувати модулі» (1.12.4): starts the server's job — or joins the one running — at once */
  rebuild: async (): Promise<RebuildState> => {
    const res = await request('/api/rebuild', { method: 'POST', headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return RebuildStateSchema.parse(await res.json());
  },
  rebuildState: () => getJson('/api/rebuild', RebuildStateSchema),
  stopRebuild: async (): Promise<RebuildState> => {
    const res = await request('/api/rebuild/stop', { method: 'POST', headers: CONTROL_HEADERS });
    if (!res.ok) throw await failure(res);
    return RebuildStateSchema.parse(await res.json());
  },
};

/** The library rebuild as the server's job (1.12.4, server/src/rebuildJob.ts). */
export const RebuildStateSchema = z.object({
  id: z.number(),
  phase: z.enum(['idle', 'running', 'done', 'failed', 'stopped']),
  current: z.string().nullable(),
  step: z.number(),
  total: z.number(),
  startedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  error: z
    .union([
      z.object({ key: z.string(), vars: z.record(z.string()).optional() }),
      z.object({ text: z.string() }),
    ])
    .nullable(),
});
export type RebuildState = z.infer<typeof RebuildStateSchema>;
