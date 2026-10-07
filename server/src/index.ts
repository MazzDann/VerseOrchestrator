import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ApiError, closeDb, library, libraryInfo, libraryPath } from './db.js';
import { isLocalRequest, isOwnAddress, lanIps } from './access.js';
import { isLocalControl, requireLocal, requireLocalControl } from './guards.js';
import {
  announceShutdown,
  attachLiveHub,
  dropRemote,
  getLive,
  pauseLive,
  isRemoteOnline,
  notifyAllowed,
  notifyRemotesChanged,
  notifyUiStateRestored,
  publishLive,
  viewerCount,
  controlWindowsRoute,
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
import { createUpdateChecker, isQuiet, pinForSwap, type Pin } from './updates.js';
import { readLayout } from './layout.js';
import { isDevCopy, versionLabel } from './versionLabel.js';
import { createCodeWatch, headCommit } from './codeChange.js';
import { createGitSync } from './gitSync.js';
import { STAMP_FILE } from './uiStamp.js';
import { createInstaller, hasRollback, updatesBack } from './installer.js';
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
import { FILE_DENIED, FOLDER_DENIED, keyedError, N_, sameBundleName } from '@vo/shared';
import { createShortcut } from './shortcut.js';
import { browserListing, detectBrowsers } from './browsers.js';
import { handoverRoutes, spawnBrowser } from './handover.js';
import { CONTROL_HEADER, portFree, waiterAt } from './standby.js';
import {
  addImage,
  CONTENT_TYPE,
  imageEntry,
  imagesDir,
  isImageFile,
  listImages,
  restoreImage,
  trashImage,
  type ImageExt,
} from './images.js';
import {
  addAlbum,
  albumEntry,
  browse,
  dropSmalls,
  listPhotos,
  photoFile,
  putSmall,
  readAlbums,
  removeAlbum,
  smallCopies,
  smallFile,
} from './albums.js';
import {
  addVideo,
  listVideoFiles,
  posterFile,
  putPoster,
  readVideos,
  removeVideo,
  videoEntry,
  videoFile,
} from './videos.js';
import {
  BackupError,
  backupBusy,
  backupName,
  MAX_BACKUP_BYTES,
  keepPending,
  lastRestore,
  makeBackup,
  oneAtATime,
  readBackup,
  restorePending,
  startChange,
  undoRestore,
} from './backup.js';

const app = express();
const json = express.json({ limit: '1mb' });
// the UI state (0.7.4) and a song import (0.10.1) are big: their own, larger limits
const ownParser = new Set([
  '/api/ui-state',
  '/api/song-bundles/import',
  '/api/images',
  '/api/backup/check',
]);
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

const appVersion = (
  JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string }
).version;
// what the pages show: «dev 1.4.2.try7 (mac-test · 20dd850)» in a git checkout, the version in a
// release (versionLabel.ts); what they and the swap compare stays `version`
const appLabel = versionLabel(repoRoot, appVersion);
// the version too: after an update the swap asks the new app who it is (swap.ts)
// a new one at each start: a page waiting for a restart knows the new server (1.6.0)
const boot = randomUUID().slice(0, 8);
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, version: appVersion, label: appLabel, boot }),
);

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
  // `now`: the hub's clock, for a phone that polls (1.7.3)
  wrap((_req, res) => res.json({ ...getLive(), now: Date.now() })),
);

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

// Speaker remotes (remote.ts): the operator pairs a phone, which gets a scoped token via QR and
// then drives the show over the live WebSocket. All management is local-only (guards.ts); the
// token is returned once, at creation, and never listed again.
app.post(
  '/api/remote',
  requireLocalControl,
  wrap((req, res) => {
    const p = createPairing(String(req.body?.name ?? ''), req.body?.allowed, req.body?.kind);
    notifyRemotesChanged();
    res.json({ id: p.id, name: p.name, kind: p.kind, allowed: p.allowed, token: p.token });
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
    res.json({ id: p.id, name: p.name, kind: p.kind, allowed: p.allowed, token: p.token });
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

// «Відкривати вікно керування в…» (2026-10-01): the browsers on this computer — read from its
// folders, nothing started (browsers.ts); the choice itself goes through /api/server-settings
app.get(
  '/api/browsers',
  requireLocal,
  wrap((_req, res) => res.json({ browsers: browserListing(detectBrowsers()) })),
);

// «Відкрити в {browser} зараз» (2026-10-01): the control window opened in the chosen browser now,
// with a one-time token that puts it in charge (handover.ts, live.ts)
app.use(
  handoverRoutes({
    platform: process.platform,
    launch: () => getServerSettings().launch,
    find: (id) => detectBrowsers().find((b) => b.id === id),
    own: (host) => host === 'localhost' || isOwnAddress(host),
    run: spawnBrowser,
  }),
);

// --- Updates (1.0.0): is there a newer release? The control window asks; nothing is installed.

const updates = createUpdateChecker({
  current: appVersion,
  install: readLayout(repoRoot) ? 'release' : 'source',
  isEnabled: () => getServerSettings().updates.check,
  channel: () => getServerSettings().updates.channel,
});

// Is a control window open on this machine? The start file and the shortcut then open no
// second one (1.1.0, launcher.ts) — on a Mac they bring forward the browser it is in.
app.get('/api/control-windows', requireLocal, controlWindowsRoute);

// Installing (1.0.0): only a copy in the release layout, whose app/ can be replaced
const release = readLayout(repoRoot);
const releaseTop = release ? path.dirname(repoRoot) : null;
const installer = releaseTop
  ? createInstaller({ top: releaseTop, dataDir, current: appVersion })
  : null;

// a swap — an update or a rollback — leaves the helper's copy of Node, its plan and the
// release's top files behind: they go at the next start once the helper has finished (the app
// the swap starts runs before the helper writes its result, so what it holds stays till then)
installer?.tidy();

/**
 * The pin a swap to this version decided (1.6.3) takes effect once that swap went well — this
 * version answers — so a swap that fails keeps the pin the version before had.
 */
function adoptPin(last: { ok: boolean; to: string; pin?: Pin | null } | null) {
  if (!last?.ok || last.to !== appVersion || last.pin === undefined) return;
  const now = getServerSettings().updates.pin ?? null;
  if (JSON.stringify(now) !== JSON.stringify(last.pin))
    updateServerSettings({ updates: { pin: last.pin } });
}

async function updateAnswer(force: boolean) {
  const s = await updates.check(force);
  const lastUpdate = installer?.lastSwap(appVersion) ?? null;
  adoptPin(lastUpdate);
  let install = installer?.state() ?? null;
  // downloaded by an earlier run and not installed yet — the newest, or another one this version
  // downloaded (1.6.2): ready all the same
  const ready = installer?.waiting(s.latest?.version ?? null) ?? null;
  if (install?.phase === 'idle' && ready && ready !== appVersion)
    install = { ...install, phase: 'ready', version: ready };
  const previous = installer?.previousVersion() ?? null;
  const { releases, ...rest } = s;
  return {
    ...rest,
    // the dropdown (1.6.2): what each release would be here — its size, whether it can be
    // installed on this system, whether it can come back by itself (1.4.0 or later)
    versions: installer
      ? releases.map((r) => ({
          version: r.version,
          url: r.url,
          publishedAt: r.publishedAt,
          size: r.asset?.size ?? 0,
          installable: !!r.asset && !!r.sums,
          selfReturn: hasRollback(r.version),
          // a version that couldn't update back on this system (Windows before 1.8.8) isn't offered
          updatesBack: updatesBack(r.version),
          // a beta (1.8.11): said so in the dropdown
          prerelease: r.prerelease,
        }))
      : [],
    installer: install,
    // a version chosen over the newest release (1.6.3): no reminders about what it skipped
    pinned:
      !!installer &&
      isQuiet(getServerSettings().updates.pin, appVersion, s.latest?.version ?? null),
    lastUpdate,
    // what the last update left behind, to go back to (1.4.0)
    previous,
    // …and whether it can come back here by itself (1.4.0 or later) or only by an update (1.4.1)
    previousHasRollback: previous ? hasRollback(previous) : null,
    // «Повернути версію» to one that couldn't update back by itself here: said before it goes
    previousUpdatesBack: previous ? updatesBack(previous) : null,
  };
}

/**
 * Not while an update unpacks or the app restarts (1.4.1): installer.notNow(). Nor while the
 * library rebuilds (1.8.8): its npm child runs from app/ and outlives this process — the swap would
 * fail with app/ in use, and the rebuild would stop halfway.
 */
function refuseIfNotNow(inst: NonNullable<typeof installer>) {
  if (rebuilding)
    throw new ApiError(409, N_('Бібліотека саме перебудовується — спробуйте за хвилину'));
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
  wrap(async (_req, res) => {
    // a copy of the repository looks at its upstream too (1.6.1) — waited for 15 s at most: a slow
    // network keeps the fetch going, the page asks for the code state again anyway
    const fetching = gitSync?.fetch();
    const answer = await updateAnswer(true);
    const git = fetching
      ? await Promise.race([fetching, new Promise<null>((r) => setTimeout(() => r(null), 15_000))])
      : null;
    res.json(git ? { ...answer, git } : answer);
  }),
);

app.post(
  '/api/update/download',
  requireLocalControl,
  wrap(async (req, res) => {
    const s = updates.state();
    if (!installer)
      throw new ApiError(409, N_('Оновлювати сам уміє лише застосунок з архіву релізу'));
    // the version picked in the dropdown (1.6.2), newer or older; none: the newest
    const wanted = typeof req.body?.version === 'string' ? req.body.version : null;
    if (!wanted && (!s.available || !s.latest)) throw new ApiError(409, N_('Новішої версії немає'));
    const release = wanted ? s.releases.find((r) => r.version === wanted) : s.latest;
    if (!release)
      throw new ApiError(
        409,
        N_('Такої версії немає серед релізів — натисніть «Перевірити зараз»'),
      );
    if (release.version === appVersion) throw new ApiError(409, N_('Ця версія вже встановлена'));
    // a step down that would leave this copy unable to update back (Windows before 1.8.8)
    if (!updatesBack(release.version))
      throw new ApiError(
        409,
        N_('З версій, старіших за 1.8.8, на Windows не вдається оновитися назад'),
      );
    // the newest now: what a pick of another version is chosen over (1.6.3)
    installer.start(release, s.latest?.version ?? null);
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
  // an older version chosen on purpose (1.6.3) keeps quiet about what it was chosen over: for a
  // download, the newest when it began; for «Повернути версію», the newest known now
  const pin = pinForSwap({
    kind,
    from: appVersion,
    to: version,
    known: kind === 'update' ? inst.chosenOver(version) : (updates.state().latest?.version ?? null),
  });
  // the helper runs outside app/, with a copy of this Node: nothing in app/ may stay in use
  const helper = inst.prepareSwap({
    execPath: process.execPath,
    script: path.join(repoRoot, 'server', 'src', 'swap.ts'),
    kind,
    from: appVersion,
    to: version,
    pids: waiterPid ? [process.pid, waiterPid] : [process.pid],
    port,
    pin,
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
    if (installer) refuseIfNotNow(installer);
    // the version downloaded — the newest, or one picked in the dropdown, older too (1.6.2)
    const version = installer?.waiting(updates.state().latest?.version ?? null);
    if (!installer || !version || version === appVersion)
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

// --- upd2 (1.6.0): a copy of the repository notices that its code changed under it (codeChange.ts)

// started by the launcher or the waiter (VO_STANDBY): the waiter is our parent process
const underWaiter = process.env.VO_STANDBY === '1';
// only where a restart can apply new code: a copy of the repository the waiter started (not
// `npm run dev`, which runs the working tree already), where git told the commit
const startCommit = underWaiter && isDevCopy(repoRoot) ? headCommit(repoRoot) : null;
const codeWatch = startCommit
  ? createCodeWatch({ root: repoRoot, label: appLabel, commit: startCommit })
  : null;
let relaunching = false;
// …and gets its updates from its upstream: «Отримати оновлення» (1.6.1, gitSync.ts)
const gitSync = codeWatch ? createGitSync({ root: repoRoot }) : null;

const codeAnswer = (fresh = false) =>
  codeWatch && gitSync
    ? { ...codeWatch.state(fresh), restarting: relaunching, git: gitSync.state(fresh) }
    : null;

// null: a release copy (it updates through «Завантажити оновлення»), or no watch (above)
app.get('/api/update/code', requireLocal, (_req, res) => {
  res.json(codeAnswer());
});

/**
 * «Отримати оновлення» (1.6.1): fetch the branch's upstream and fast-forward to it — only when
 * git needs no answer (a clean tree, nothing diverged); then «Перезапустити» applies it.
 */
app.post(
  '/api/update/pull',
  requireLocalControl,
  wrap(async (_req, res) => {
    if (!gitSync)
      throw new ApiError(
        409,
        N_(
          'Отримувати оновлення сам уміє лише застосунок з копії репозиторію, запущений файлом запуску',
        ),
      );
    if (relaunching) throw new ApiError(409, N_('Застосунок уже перезапускається'));
    let pulled: number;
    try {
      ({ pulled } = await gitSync.pull());
    } catch (e) {
      const { message, vars } = e as Error & { vars?: Record<string, string> };
      throw new ApiError(409, message, vars);
    }
    console.log(`[server] update: ${pulled} new commit(s) from the upstream`);
    res.json({ pulled, code: codeAnswer(true) });
  }),
);

/**
 * Starts the launcher once our waiter has ended (1.6.0). Run from this code's memory (`node -e`),
 * not from a file: after a checkout the files on disk may be another branch's, which may know
 * nothing of this — so the launcher gets only what every launcher since 0.7.0 takes
 * (`--no-browser --port N`), and its output goes to data/standby.log: one that fails says why.
 * Arguments: the waiter's pid, the launcher, the port, the log, the folder.
 */
const RELAUNCH_HELPER = `
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const [pid, launcher, port, log, cwd] = process.argv.slice(1);
const alive = (p) => { try { process.kill(p, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const say = (m) => { try { fs.appendFileSync(log, new Date().toISOString() + ' [restart] ' + m + '\\n'); } catch {} };
const end = Date.now() + 30000;
const go = () => {
  if (alive(Number(pid))) {
    if (Date.now() < end) return void setTimeout(go, 200);
    return say('the old waiter did not stop in 30 s: not restarted');
  }
  say('starting the launcher with the new code');
  const out = fs.openSync(log, 'a');
  spawn(process.execPath, ['--disable-warning=ExperimentalWarning', launcher, '--no-browser', '--port', port], {
    cwd, detached: true, stdio: ['ignore', out, out], windowsHide: true,
  }).unref();
};
go();
`;

/**
 * «Перезапустити»: the launcher starts again in the background — once our waiter has ended it
 * does what the start file does (npm ci if the packages changed, the UI build, the library) and
 * serves the same port; the page reloads itself once a new server answers (`boot`). A second
 * click, from another window, waits for the same restart.
 */
app.post(
  '/api/update/relaunch',
  requireLocalControl,
  wrap(async (_req, res) => {
    if (!codeWatch)
      throw new ApiError(
        409,
        N_('Перезапускати сам уміє лише застосунок з копії репозиторію, запущений файлом запуску'),
      );
    if (relaunching) {
      res.json({ ok: true, from: appLabel, boot });
      return;
    }
    relaunching = true;
    const waiterPid = process.ppid;
    const port = Number(process.env.VO_STANDBY_PORT) || getServerSettings().standby.port;
    // the launcher's own environment: not this app's port, host and waiter marks — and this
    // Node's folder first on the PATH: a waiter started by launchd (a Mac's autostart) has a
    // PATH without npm, which the launcher needs for npm ci and the UI build
    const env = { ...process.env };
    for (const k of ['PORT', 'HOST', 'VO_STANDBY', 'VO_STANDBY_PORT', 'VO_STANDBY_LISTEN'])
      delete env[k];
    const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
    env[pathKey] = [path.dirname(process.execPath), env[pathKey]]
      .filter(Boolean)
      .join(path.delimiter);
    spawn(
      process.execPath,
      [
        '-e',
        RELAUNCH_HELPER,
        String(waiterPid),
        path.join(repoRoot, 'server', 'src', 'launcher.ts'),
        String(port),
        path.join(dataDir, 'standby.log'),
        repoRoot,
      ],
      { cwd: repoRoot, env, detached: true, stdio: 'ignore', windowsHide: true },
    ).unref();
    console.log(`[server] restart with new code: ${appLabel} → ${codeWatch.state().to}`);
    res.json({ ok: true, from: appLabel, boot });
    // after the answer: our waiter stops us and itself; the helper waits for it
    setTimeout(() => {
      void tellWaiter(port, 'restart');
      setTimeout(() => process.exit(0), 3000);
    }, 300);
  }),
);

// the first look a little after the start, then twice a day (check() skips a fresh answer);
// never from the tests
if (!process.env.VITEST) {
  // …and a copy of the repository fetches its upstream as often, with the switch on (1.6.1)
  const look = () => {
    void updates.check();
    if (gitSync && getServerSettings().updates.check) void gitSync.fetch(true);
  };
  setTimeout(look, 15_000).unref();
  setInterval(look, 60 * 60 * 1000).unref();
}

// --- Standby waiter (0.5.2): «Запускати застосунок за адресою» in the control window.

const standbyScript = path.join(repoRoot, 'server', 'src', 'standby.ts');
const autostart = currentEntry(repoRoot);

function tellWaiter(
  port: number,
  action: 'retire' | 'resume' | 'relaunch' | 'shutdown' | 'update' | 'restart',
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

/**
 * LAN IPv4 addresses so the control UI can build a phone-scannable follow URL (best first), and
 * whether the asker is this computer (1.9.0-beta.10): the control page opened from another
 * computer says how to get a desk link instead of failing at every local-only route.
 */
app.get(
  '/api/host',
  wrap((req, res) => res.json({ ips: lanIps(), local: isLocalRequest(req) })),
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

/** Chapter lengths for the versification alignment (1.8.12-beta.5): ?translations=1,2&books=230 */
app.get(
  '/api/profiles',
  wrap(async (req, res) => {
    // Number('') === 0: empty entries go first (as /api/search)
    const ints = (v: unknown) =>
      String(v ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0);
    res.json(await library().chapterProfiles(ints(req.query.translations), ints(req.query.books)));
  }),
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
 * A change to the song bundles or the pictures waits while a backup is made, checked or
 * restored, and backup work waits for it — the whole request, its body included (backup.ts
 * startChange): a change meanwhile was half-kept in the copy or lost under the restored state
 * (review of #47). Registered before every route that changes them.
 */
app.use(['/api/song-bundles', '/api/images'], (req, res, next) => {
  // only what may change something waits and holds the backups: a request the routes refuse
  // anyway (403) holds nothing — an unanswered one from the hall held them for minutes
  if (req.method === 'GET' || req.method === 'HEAD' || !isLocalControl(req)) return next();
  let end: (() => void) | null = null;
  let closed = false;
  res.on('close', () => {
    closed = true;
    end?.();
  });
  void startChange().then((done) => {
    if (closed) return done(); // the page went away while it waited
    end = done;
    next();
  });
});

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

// ── Pictures on screen (1.5.0, images.ts): kept in data/images/, served by address ────────

// the list is the operator's (this machine): a phone gets a picture's address with the slide,
// and the files' names are random ids — not a gallery for the hall to browse (review of #46)
app.get('/api/images', requireLocal, (_req, res) => {
  res.json(listImages(imagesDir(dataDir)).map(imageEntry));
});

/**
 * A picture's file. Read by every page — the output windows, the stage display and the phones
 * (through the waiter) — so not local-only; only names images.ts writes, served as the type its
 * first bytes said, never sniffed by the browser into anything else.
 */
app.get('/api/images/file/:file', (req, res) => {
  const file = String(req.params.file);
  const dir = imagesDir(dataDir);
  if (!isImageFile(file) || !fs.existsSync(path.join(dir, file))) {
    res.status(404).end();
    return;
  }
  const ext = file.slice(file.lastIndexOf('.') + 1) as ImageExt;
  res.setHeader('Content-Type', CONTENT_TYPE[ext]);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // a picture's file never changes, but it can be deleted: the browser asks again each time
  // (a 304 while it is there), so a deleted one leaves the slide black (review of #46)
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(dir, file));
});

app.post(
  '/api/images',
  requireLocalControl,
  express.json({ limit: '64mb' }),
  wrap(async (req, res) => {
    const started = Date.now();
    const done = addImage(imagesDir(dataDir), req.body ?? {});
    if ('refused' in done) {
      if (done.refused === 'type')
        throw new ApiError(400, N_('Це не зображення PNG, JPEG, WebP чи GIF'));
      if (done.refused === 'size') throw new ApiError(413, N_('Зображення завелике — до 40 МБ'));
      throw new ApiError(400, N_('Не вдалося прочитати зображення'));
    }
    console.log(
      `[server] images: «${done.name}» ${done.w}×${done.h}, ${Math.round(done.size / 1024)} KB (${Date.now() - started} ms)`,
    );
    res.status(201).json(imageEntry(done));
  }),
);

app.delete(
  '/api/images/:id',
  requireLocalControl,
  wrap(async (req, res) => {
    const gone = trashImage(imagesDir(dataDir), String(req.params.id));
    if (!gone) throw new ApiError(404, N_('Зображення не знайдено — відкрийте список ще раз'));
    res.json({ trashed: gone.trashed, name: gone.image.name });
  }),
);

app.post(
  '/api/images/restore',
  requireLocalControl,
  wrap(async (req, res) => {
    const trashed = typeof req.body?.trashed === 'string' ? req.body.trashed : '';
    const back = trashed ? restoreImage(imagesDir(dataDir), trashed) : null;
    if (!back) throw new ApiError(409, N_('Зображення вже не повернути'));
    res.json(imageEntry(back));
  }),
);

// ── Albums (1.8.12, albums.ts): folders of photos on this computer, read where they are ─────

// the albums and the folder picker are the operator's (this machine): a phone gets a photo's
// address with the slide, not the folders of the computer
app.get(
  '/api/albums',
  requireLocal,
  wrap(async (_req, res) => {
    const albums = readAlbums(dataDir);
    const listings = await Promise.all(albums.map((a) => listPhotos(a.path)));
    res.json(albums.map((a, i) => albumEntry(a, listings[i])));
  }),
);

/** The folder picker: the starting points, or a folder's subfolders and its photo count. */
app.get(
  '/api/albums/browse',
  requireLocalControl,
  wrap(async (req, res) => {
    const found = await browse(req.query.path);
    if (!found) throw new ApiError(404, N_('Папку не знайдено'));
    // «Додати відео…» (1.8.12-beta.3): the folder's video files too
    if (req.query.files === 'video' && found.path && !found.denied)
      Object.assign(found, await listVideoFiles(found.path));
    res.json(found);
  }),
);

app.get(
  '/api/albums/:id',
  requireLocal,
  wrap(async (req, res) => {
    const album = readAlbums(dataDir).find((a) => a.id === String(req.params.id));
    if (!album) throw new ApiError(404, N_('Альбом не знайдено — відкрийте список ще раз'));
    const started = performance.now();
    const [listing, copies] = await Promise.all([
      listPhotos(album.path, true),
      smallCopies(dataDir, album.id),
    ]);
    const ms = performance.now() - started;
    if (ms > 200)
      console.log(
        `[server] albums: «${album.name}» ${listing?.photos.length ?? 0} photos, ${Math.round(ms)} ms`,
      );
    res.json(albumEntry(album, listing, true, copies));
  }),
);

/**
 * A photo of an album. Read by every page — the output windows and the phones (through the
 * waiter) — so not local-only, like a picture's file; only names the folder's listing holds,
 * typed by their first bytes. `no-cache`: a photo taken out of the folder goes black.
 */
app.get(
  '/api/albums/:id/file/:name',
  wrap(async (req, res) => {
    const album = readAlbums(dataDir).find((a) => a.id === String(req.params.id));
    const photo = album ? await photoFile(album.path, String(req.params.name)) : null;
    if (!photo) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', photo.type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    // the folder may sit under a dot folder: the name was checked above. A file gone or locked
    // since: a plain 404 — Express's own error page would show the hall the path (review)
    res.sendFile(photo.file, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  }),
);

/**
 * A photo for the phones (1.8.12-beta.2): its small copy when the control window made one, else
 * the photo itself — LAN-readable like the photo; the same checks.
 */
app.get(
  '/api/albums/:id/small/:name',
  wrap(async (req, res) => {
    const album = readAlbums(dataDir).find((a) => a.id === String(req.params.id));
    const photo = album ? await smallFile(dataDir, album, String(req.params.name)) : null;
    if (!photo) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', photo.type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(photo.file, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  }),
);

/** A small copy the control window drew of a photo (a JPEG of at most 4 MB, the body itself). */
app.put(
  '/api/albums/:id/small/:name',
  requireLocalControl,
  express.raw({ type: () => true, limit: '4mb' }),
  wrap(async (req, res) => {
    const album = readAlbums(dataDir).find((a) => a.id === String(req.params.id));
    if (!album) throw new ApiError(404, N_('Альбом не знайдено — відкрийте список ще раз'));
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const version = typeof req.query.v === 'string' ? req.query.v : '';
    const done = await putSmall(dataDir, album, String(req.params.name), version, body);
    if ('refused' in done) {
      if (done.refused === 'photo') throw new ApiError(404, N_('Фото вже немає в папці'));
      if (done.refused === 'changed')
        throw new ApiError(409, N_('Фото в папці змінилося — відкрийте альбом ще раз'));
      throw new ApiError(400, N_('Мала копія має бути JPEG до 4 МБ'));
    }
    res.json(done);
  }),
);

app.post(
  '/api/albums',
  requireLocalControl,
  wrap(async (req, res) => {
    const done = await addAlbum(dataDir, req.body ?? {});
    if ('refused' in done) {
      if (done.refused === 'missing') throw new ApiError(404, N_('Папку не знайдено'));
      // Mac check of 1.9.0: the page says where to allow it (web/src/lib/denied.ts)
      if (done.refused === 'denied') throw new ApiError(403, FOLDER_DENIED);
      throw new ApiError(400, N_('Виберіть папку на цьому комп’ютері'));
    }
    res.status(201).json(albumEntry(done, await listPhotos(done.path)));
  }),
);

app.delete(
  '/api/albums/:id',
  requireLocalControl,
  wrap(async (req, res) => {
    const gone = removeAlbum(dataDir, String(req.params.id));
    if (!gone) throw new ApiError(404, N_('Альбом не знайдено — відкрийте список ще раз'));
    await dropSmalls(dataDir, gone.id);
    res.json({ name: gone.name });
  }),
);

// ── Video (1.8.12-beta.3, videos.ts): files on this computer, read where they are ─────────────

app.get(
  '/api/videos',
  requireLocal,
  wrap(async (_req, res) => {
    res.json(await Promise.all(readVideos(dataDir).map((v) => videoEntry(dataDir, v))));
  }),
);

/**
 * A video's file — for this machine only: «Показ», «Сцена» and the control window's sound and
 * previews run here; the hall gets a poster or words (the phones never load the video).
 */
app.get(
  '/api/videos/:id/file',
  requireLocal,
  wrap(async (req, res) => {
    const video = readVideos(dataDir).find((v) => v.id === String(req.params.id));
    const file = video ? await videoFile(video.path) : null;
    if (!file) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', file.type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(file.file, { dotfiles: 'allow', acceptRanges: true }, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  }),
);

/** A frame of the video for the phones (LAN-readable), when the control window drew one. */
app.get(
  '/api/videos/:id/poster',
  wrap(async (req, res) => {
    const video = readVideos(dataDir).find((v) => v.id === String(req.params.id));
    const file = video ? await posterFile(dataDir, video) : null;
    if (!file) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(file, { dotfiles: 'allow' }, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  }),
);

app.put(
  '/api/videos/:id/poster',
  requireLocalControl,
  express.raw({ type: () => true, limit: '4mb' }),
  wrap(async (req, res) => {
    const video = readVideos(dataDir).find((v) => v.id === String(req.params.id));
    if (!video) throw new ApiError(404, N_('Відео не знайдено — відкрийте список ще раз'));
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const version = typeof req.query.v === 'string' ? req.query.v : '';
    const done = await putPoster(dataDir, video, version, body);
    if ('refused' in done) {
      if (done.refused === 'video') throw new ApiError(404, N_('Файлу відео вже немає'));
      if (done.refused === 'changed')
        throw new ApiError(409, N_('Файл відео змінився — відкрийте список ще раз'));
      throw new ApiError(400, N_('Мала копія має бути JPEG до 4 МБ'));
    }
    res.json(done);
  }),
);

app.post(
  '/api/videos',
  requireLocalControl,
  wrap(async (req, res) => {
    const done = await addVideo(dataDir, req.body ?? {});
    if ('refused' in done) {
      if (done.refused === 'missing') throw new ApiError(404, N_('Файл не знайдено'));
      if (done.refused === 'denied') throw new ApiError(403, FILE_DENIED);
      if (done.refused === 'type')
        throw new ApiError(400, N_('Це не відео MP4, MOV, WebM чи MKV, яке відтворює браузер'));
      throw new ApiError(400, N_('Виберіть файл на цьому комп’ютері'));
    }
    res.status(201).json(await videoEntry(dataDir, done));
  }),
);

app.delete(
  '/api/videos/:id',
  requireLocalControl,
  wrap(async (req, res) => {
    const gone = await removeVideo(dataDir, String(req.params.id));
    if (!gone) throw new ApiError(404, N_('Відео не знайдено — відкрийте список ще раз'));
    res.json({ name: gone.name });
  }),
);

// ── «Резервна копія» (1.5.0, backup.ts): one .zip of the operator's own things ───────────

/** The operator's backup — local control only: it holds their programs, songs, pictures. */
app.get(
  '/api/backup',
  requireLocalControl,
  wrap(async (_req, res) => {
    const started = Date.now();
    const now = new Date();
    let buf: Buffer;
    try {
      // one that could never be restored is not made (review of #47)
      buf = await oneAtATime(() => makeBackup(dataDir, appVersion, now));
    } catch (e) {
      throw backupRefusal(e);
    }
    console.log(
      `[server] backup: ${Math.round(buf.length / 1024)} KB in ${Date.now() - started} ms`,
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${backupName(now)}"`);
    res.setHeader('Content-Length', buf.length);
    // not res.send: it hashes the whole body for an ETag — a 200 MB backup stalled the hub
    // for a third of a second (review of #47)
    res.end(buf);
  }),
);

/**
 * A restore or its undo that failed — a file held by another program: what moved went back
 * (backup.ts, all or nothing), said in words (review of #47).
 */
const movesFailed = (e: unknown, key: string) => {
  if (e instanceof BackupError || e instanceof ApiError) return e;
  const { code, path: file, message } = e as NodeJS.ErrnoException;
  // «EBUSY: ПС.vosongs», not two full paths
  return new ApiError(500, key, {
    error: code && file ? `${code}: ${path.basename(file)}` : message,
  });
};

/**
 * A restore or its undo has put its state in place (backup.ts calls it before its cleanup): the
 * import's «Скасувати» no longer reaches across it — it would overwrite or delete a restored
 * bundle; every control window takes the restored settings at once — one still open would else
 * send its old ones back with its next change; and the library's songs follow, in the same
 * turn, so a window that asks for them gets the restored ones (review of #47).
 */
const restored = () => {
  lastImport = null;
  notifyUiStateRestored();
  refreshSongs(bundlesDir(dataDir));
};

/** A backup refused in words: too big, or not one of this app / damaged (review of #47). */
const backupRefusal = (e: unknown) =>
  !(e instanceof BackupError)
    ? e
    : e.message === 'too big'
      ? new ApiError(
          413,
          N_('Копія завелика: понад 1 ГБ. Приберіть частину зображень і збережіть ще раз.'),
        )
      : new ApiError(400, N_('Це не резервна копія VerseOrchestrator або файл пошкоджено'));

/** A file to restore: read and kept, and what it holds said back — nothing changes yet. */
app.post(
  '/api/backup/check',
  requireLocalControl,
  // a backup is at most 1 GB of files (backup.ts), its zip a little more
  express.raw({ type: () => true, limit: MAX_BACKUP_BYTES + 16 * 1024 * 1024 }),
  wrap(async (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    try {
      const summary = await oneAtATime(async () => {
        const { summary } = await readBackup(buf);
        return { ...summary, id: await keepPending(dataDir, buf) };
      });
      res.json(summary);
    } catch (e) {
      throw backupRefusal(e);
    }
  }),
);

/** Restore the checked file; the state it replaces is kept for «Повернути як було». */
app.post(
  '/api/backup/restore',
  requireLocalControl,
  wrap(async (req, res) => {
    notDuringRebuild();
    const started = Date.now();
    // the file the page's card shows (review of #47)
    const id = typeof req.body?.id === 'string' ? req.body.id : '';
    let summary;
    try {
      summary = await oneAtATime(async () => {
        notDuringRebuild(); // one may have started while this waited
        return restorePending(dataDir, appVersion, new Date(), { id, applied: restored });
      });
    } catch (e) {
      throw backupRefusal(
        movesFailed(
          e,
          N_(
            'Не вдалося відновити: {error}. Закрийте програми, що тримають файли в data/, і спробуйте ще раз.',
          ),
        ),
      );
    }
    if (!summary) throw new ApiError(409, N_('Спершу виберіть файл копії ще раз'));
    console.log(
      `[server] backup: restored the one from ${summary.created} (${Date.now() - started} ms)`,
    );
    res.json(summary);
  }),
);

app.get('/api/backup/state', requireLocal, (_req, res) => {
  res.json({ lastRestore: lastRestore(dataDir) });
});

app.post(
  '/api/backup/undo',
  requireLocalControl,
  wrap(async (_req, res) => {
    notDuringRebuild();
    let undone: boolean;
    try {
      undone = await oneAtATime(async () => {
        notDuringRebuild();
        return undoRestore(dataDir, new Date(), restored);
      });
    } catch (e) {
      throw backupRefusal(
        movesFailed(
          e,
          N_(
            'Не вдалося повернути: {error}. Закрийте програми, що тримають файли в data/, і спробуйте ще раз.',
          ),
        ),
      );
    }
    if (!undone) throw new ApiError(409, N_('Повертати вже нічого'));
    console.log('[server] backup: back to the state before the last restore');
    res.json({ ok: true });
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
  // the builder reads and writes data/songs: not under a backup's feet (review of #47)
  if (backupBusy()) {
    res
      .status(409)
      .json(
        keyedError(
          N_('Зачекайте, доки збережеться чи відновиться резервна копія, і спробуйте ще раз'),
        ),
      );
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

/** The UI stamp of a built web/dist (uiStamp.ts), or undefined when it has none. */
function builtUi(dist: string): string | undefined {
  try {
    return fs.readFileSync(path.join(dist, STAMP_FILE), 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}
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
// pages follow a restart with new code by the UI build they were made from (1.6.0): told only by
// an app the waiter started — under `npm run dev` Vite serves the pages, not web/dist
attachLiveHub(server, appVersion, underWaiter ? builtUi(webDist) : undefined);
// …and go with it: a waiter killed outright must not leave the app on a stray port.
if (process.send) process.on('disconnect', () => process.exit(0));
