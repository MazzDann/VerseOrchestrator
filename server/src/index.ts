import { spawn } from 'node:child_process';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ApiError, closeDb, library, libraryInfo, libraryPath } from './db.js';
import { isLocalRequest, lanIps } from './access.js';
import {
  announceShutdown,
  attachLiveHub,
  dropRemote,
  getLive,
  pauseLive,
  isRemoteOnline,
  notifyAllowed,
  notifyRemotesChanged,
  publishLive,
  viewerCount,
  controlCount,
} from './live.js';
import {
  createPairing,
  initRemoteStore,
  listPairings,
  reissuePairing,
  revokePairing,
  setPairingAllowed,
  setRemotePersistence,
} from './remote.js';
import {
  getServerSettings,
  initServerSettings,
  updateServerSettings,
  validStandbyPort,
} from './serverSettings.js';
import { currentEntry, isAutostartOn, setAutostart } from './autostart.js';
import { getUiState, initUiState, isUiKey, saveUiEntry } from './uiState.js';
import { parseSongImport, syncSongsAtStart } from './songs.js';
import { createUpdateChecker } from './updates.js';
import { readLayout } from './layout.js';
import { createInstaller, hasRollback } from './installer.js';
import { precompressed } from './precompressed.js';
import {
  bundlesDir,
  importSongs,
  listBundles,
  refreshLibrarySongs,
  renameBundle,
  restoreBundle,
  snapshotBundle,
  trashBundle,
  undoImport,
  type ImportUndo,
} from '@vo/shared/songs-node';
import { keyedError, N_, sameBundleName } from '@vo/shared';
import { createShortcut } from './shortcut.js';
import { CONTROL_HEADER, portFree, waiterAt } from './standby.js';

const app = express();
const json = express.json({ limit: '1mb' });
// the UI state (0.7.4) and a song import (0.10.1) are big: their own, larger limits
const ownParser = new Set(['/api/ui-state', '/api/song-bundles/import']);
app.use((req, res, next) => (ownParser.has(req.path) ? next() : json(req, res, next)));

const PORT = Number(process.env.PORT ?? 8787);
/**
 * Loopback only: phones reach the app through the Vite dev server (bound to the LAN
 * for follow-along), which proxies `/api` here — nothing needs this port directly.
 */
const HOST = process.env.HOST ?? '127.0.0.1';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/**
 * Server-side state files (git-ignored): `settings.json` = options, `secrets.json` =
 * remote tokens (hashed) and any future credentials. Kept apart so options can be shared
 * or edited freely while secrets stay private.
 */
const dataDir = process.env.VO_DATA_DIR ?? path.join(repoRoot, 'data');
const settings = initServerSettings(path.join(dataDir, 'settings.json'));
initUiState(path.join(dataDir, 'ui-state.json'));
initRemoteStore({ file: path.join(dataDir, 'secrets.json'), persist: settings.remotes.persist });
try {
  syncSongsAtStart({ dataDir, repoRoot, libraryPath, log: (m) => console.log(`[server] ${m}`) });
} catch (err) {
  console.warn(`[server] songs: ${(err as Error).message}`);
}

/** A library rebuild (builder process) is in flight — guard against overlapping runs. */
let rebuilding = false;

function asInt(value: unknown, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new ApiError(400, `Invalid ${name}`);
  return n;
}

/**
 * Route adapter: runs a (sync or async) handler and maps errors to JSON — an ApiError
 * (the library's LibraryError) keeps its status, anything else is a 500.
 */
const wrap =
  (handler: (req: express.Request, res: express.Response) => unknown) =>
  (req: express.Request, res: express.Response) => {
    Promise.resolve()
      .then(() => handler(req, res))
      .catch((err) => {
        if (err instanceof ApiError) {
          // the key and its values apart too: the page shows it in its own language (0.11.6)
          res.status(err.status).json(keyedError(err.key, err.vars));
        } else {
          console.error(err);
          res.status(500).json({ error: (err as Error).message });
        }
      });
  };

/**
 * Guard for routes that change state. Only the operator's machine may write; phones on
 * the LAN are read-only viewers. The custom header forces a CORS preflight (which this
 * server never answers), so a random web page open in the operator's browser can't fire
 * these as "simple" cross-site requests either. Future remote roles (e.g. a speaker
 * remote paired via QR) would extend this check with a token rather than open the LAN.
 */
const requireLocalControl: express.RequestHandler = (req, res, next) => {
  if (req.get('x-vo-control') !== '1' || !isLocalRequest(req)) {
    res.status(403).json({ error: N_('Керування доступне лише з цього комп’ютера') });
    return;
  }
  next();
};

const appVersion = (
  JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string }
).version;
// the version too: after an update the swap asks the new app who it is (swap.ts)
app.get('/api/health', (_req, res) => res.json({ ok: true, version: appVersion }));

/**
 * Audience "follow-along": the control window POSTs the current slide here; it's pushed
 * to phones over the WebSocket hub (live.ts), and `GET /api/live` stays as the polling
 * fallback. In memory only — it's live state, not data.
 */
app.post(
  '/api/live',
  requireLocalControl,
  wrap((req, res) => {
    const version = publishLive(req.body ?? null);
    res.json({ ok: true, version, viewers: viewerCount() });
  }),
);

app.post(
  '/api/live/pause',
  requireLocalControl,
  wrap((_req, res) => res.json({ ok: true, version: pauseLive() })),
);

app.get(
  '/api/live',
  wrap((_req, res) => res.json(getLive())),
);

/**
 * Speaker remotes (remote.ts): the operator pairs a phone, which gets a scoped token via
 * QR and then drives the show over the live WebSocket. All management is local-only; the
 * token is returned once, at creation, and never listed again.
 */
const requireLocal: express.RequestHandler = (req, res, next) => {
  if (!isLocalRequest(req)) {
    res.status(403).json({ error: N_('Керування доступне лише з цього комп’ютера') });
    return;
  }
  next();
};

/** «Ярлик на робочому столі» (0.7.5, Налаштування вигляду → Застосунок): shortcut.ts. */
app.post(
  '/api/shortcut',
  requireLocalControl,
  wrap((_req, res) => res.json({ files: createShortcut(repoRoot) })),
);

/** The operator's UI state kept in data/ (uiState.ts, 0.7.4) — this machine only. */
app.get('/api/ui-state', requireLocal, (_req, res) => res.json(getUiState()));

app.put(
  '/api/ui-state',
  requireLocalControl,
  express.json({ limit: '16mb' }),
  wrap((req, res) => {
    const { key, value, at } = (req.body ?? {}) as { key?: unknown; value?: unknown; at?: unknown };
    if (!isUiKey(key) || typeof value !== 'string' || typeof at !== 'number')
      throw new ApiError(400, N_('Очікую { key, value, at }'));
    res.json(saveUiEntry(key, value, at));
  }),
);

app.post(
  '/api/remote',
  requireLocalControl,
  wrap((req, res) => {
    const p = createPairing(String(req.body?.name ?? ''), req.body?.allowed);
    notifyRemotesChanged();
    res.json({ id: p.id, name: p.name, allowed: p.allowed, token: p.token });
  }),
);

app.get(
  '/api/remote',
  requireLocal,
  wrap((_req, res) => res.json(listPairings(isRemoteOnline))),
);

app.put(
  '/api/remote/:id',
  requireLocalControl,
  wrap((req, res) => {
    const p = setPairingAllowed(String(req.params.id), req.body?.allowed);
    if (!p) throw new ApiError(404, N_('Пульт не знайдено'));
    notifyAllowed(p.id, p.allowed);
    res.json({ id: p.id, name: p.name, allowed: p.allowed });
  }),
);

app.post(
  '/api/remote/:id/reissue',
  requireLocalControl,
  wrap((req, res) => {
    const p = reissuePairing(String(req.params.id));
    if (!p) throw new ApiError(404, N_('Пульт не знайдено'));
    dropRemote(p.id, 'reissued'); // the phone holding the old code loses control now
    res.json({ id: p.id, name: p.name, allowed: p.allowed, token: p.token });
  }),
);

/**
 * Library segments (npm run build:segments): per-translation / per-dictionary gzip'd
 * SQLite files a browser engine downloads selectively. The manifest lists sizes and
 * SHA-256; files are served as opaque gzip bytes (the client inflates them, exactly as
 * it does for a dropped file) with an ETag so a cached copy is revalidated, not refetched.
 */
const segmentsDir = path.join(dataDir, 'segments');
app.get(
  '/api/segments',
  wrap((_req, res) => {
    const file = path.join(segmentsDir, 'manifest.json');
    if (!fs.existsSync(file)) {
      throw new ApiError(404, N_('Сегменти ще не зібрано. Запустіть: npm run build:segments'));
    }
    res.set('Cache-Control', 'no-cache').type('json').send(fs.readFileSync(file));
  }),
);
app.use(
  '/api/segments',
  express.static(segmentsDir, {
    index: false,
    dotfiles: 'deny',
    etag: true,
    setHeaders: (res, filePath) => {
      res.setHeader('Cache-Control', 'no-cache'); // revalidate by ETag
      if (filePath.endsWith('.gz')) res.setHeader('Content-Type', 'application/gzip');
    },
  }),
);

/** Server options (settings.json) — never secrets. */
app.get(
  '/api/server-settings',
  requireLocal,
  wrap((_req, res) => res.json(getServerSettings())),
);

app.put(
  '/api/server-settings',
  requireLocalControl,
  wrap((req, res) => {
    const next = updateServerSettings(req.body);
    setRemotePersistence(next.remotes.persist); // off → secrets.json no longer lists remotes
    res.json(next);
  }),
);

// --- Updates (1.0.0): is there a newer release? The control window asks; nothing is installed.

const updates = createUpdateChecker({
  current: appVersion,
  install: readLayout(repoRoot) ? 'release' : 'source',
  isEnabled: () => getServerSettings().updates.check,
});

// Is a control window open on this machine? The start file and the shortcut then open no
// second one (1.1.0, launcher.ts).
app.get('/api/control-windows', requireLocal, (_req, res) => res.json({ open: controlCount() }));

// Installing (1.0.0): only a copy in the release layout, whose app/ can be replaced
const release = readLayout(repoRoot);
const releaseTop = release ? path.dirname(repoRoot) : null;
const installer = releaseTop ? createInstaller({ top: releaseTop, dataDir }) : null;

// a swap — an update or a rollback — leaves the helper's copy of Node, its plan and the
// release's top files behind: they go at the next start once the helper has finished (the app
// the swap starts runs before the helper writes its result, so what it holds stays till then)
installer?.tidy();

async function updateAnswer(force: boolean) {
  const s = await updates.check(force);
  let install = installer?.state() ?? null;
  // downloaded by an earlier run and not installed yet: ready all the same
  if (install?.phase === 'idle' && s.latest && installer?.readyVersion() === s.latest.version)
    install = { ...install, phase: 'ready', version: s.latest.version };
  const previous = installer?.previousVersion() ?? null;
  return {
    ...s,
    installer: install,
    lastUpdate: installer?.lastSwap(appVersion) ?? null,
    // what the last update left behind, to go back to (1.4.0)
    previous,
    // …and whether it can come back here by itself (1.4.0 or later) or only by an update (1.4.1)
    previousHasRollback: previous ? hasRollback(previous) : null,
  };
}

/** Not while an update unpacks or the app restarts (1.4.1): installer.notNow(). */
function refuseIfNotNow(inst: NonNullable<typeof installer>) {
  const why = inst.notNow();
  if (why) throw new ApiError(409, why);
}

app.get(
  '/api/update',
  requireLocal,
  wrap(async (_req, res) => res.json(await updateAnswer(false))),
);

app.post(
  '/api/update/check',
  requireLocalControl,
  wrap(async (_req, res) => res.json(await updateAnswer(true))),
);

app.post(
  '/api/update/download',
  requireLocalControl,
  wrap(async (_req, res) => {
    const s = updates.state();
    if (!installer)
      throw new ApiError(409, N_('Оновлювати сам уміє лише застосунок з архіву релізу'));
    if (!s.available || !s.latest) throw new ApiError(409, N_('Новішої версії немає'));
    installer.start(s.latest);
    res.status(202).json(await updateAnswer(false));
  }),
);

/**
 * Hand over to the swap helper (swap.ts): `app.next/` becomes `app/` — a new version, or the one
 * before it («Повернути попередню версію», 1.4.0) — then this app and its waiter stop.
 */
function startSwap(
  inst: NonNullable<typeof installer>,
  version: string,
  kind: 'update' | 'rollback',
  res: express.Response,
) {
  const waiterPid = process.env.VO_STANDBY === '1' ? process.ppid : null;
  const port = Number(process.env.VO_STANDBY_PORT) || getServerSettings().standby.port;
  // the helper runs outside app/, with a copy of this Node: nothing in app/ may stay in use
  const helper = inst.prepareSwap({
    execPath: process.execPath,
    script: path.join(repoRoot, 'server', 'src', 'swap.ts'),
    kind,
    from: appVersion,
    to: version,
    pids: waiterPid ? [process.pid, waiterPid] : [process.pid],
    port,
  });
  spawn(helper.node, ['--disable-warning=ExperimentalWarning', helper.script, helper.plan], {
    cwd: inst.updatesDir,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
  inst.markRestarting();
  res.json({ ok: true, from: appVersion, to: version });
  // after the answer: our waiter stops us and itself; the helper waits for both
  setTimeout(() => {
    if (waiterPid) void tellWaiter(port, 'update');
    setTimeout(() => process.exit(0), waiterPid ? 3000 : 300);
  }, 300);
}

app.post(
  '/api/update/restart',
  requireLocalControl,
  wrap(async (_req, res) => {
    const s = updates.state();
    if (installer) refuseIfNotNow(installer);
    const version = installer?.readyVersion();
    if (!installer || !version || !s.latest || version !== s.latest.version)
      throw new ApiError(409, N_('Оновлення ще не завантажено'));
    startSwap(installer, version, 'update', res);
  }),
);

// «Повернути попередню версію» (1.4.0): back to what the last update replaced — not while an
// update unpacks; a download under way gives way (1.4.1)
app.post(
  '/api/update/rollback',
  requireLocalControl,
  wrap(async (_req, res) => {
    if (!installer)
      throw new ApiError(409, N_('Оновлювати сам уміє лише застосунок з архіву релізу'));
    refuseIfNotNow(installer);
    const version = installer.previousVersion();
    if (!version) throw new ApiError(409, N_('Попередньої версії немає'));
    startSwap(installer, version, 'rollback', res);
  }),
);

// the first look a little after the start, then twice a day (check() skips a fresh answer);
// never from the tests
if (!process.env.VITEST) {
  setTimeout(() => void updates.check(), 15_000).unref();
  setInterval(() => void updates.check(), 60 * 60 * 1000).unref();
}

// --- Standby waiter (0.5.2): «Запускати застосунок за адресою» in the control window.

const standbyScript = path.join(repoRoot, 'server', 'src', 'standby.ts');
const autostart = currentEntry(repoRoot);

function tellWaiter(
  port: number,
  action: 'retire' | 'resume' | 'relaunch' | 'shutdown' | 'update',
): Promise<unknown> {
  return fetch(`http://127.0.0.1:${port}/__standby/${action}`, {
    method: 'POST',
    headers: { [CONTROL_HEADER]: '1' },
    signal: AbortSignal.timeout(1500),
  }).catch(() => undefined);
}

function startWaiter(): void {
  spawn(process.execPath, ['--disable-warning=ExperimentalWarning', standbyScript], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  }).unref();
}

async function standbyState() {
  const { port, idleMinutes } = getServerSettings().standby;
  const lan = lanIps().map((ip) => `http://${ip}:${port}`);
  return {
    enabled: isAutostartOn(autostart),
    supported: !!autostart,
    port,
    idleMinutes,
    waiter: await waiterAt(port),
    /** this app was started by the waiter (so a relaunch reloads this very page elsewhere) */
    underWaiter: process.env.VO_STANDBY === '1',
    urls: { local: `http://localhost:${port}`, lan },
  };
}

app.get(
  '/api/standby',
  requireLocal,
  wrap(async (_req, res) => res.json(await standbyState())),
);

app.put(
  '/api/standby',
  requireLocalControl,
  wrap(async (req, res) => {
    const body = (req.body ?? {}) as { enabled?: unknown; port?: unknown };
    const before = getServerSettings().standby;
    const running = await waiterAt(before.port);
    let relaunch = false;
    if (body.port !== undefined && body.port !== before.port) {
      if (!validStandbyPort(body.port)) {
        throw new ApiError(400, N_('Порт — ціле число від 1024 до 65535, крім 5173 і 8787'));
      }
      if (!(await portFree(body.port))) {
        throw new ApiError(409, N_('Порт {port} уже зайнятий іншою програмою — виберіть інший'), {
          port: body.port,
        });
      }
      updateServerSettings({ standby: { port: body.port } });
      relaunch = !!running; // a waiter on the old port moves over
    }
    const port = getServerSettings().standby.port;
    if (body.enabled === true) {
      if (!running && !relaunch && !(await portFree(port))) {
        throw new ApiError(409, N_('Порт {port} зайнятий іншою програмою — змініть порт'), {
          port,
        });
      }
      setAutostart(autostart, true);
      if (!running) startWaiter();
      else if (running.retiring) await tellWaiter(before.port, 'resume');
    } else if (body.enabled === false) {
      setAutostart(autostart, false);
      if (running) await tellWaiter(before.port, 'retire'); // exits once the app is idle
      relaunch = false;
    }
    res.json({ ...(await standbyState()), relaunching: relaunch });
    // Relaunch AFTER answering: when this very app runs under the waiter, it is stopped.
    if (relaunch) setTimeout(() => void tellWaiter(before.port, 'relaunch'), 300);
  }),
);

/**
 * «Вимкнути повністю» (0.7.1, Налаштування вигляду → Застосунок): nothing of the app keeps
 * running or starts again with the computer. The autostart entry goes; every page is told (so
 * phones and remotes say «вимкнено», not «no connection»); then the waiter that started this
 * app shuts down — stopping it — or, run directly, this process exits. A waiter of «Запуск за
 * адресою» on its own port (not this app's parent) is shut down as well.
 */
app.post(
  '/api/shutdown',
  requireLocalControl,
  wrap(async (_req, res) => {
    const autostartRemoved = isAutostartOn(autostart);
    if (autostartRemoved) setAutostart(autostart, false);
    const ours =
      process.env.VO_STANDBY === '1' ? Number(process.env.VO_STANDBY_PORT) || null : null;
    const configured = getServerSettings().standby.port;
    const other = configured !== ours && (await waiterAt(configured)) ? configured : null;
    announceShutdown();
    res.json({ ok: true, autostartRemoved });
    // after the answer and the frames have left
    setTimeout(() => {
      if (other) void tellWaiter(other, 'shutdown');
      // our waiter stops this process; should it not answer, go anyway
      if (ours) void tellWaiter(ours, 'shutdown');
      setTimeout(() => process.exit(0), ours ? 3000 : 300);
    }, 300);
  }),
);

app.delete(
  '/api/remote/:id',
  requireLocalControl,
  wrap((req, res) => {
    const id = String(req.params.id);
    if (!revokePairing(id)) throw new ApiError(404, N_('Пульт не знайдено'));
    dropRemote(id);
    res.json({ ok: true });
  }),
);

/** LAN IPv4 addresses so the control UI can build a phone-scannable follow URL (best first). */
app.get(
  '/api/host',
  wrap((_req, res) => res.json({ ips: lanIps() })),
);

app.get(
  '/api/translations',
  wrap(async (_req, res) => res.json(await library().getTranslations())),
);

app.get(
  '/api/library/info',
  wrap(async (_req, res) => res.json(libraryInfo())),
);

app.get(
  '/api/translations/:id/books',
  wrap(async (req, res) =>
    res.json(await library().getBooks(asInt(req.params.id, 'translation id'))),
  ),
);

app.get(
  '/api/translations/:id/books/:book/chapters',
  wrap(async (req, res) =>
    res.json(
      await library().getChapters(
        asInt(req.params.id, 'translation id'),
        asInt(req.params.book, 'book'),
      ),
    ),
  ),
);

app.get(
  '/api/translations/:id/books/:book/chapters/:chapter/verses',
  wrap(async (req, res) =>
    res.json(
      await library().getVerses(
        asInt(req.params.id, 'translation id'),
        asInt(req.params.book, 'book'),
        asInt(req.params.chapter, 'chapter'),
      ),
    ),
  ),
);

app.get(
  '/api/songs',
  wrap(async (req, res) =>
    res.json(
      await library().searchSongs(
        String(req.query.q ?? ''),
        60,
        req.query.bundle ? String(req.query.bundle) : undefined,
      ),
    ),
  ),
);

/** The song bundles in the library, by name, with their song counts (0.10.0). */
app.get(
  '/api/song-bundles',
  wrap(async (_req, res) => res.json(await library().listSongBundles())),
);

/** The bundle files themselves, with the ids an import names its target by (0.10.1). */
app.get(
  '/api/song-bundles/files',
  requireLocal,
  wrap(async (_req, res) =>
    res.json(
      listBundles(bundlesDir(dataDir)).map((b) => ({
        id: b.meta.id,
        name: b.meta.name,
        count: b.count,
        // a .pptx folder keeps it up to date (1.4.0: deleting it lasts only as long as the folder)
        ...(b.meta.source ? { source: b.meta.source } : {}),
      })),
    ),
  ),
);

/**
 * Import songs the browser read from .pptx files (0.10.1) into a bundle — an existing one
 * (`target.id`) or a new one (`target.name`) — then bring the library's songs up to date.
 */
app.post(
  '/api/song-bundles/import',
  requireLocalControl,
  express.json({ limit: '64mb' }),
  wrap(async (req, res) => {
    if (rebuilding)
      throw new ApiError(409, N_('Бібліотека саме перебудовується — спробуйте за хвилину'));
    const { target, songs } = parseSongImport(req.body);
    const dir = bundlesDir(dataDir);
    const existing = listBundles(dir);
    if ('id' in target && !existing.some((b) => b.meta.id === target.id)) {
      throw new ApiError(404, N_('Бандл не знайдено — відкрийте імпорт ще раз'));
    }
    // the library tells bundles apart by name: a second «ПС» would merge into the first
    if ('name' in target && existing.some((b) => sameBundleName(b.meta.name, target.name))) {
      throw new ApiError(409, N_('Бандл «{bundle}» уже є — виберіть його в списку'), {
        bundle: target.name,
      });
    }
    const started = Date.now();
    // what «Скасувати» needs (1.4.0): the bundle as it was, or that the import made it
    const before = 'id' in target ? existing.find((b) => b.meta.id === target.id) : undefined;
    const undo = before ? snapshotBundle(dir, before.file) : null;
    const done = importSongs(dir, target, songs);
    lastImport = undo ?? { file: done.bundle.file, created: true };
    const written = Date.now();
    const library = refreshSongs(dir);
    console.log(
      `[server] songs: import → «${done.bundle.meta.name}»: ${done.added} new, ${done.updated} updated` +
        ` (bundle ${written - started} ms, library ${Date.now() - written} ms)`,
    );
    res.json({
      bundle: { id: done.bundle.meta.id, name: done.bundle.meta.name, count: done.bundle.count },
      added: done.added,
      updated: done.updated,
      library,
    });
  }),
);

// ── Managing bundles (1.4.0): rename, delete with «Скасувати», undo the last import ─────

/** The last import, for its «Скасувати» (in memory: the undo is for right after it). */
let lastImport: ImportUndo | null = null;

/** The library's songs from the bundles again, after a bundle changed. */
function refreshSongs(dir: string): number | null {
  if (!fs.existsSync(libraryPath)) return null;
  const n = refreshLibrarySongs(libraryPath, dir);
  closeDb(); // the next read sees the new songs
  return n;
}

const notDuringRebuild = () => {
  if (rebuilding)
    throw new ApiError(409, N_('Бібліотека саме перебудовується — спробуйте за хвилину'));
};

app.put(
  '/api/song-bundles/:id',
  requireLocalControl,
  wrap(async (req, res) => {
    notDuringRebuild();
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 100)
      throw new ApiError(400, N_('Назва бандла — від 1 до 100 символів'));
    const dir = bundlesDir(dataDir);
    const id = String(req.params.id);
    if (listBundles(dir).some((b) => b.meta.id !== id && sameBundleName(b.meta.name, name)))
      throw new ApiError(409, N_('Бандл «{bundle}» уже є — виберіть іншу назву'), { bundle: name });
    const b = renameBundle(dir, id, name);
    if (!b) throw new ApiError(404, N_('Бандл не знайдено — відкрийте список ще раз'));
    lastImport = null; // the undo of an import doesn't reach across a rename
    refreshSongs(dir);
    console.log(`[server] songs: bundle renamed → «${b.meta.name}»`);
    res.json({ id: b.meta.id, name: b.meta.name, count: b.count });
  }),
);

app.delete(
  '/api/song-bundles/:id',
  requireLocalControl,
  wrap(async (req, res) => {
    notDuringRebuild();
    const dir = bundlesDir(dataDir);
    const gone = trashBundle(dir, String(req.params.id));
    if (!gone) throw new ApiError(404, N_('Бандл не знайдено — відкрийте список ще раз'));
    lastImport = null; // nor across a delete
    refreshSongs(dir);
    console.log(`[server] songs: bundle «${gone.bundle.meta.name}» deleted (kept for undo)`);
    res.json({
      trashed: gone.trashed,
      name: gone.bundle.meta.name,
      ...(gone.bundle.meta.source ? { source: gone.bundle.meta.source } : {}),
    });
  }),
);

app.post(
  '/api/song-bundles/restore',
  requireLocalControl,
  wrap(async (req, res) => {
    notDuringRebuild();
    const dir = bundlesDir(dataDir);
    const trashed = typeof req.body?.trashed === 'string' ? req.body.trashed : '';
    const b = trashed ? restoreBundle(dir, trashed) : null;
    if (!b) throw new ApiError(409, N_('Бандл уже не повернути'));
    lastImport = null;
    refreshSongs(dir);
    res.json({ id: b.meta.id, name: b.meta.name, count: b.count });
  }),
);

app.post(
  '/api/song-bundles/import/undo',
  requireLocalControl,
  wrap(async (_req, res) => {
    notDuringRebuild();
    const dir = bundlesDir(dataDir);
    const u = lastImport;
    lastImport = null;
    if (!u || !undoImport(dir, u)) throw new ApiError(409, N_('Імпорт уже не скасувати'));
    refreshSongs(dir);
    console.log('[server] songs: the last import undone');
    res.json({ ok: true });
  }),
);

app.get(
  '/api/songs/:id',
  wrap(async (req, res) => {
    const song = await library().getSong(asInt(req.params.id, 'song id'));
    if (!song) throw new ApiError(404, 'Song not found');
    res.json(song);
  }),
);

app.get(
  '/api/dictionaries',
  wrap(async (_req, res) => res.json(await library().listDictionaries())),
);

app.get(
  '/api/strong/:num',
  wrap(async (req, res) => {
    const book = req.query.book != null ? Number(req.query.book) : undefined;
    res.json(
      await library().lookupStrong(
        String(req.params.num),
        Number.isFinite(book) ? book : undefined,
      ),
    );
  }),
);

app.get(
  '/api/strong/:num/refs',
  wrap(async (req, res) => {
    const translation = req.query.translation != null ? Number(req.query.translation) : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    res.json(
      await library().strongRefs(String(req.params.num), {
        translationId:
          translation != null && Number.isInteger(translation) && translation > 0
            ? translation
            : undefined,
        limit: limit != null && Number.isFinite(limit) ? limit : undefined,
      }),
    );
  }),
);

app.get(
  '/api/dict',
  wrap(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    res.json(q ? await library().lookupWord(q) : []);
  }),
);

app.get(
  '/api/crossrefs',
  wrap(async (req, res) =>
    res.json(
      await library().getCrossrefs(
        asInt(req.query.book, 'book'),
        asInt(req.query.chapter, 'chapter'),
        asInt(req.query.verse, 'verse'),
      ),
    ),
  ),
);

app.get(
  '/api/commentary',
  wrap(async (req, res) =>
    res.json(
      await library().getCommentary(
        asInt(req.query.book, 'book'),
        asInt(req.query.chapter, 'chapter'),
        asInt(req.query.verse, 'verse'),
      ),
    ),
  ),
);

app.get(
  '/api/search',
  wrap(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) {
      res.json({ kind: 'empty', results: [] });
      return;
    }
    // Note: Number('') === 0, so empty entries must be dropped BEFORE Number()
    // or an empty `translations=` would become [0] and match no rows.
    const translations = String(req.query.translations ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    res.json(await library().search(q, translations));
  }),
);

/**
 * Rebuild the merged library from the modules folder (re-runs the builder process).
 * Lets an operator add a translation/song and refresh without a terminal. The builder
 * rebuilds in place; on success we drop the cached connection so reads see fresh data.
 */
app.post('/api/rebuild', requireLocalControl, (_req, res) => {
  if (rebuilding) {
    res.status(409).json({ error: N_('Перебудова вже триває') });
    return;
  }
  rebuilding = true;
  lastImport = null; // a rescan rewrites the folder-fed bundle: an old snapshot would undo it
  let stderr = '';
  let done = false;
  const finish = (status: number, body: object) => {
    if (done) return;
    done = true;
    rebuilding = false;
    res.status(status).json(body);
  };

  // shell:true so `npm` resolves to npm.cmd on Windows.
  const child = spawn('npm', ['run', 'build:library'], {
    cwd: repoRoot,
    shell: true,
    windowsHide: true,
  });
  child.stderr?.on('data', (d) => {
    stderr += d.toString();
  });
  child.stdout?.on('data', (d) => process.stdout.write(d));
  child.on('error', (err) =>
    finish(500, keyedError(N_('Не вдалося запустити збірку: {error}'), { error: err.message })),
  );
  child.on('close', (code) => {
    if (code === 0) {
      closeDb();
      finish(200, { ok: true });
    } else {
      const tail = stderr.trim().slice(-500);
      finish(
        500,
        tail
          ? { error: tail }
          : keyedError(N_('Збірка завершилась з кодом {code}'), { code: String(code) }),
      );
    }
  });
});

/**
 * The built UI (web/dist — `npm run build --workspace @vo/web`), served next to the API so
 * the whole app is ONE process (0.5.0): what the standby waiter starts (standby.ts). In
 * development Vite serves the UI on :5173 instead; without a build this is skipped.
 * Registered after the API, so an unknown /api path still gets a JSON-less 404.
 */
const webDist = process.env.VO_WEB_DIST ?? path.join(repoRoot, 'web', 'dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  // hashed bundles never change; everything else revalidates
  const cacheControl = (file: string) =>
    path.basename(path.dirname(file)) === 'assets'
      ? 'public, max-age=31536000, immutable'
      : 'no-cache';
  // The build's .br / .gz copies first (0.12.2) — the files themselves only for a browser
  // that takes neither.
  app.use(precompressed(webDist, cacheControl));
  app.use(
    express.static(webDist, {
      index: false,
      setHeaders: (res, file) => res.setHeader('Cache-Control', cacheControl(file)),
    }),
  );
  // Client-side routes (/presenter, /follow, /remote#…, /bench …) → the app shell.
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const server = app.listen(PORT, HOST, () => {
  const port = (server.address() as AddressInfo).port;
  console.log(`[server] http://${HOST}:${port}`);
  // Started by the standby waiter (standby.ts, PORT=0 → any free port): tell it where.
  process.send?.({ type: 'ready', port });
});
attachLiveHub(server, appVersion);
// …and go with it: a waiter killed outright must not leave the app on a stray port.
if (process.send) process.on('disconnect', () => process.exit(0));
