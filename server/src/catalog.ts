import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  LIBRARY_ALL_LIMIT,
  LibraryError,
  MODULE_KINDS,
  moduleKind,
  N_,
  type LibrarySelection,
  type ModuleKind,
} from '@vo/shared';
import { readJson, writeJson } from './jsonFile.js';
import { unzip } from './zip.js';

/**
 * «Модулі» (1.15.0-beta.1, users' ask F1005-02 «Розширений датапак»): Module's own catalog inside
 * the app. The list is Module's registry (the file its apps read); a module the operator picks is
 * downloaded from Module's mirrors into modules/ and the library is rebuilt — nothing of theirs is
 * handed out by us. A polite client (the author's condition, 2026-10-11): the registry looked at
 * once a day at most, ONE download at a time and only on a click, a User-Agent that names the app.
 */

/** The registry's own addresses (its `registries` list, HTTPS ones), first answering wins. */
export const REGISTRIES = [
  'https://example.invalid/registry.zip',
  'https://example.invalid/repository/registry/registry.zip',
];
/** A registry this old is looked at again when the panel opens (its version first — 22 bytes). */
export const REFRESH_MS = 24 * 60 * 60 * 1000;
/** Twice the catalog's largest module (Вейсман.dictionary, 261 MB packed) — a guard, not a limit. */
export const MAX_MODULE_BYTES = 512 * 1024 ** 2;
const TIMEOUT_MS = 30_000;
/** A download with no byte for this long goes to the next mirror. */
const STALL_MS = 60_000;

/** The Module kinds the library takes (the builder's kinds); devotions, plans, bundles are left out. */
const SUFFIX_KIND: Record<string, ModuleKind> = {
  dictionary: 'dictionaries',
  commentaries: 'commentaries',
  crossreferences: 'crossreferences',
  subheadings: 'subheadings',
};
const KIND_SUFFIX: Record<ModuleKind, string> = {
  bibles: '',
  dictionaries: '.dictionary',
  commentaries: '.commentaries',
  crossreferences: '.crossreferences',
  subheadings: '.subheadings',
};

export interface CatalogEntry {
  /** the registry's file name — the module's id here («KJV+», «Strong.dictionary») */
  fil: string;
  abbr: string;
  kind: ModuleKind;
  /** the registry's language code («uk», «en», «zh Simplified»; '' when it gives none) */
  lang: string;
  title: string;
  /** the title in other languages (the registry's `lds`) */
  titles?: Record<string, string>;
  /** packed size in bytes, as the registry gives it (rounded) */
  size: number;
  /** last change, YYYY-MM-DD */
  updated: string;
  /** what the module says of itself (the registry's `inf`, as text) */
  info?: string;
  /** its rights holder, when the registry names one (`lic`) */
  licence?: string;
  region?: string;
  /** where to download it, mirrors in order */
  urls: string[];
}

/** How the kept list is made (parseRegistry): another one here = the kept list is read again. */
export const CATALOG_FORMAT = 1;

export interface CatalogList {
  format?: number;
  version: number;
  fetchedAt: number;
  entries: CatalogEntry[];
}

interface RawEntry {
  abr?: unknown;
  fil?: unknown;
  des?: unknown;
  lds?: unknown;
  lng?: unknown;
  siz?: unknown;
  upd?: unknown;
  url?: unknown;
  hid?: unknown;
  inf?: unknown;
  lic?: unknown;
  reg?: unknown;
}

/** «690K», «12.3M», «1G» → bytes (0 when unreadable). */
export function parseSize(s: unknown): number {
  const m = /^\s*([\d.,]+)\s*([KMG]?)/i.exec(String(s ?? ''));
  if (!m) return 0;
  const n = Number(m[1].replace(',', '.'));
  const mult = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[m[2].toUpperCase()] ?? 1;
  return Number.isFinite(n) ? Math.round(n * mult) : 0;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** The registry's HTML notes as plain text: breaks kept, tags gone, at most `max` characters. */
export function htmlText(html: unknown, max = 600): string {
  const text = String(html ?? '')
    .replace(/<\s*\/?\s*(br|p|h\d|div|li)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#\d+|[a-z]+);/gi, (all, e: string) =>
      e[0] === '#' ? String.fromCodePoint(Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? all),
    )
    .replace(/[ \t\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * A registry name that can be a file name in modules/ on every system: no folders, nothing
 * Windows refuses (`<>:"|?*`, control characters, a trailing dot or space, CON / NUL …).
 */
export function safeName(fil: string): boolean {
  if (fil.length > 120 || fil.startsWith('.') || /[. ]$/.test(fil)) return false;
  if ([...fil].some((c) => c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c))) return false;
  return !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(fil);
}

/** Which library kind a registry file name is (null: a kind the app doesn't read). */
export function kindOfFil(fil: string): ModuleKind | null {
  const dot = fil.lastIndexOf('.');
  if (dot < 0) return 'bibles';
  return SUFFIX_KIND[fil.slice(dot + 1).toLowerCase()] ?? null;
}

/** The file a module of this kind is kept as in modules/ — the names the builder looks for. */
export function moduleFileName(fil: string, kind: ModuleKind): string {
  const base = kindOfFil(fil) === 'bibles' ? fil : fil.slice(0, fil.lastIndexOf('.'));
  return `${base}${KIND_SUFFIX[kind]}.SQLite3`;
}

/**
 * The registry's JSON → the modules the library can take: Bibles, dictionaries, commentaries,
 * cross-references, none hidden, each with its download addresses (HTTPS mirrors only, by the
 * registry's priority).
 */
export function parseRegistry(raw: unknown): { version: number; entries: CatalogEntry[] } {
  const r = (raw ?? {}) as { version?: unknown; hosts?: unknown; downloads?: unknown };
  const hosts = new Map<string, { path: string; priority: number }>();
  for (const h of Array.isArray(r.hosts) ? r.hosts : []) {
    const alias = String(h?.alias ?? '');
    const p = String(h?.path ?? '');
    if (alias && p.startsWith('https://') && p.includes('%s'))
      hosts.set(alias, { path: p, priority: Number(h?.priority) || 9 });
  }
  const entries: CatalogEntry[] = [];
  for (const e of (Array.isArray(r.downloads) ? r.downloads : []) as RawEntry[]) {
    const fil = typeof e?.fil === 'string' ? e.fil.trim() : '';
    if (!fil || e.hid === true || !safeName(fil)) continue;
    const kind = kindOfFil(fil);
    if (!kind) continue;
    const urls = (Array.isArray(e.url) ? e.url : [])
      .map((u) => /^\{(\w+)\}(.+)$/.exec(String(u)))
      .filter((m): m is RegExpExecArray => !!m && hosts.has(m[1]))
      .map((m) => ({ ...hosts.get(m[1])!, rest: m[2] }))
      .sort((a, b) => a.priority - b.priority)
      // most are percent-encoded already («UBIO%2762»), a few are not («РИ ББД»)
      .map((h) =>
        h.path.replace('%s', /%[0-9a-f]{2}/i.test(h.rest) ? h.rest : encodeURIComponent(h.rest)),
      );
    if (!urls.length) continue;
    const titles: Record<string, string> = {};
    for (const l of Array.isArray(e.lds) ? e.lds : [])
      if (l && typeof l.lng === 'string' && typeof l.des === 'string') titles[l.lng] = l.des;
    const info = htmlText(e.inf);
    const lic = typeof e.lic === 'string' && e.lic.trim() !== '*' ? htmlText(e.lic, 300) : '';
    entries.push({
      fil,
      abbr: String(e.abr ?? fil),
      kind,
      lang: typeof e.lng === 'string' ? e.lng : '',
      title: String(e.des ?? '').trim(),
      ...(Object.keys(titles).length ? { titles } : {}),
      size: parseSize(e.siz),
      updated: String(e.upd ?? ''),
      ...(info ? { info } : {}),
      ...(lic ? { licence: lic } : {}),
      ...(typeof e.reg === 'string' && e.reg ? { region: e.reg } : {}),
      urls,
    });
  }
  return { version: Number(r.version) || 0, entries };
}

/** What a page gets of an entry: everything but the mirrors (the server downloads; ≈ a third less). */
export type CatalogRow = Omit<CatalogEntry, 'urls'>;

export function forPage(l: CatalogList & { stale?: boolean }) {
  return {
    version: l.version,
    fetchedAt: l.fetchedAt,
    ...(l.stale ? { stale: true } : {}),
    entries: l.entries.map((e): CatalogRow => {
      const row: Partial<CatalogEntry> = { ...e };
      delete row.urls;
      return row as CatalogRow;
    }),
  };
}

/** The module files in modules/, by kind — the same names the builder takes (build.ts). */
export function listModuleFiles(dir: string): Record<ModuleKind, string[]> {
  const out: Record<ModuleKind, string[]> = {
    bibles: [],
    dictionaries: [],
    commentaries: [],
    crossreferences: [],
    subheadings: [],
  };
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const f of names) {
    if (!/\.sqlite3$/i.test(f)) continue;
    const m =
      /\.(dictionary|commentaries|crossreferences|subheadings|devotions|plan|bundle|referencedata)\.sqlite3$/i.exec(
        f,
      );
    if (!m) out.bibles.push(f);
    else if (SUFFIX_KIND[m[1].toLowerCase()]) out[SUFFIX_KIND[m[1].toLowerCase()]].push(f);
  }
  for (const k of MODULE_KINDS) out[k].sort((a, b) => a.localeCompare(b));
  return out;
}

/** A Module database's kind, read from its tables in memory (a WAL file's header is patched for it). */
export function moduleKindOf(data: Buffer): ModuleKind | null {
  if (data.length < 100 || data.toString('latin1', 0, 15) !== 'SQLite format 3') return null;
  const b18 = data[18];
  const b19 = data[19];
  // a WAL-mode image can't be opened from memory: read it as a rollback one, then put the bytes back
  data[18] = 1;
  data[19] = 1;
  let db: Database.Database | undefined;
  try {
    db = new Database(data, { readonly: true });
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((t) => t.name);
    const k = moduleKind(tables);
    return k === 'bible' ? 'bibles' : k === 'dictionary' ? 'dictionaries' : k;
  } catch {
    return null;
  } finally {
    db?.close();
    data[18] = b18;
    data[19] = b19;
  }
}

export interface Placed {
  name: string;
  kind: ModuleKind;
  /** already in modules/ — kept as it was, never written over */
  present?: boolean;
}

/**
 * The module's zip → files in modules/. Each member is named by what it holds, not by its name in
 * the zip: some zips carry the text AND its notes, member names sometimes empty (found 2026-10-01 —
 * a bulk download once saved the notes under the Bible's name). A file already there stays.
 */
export async function placeModule(zipBuf: Buffer, fil: string, dir: string): Promise<Placed[]> {
  const members = (await unzip(zipBuf, 4 * MAX_MODULE_BYTES)).filter((m) => m.data.length > 0);
  await fsp.mkdir(dir, { recursive: true });
  const have = new Set(fs.readdirSync(dir).map((f) => f.toLowerCase()));
  const out: Placed[] = [];
  for (const [i, m] of members.entries()) {
    const kind = moduleKindOf(m.data);
    if (!kind) continue;
    const name = moduleFileName(fil, kind);
    if (out.some((p) => p.name === name)) continue; // two members of one kind: the first
    if (have.has(name.toLowerCase())) {
      out.push({ name, kind, present: true });
      continue;
    }
    const tmp = path.join(dir, `.vo-download-${process.pid}-${i}.tmp`);
    try {
      await fsp.writeFile(tmp, m.data);
      await fsp.rename(tmp, path.join(dir, name));
    } catch (err) {
      await fsp.rm(tmp, { force: true });
      throw err;
    }
    have.add(name.toLowerCase());
    out.push({ name, kind });
  }
  return out;
}

/**
 * The selection with these files in it. A kind listed by name gains them; a kind on «all» (null)
 * takes them anyway; no selection yet — the builder seeds one on its next run.
 */
export function withFiles(
  sel: LibrarySelection | undefined,
  files: Placed[],
): LibrarySelection | null {
  if (!sel) return null;
  const next: LibrarySelection = { ...sel };
  let changed = false;
  for (const f of files) {
    const list = next[f.kind];
    if (list === null) continue;
    if (list.some((n) => n.toLowerCase() === f.name.toLowerCase())) continue;
    next[f.kind] = [...list, f.name];
    changed = true;
  }
  return changed ? next : null;
}

export type DownloadPhase = 'waiting' | 'downloading' | 'placing' | 'done' | 'failed' | 'cancelled';

export interface DownloadItem {
  fil: string;
  abbr: string;
  phase: DownloadPhase;
  got: number;
  total: number;
  /** the files it left in modules/ */
  files?: Placed[];
  /** a dictionary key with its values: why it failed, or a word about what came */
  note?: { key: string; vars?: Record<string, string> };
}

export interface CatalogQueue {
  items: DownloadItem[];
}

export interface CatalogDeps {
  dataDir: string;
  /** where the builder reads modules from (MODULES_DIR, else the project's modules/) */
  modulesDir: () => string;
  version: string;
  fetch?: typeof fetch;
  /** no byte for this long: the next mirror (tests make it short) */
  stallMs?: number;
  /** the selection now / write it (serverSettings.ts — the builder's key, re-read first) */
  selection: () => LibrarySelection | undefined;
  setSelection: (sel: LibrarySelection) => void;
  /** the queue is through and something came: rebuild the library (after a build under way) */
  rebuild: () => void;
  onChange?: (q: CatalogQueue) => void;
}

/** The registry's files start with a byte-order mark (UTF-8 BOM). */
const noBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/** «VerseOrchestrator/1.15.0 (+https://github.com/MazzDann/VerseOrchestrator)» — the app says who asks. */
export const userAgent = (version: string) =>
  `VerseOrchestrator/${version} (+https://github.com/MazzDann/VerseOrchestrator)`;

export function createCatalog(d: CatalogDeps) {
  const get = d.fetch ?? fetch;
  const stallMs = d.stallMs ?? STALL_MS;
  const file = path.join(d.dataDir, 'catalog', 'registry.json');
  const headers = { 'User-Agent': userAgent(d.version) };
  let list: CatalogList | null = null;
  let loading: Promise<CatalogList> | null = null;
  let items: DownloadItem[] = [];
  let running = false;
  let abort: AbortController | null = null;
  let lastNote = 0;

  const queue = (): CatalogQueue => ({ items: items.map((i) => ({ ...i })) });
  const changed = (force = true) => {
    const now = Date.now();
    if (!force && now - lastNote < 250) return;
    lastNote = now;
    d.onChange?.(queue());
  };

  function stored(): CatalogList | null {
    if (list) return list;
    const s = readJson<CatalogList | null>(file, null);
    if (s && Array.isArray(s.entries) && s.format === CATALOG_FORMAT) list = s;
    return list;
  }

  async function fetchRegistry(have: CatalogList | null): Promise<CatalogList> {
    let lastErr: unknown = null;
    for (const url of REGISTRIES) {
      try {
        if (have) {
          // the version alone first: unchanged → the list stays, only its date moves
          const info = await get(url.replace(/registry\.zip$/, 'registry_info.json'), {
            headers,
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (info.ok) {
            const v = Number(JSON.parse(noBom(await info.text()))?.version);
            if (v && v === have.version) return { ...have, fetchedAt: Date.now() };
          }
        }
        const res = await get(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const entries = await unzip(Buffer.from(await res.arrayBuffer()), 64 * 1024 ** 2);
        const json = entries.find((e) => /registry\.json$/i.test(e.name));
        if (!json) throw new Error('no registry.json');
        const parsed = parseRegistry(JSON.parse(noBom(json.data.toString('utf8'))));
        if (!parsed.entries.length) throw new Error('empty registry');
        return { format: CATALOG_FORMAT, ...parsed, fetchedAt: Date.now() };
      } catch (err) {
        lastErr = err;
      }
    }
    console.warn(`[catalog] registry: ${(lastErr as Error)?.message ?? lastErr}`);
    throw new LibraryError(
      502,
      N_('Каталог Module зараз недоступний. Перевірте інтернет і спробуйте пізніше.'),
    );
  }

  /** The catalog: kept on disk, looked at again when a day old (or when asked). */
  async function catalog(refresh = false): Promise<CatalogList & { stale?: boolean }> {
    const have = stored();
    if (have && !refresh && Date.now() - have.fetchedAt < REFRESH_MS) return have;
    loading ??= fetchRegistry(have)
      .then((l) => {
        list = l;
        try {
          writeJson(file, l);
        } catch (err) {
          console.warn(`[catalog] ${(err as Error).message}`);
        }
        return l;
      })
      .finally(() => (loading = null));
    try {
      return await loading;
    } catch (err) {
      // offline: the list we have is still a list
      if (have) return { ...have, stale: true };
      throw err;
    }
  }

  /**
   * The selection as it stands — or, with none written yet, the one the builder would seed for
   * this folder («all» for a kind of ≤ 60 files): written with the new file, so the builder's seed
   * from an older library can't leave the download out (review).
   */
  function selectionNow(): LibrarySelection {
    const had = d.selection();
    if (had) return had;
    const files = listModuleFiles(d.modulesDir());
    const seed = {} as LibrarySelection;
    for (const k of MODULE_KINDS) seed[k] = files[k].length <= LIBRARY_ALL_LIMIT ? null : [];
    return seed;
  }

  async function download(
    item: DownloadItem,
    entry: CatalogEntry,
    signal: AbortSignal,
  ): Promise<Buffer> {
    let failed = false;
    for (const url of entry.urls) {
      // a mirror that stops sending is left for the next one (review: the one queue stood still)
      const stall = new AbortController();
      let timer = setTimeout(() => stall.abort(), stallMs);
      try {
        const res = await get(url, { headers, signal: AbortSignal.any([signal, stall.signal]) });
        if (!res.ok || !res.body) {
          failed = true;
          continue;
        }
        item.total = Number(res.headers.get('content-length')) || entry.size;
        item.got = 0;
        const parts: Buffer[] = [];
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          clearTimeout(timer);
          timer = setTimeout(() => stall.abort(), stallMs);
          parts.push(Buffer.from(chunk));
          item.got += chunk.length;
          if (item.got > MAX_MODULE_BYTES) throw new Error('too big');
          changed(false);
        }
        return Buffer.concat(parts);
      } catch (err) {
        if (signal.aborted) throw err;
        failed = true;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new LibraryError(
      502,
      failed
        ? N_('Не вдалося завантажити модуль: дзеркала Module не відповідають')
        : N_('Для цього модуля немає адреси для завантаження'),
    );
  }

  async function pump(): Promise<void> {
    if (running) return;
    running = true;
    let came = false;
    try {
      for (let item = next(); item; item = next()) {
        const entry = list?.entries.find((e) => e.fil === item.fil);
        abort = new AbortController();
        try {
          if (!entry)
            throw new LibraryError(404, N_('Модуля «{name}» немає в каталозі'), { name: item.fil });
          item.phase = 'downloading';
          changed();
          const zip = await download(item, entry, abort.signal);
          item.phase = 'placing';
          changed();
          const files = await placeModule(zip, entry.fil, d.modulesDir());
          if (!files.length)
            throw new LibraryError(422, N_('У завантаженому файлі немає модуля Module'));
          item.files = files;
          item.phase = 'done';
          if (entry.kind === 'bibles' && !files.some((f) => f.kind === 'bibles'))
            item.note = { key: N_('У цьому модулі лише примітки, без тексту Біблії') };
          const had = d.selection();
          const sel = withFiles(had ?? selectionNow(), files) ?? (had ? null : selectionNow());
          if (sel) d.setSelection(sel);
          if (sel || files.some((f) => !f.present)) came = true;
        } catch (err) {
          if (abort.signal.aborted) item.phase = 'cancelled';
          else {
            item.phase = 'failed';
            item.note =
              err instanceof LibraryError
                ? {
                    key: err.key,
                    ...(err.vars ? { vars: err.vars as Record<string, string> } : {}),
                  }
                : {
                    key: N_('Не вдалося зберегти модуль: {error}'),
                    vars: { error: (err as Error).message },
                  };
            console.warn(`[catalog] ${item.fil}: ${(err as Error).message}`);
          }
        } finally {
          abort = null;
          changed();
        }
      }
    } finally {
      running = false;
    }
    if (came) d.rebuild();
  }

  function next(): DownloadItem | undefined {
    return items.find((i) => i.phase === 'waiting');
  }

  return {
    catalog,
    queue,
    /** modules/ by kind, with the selection: what «У бібліотеці» shows */
    modules: () => ({
      dir: d.modulesDir(),
      files: listModuleFiles(d.modulesDir()),
      selection: d.selection() ?? null,
    }),
    /** «Завантажити»: in the queue, one at a time */
    enqueue(fil: string): CatalogQueue {
      const entry = stored()?.entries.find((e) => e.fil === fil);
      if (!entry)
        throw new LibraryError(404, N_('Модуля «{name}» немає в каталозі'), { name: fil });
      if (
        items.some(
          (i) =>
            i.fil === fil &&
            (i.phase === 'waiting' || i.phase === 'downloading' || i.phase === 'placing'),
        )
      )
        return queue();
      // a new run: what the last one finished leaves the list
      if (
        !items.some(
          (i) => i.phase === 'waiting' || i.phase === 'downloading' || i.phase === 'placing',
        )
      )
        items = [];
      items.push({ fil, abbr: entry.abbr, phase: 'waiting', got: 0, total: entry.size });
      changed();
      void pump();
      return queue();
    },
    cancel(fil: string): CatalogQueue {
      const item = items.find(
        (i) => i.fil === fil && (i.phase === 'waiting' || i.phase === 'downloading'),
      );
      if (item?.phase === 'waiting') {
        item.phase = 'cancelled';
        changed();
      } else if (item) abort?.abort();
      return queue();
    },
    /** «У бібліотеці»: which files of a kind the library takes (names that are in modules/) */
    select(kind: ModuleKind, files: string[]): LibrarySelection {
      const have = new Map(listModuleFiles(d.modulesDir())[kind].map((f) => [f.toLowerCase(), f]));
      const names = [
        ...new Set(
          files.map((f) => have.get(String(f).toLowerCase())).filter((f): f is string => !!f),
        ),
      ];
      const sel = { ...selectionNow(), [kind]: names };
      d.setSelection(sel);
      return sel;
    },
  };
}

export type Catalog = ReturnType<typeof createCatalog>;
