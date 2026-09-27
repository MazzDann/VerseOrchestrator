import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ApiError, closeDb, library, libraryInfo } from './db.js';
import { isLocalRequest } from './access.js';
import {
  attachLiveHub,
  dropRemote,
  getLive,
  pauseLive,
  isRemoteOnline,
  notifyRemotesChanged,
  publishLive,
  viewerCount,
} from './live.js';
import {
  createPairing,
  initRemoteStore,
  listPairings,
  reissuePairing,
  revokePairing,
  setRemotePersistence,
} from './remote.js';
import { getServerSettings, initServerSettings, updateServerSettings } from './serverSettings.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

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
initRemoteStore({ file: path.join(dataDir, 'secrets.json'), persist: settings.remotes.persist });

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
          res.status(err.status).json({ error: err.message });
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
    res.status(403).json({ error: 'Керування доступне лише з цього комп’ютера' });
    return;
  }
  next();
};

app.get('/api/health', (_req, res) => res.json({ ok: true }));

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
    res.status(403).json({ error: 'Керування доступне лише з цього комп’ютера' });
    return;
  }
  next();
};

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

app.post(
  '/api/remote/:id/reissue',
  requireLocalControl,
  wrap((req, res) => {
    const p = reissuePairing(String(req.params.id));
    if (!p) throw new ApiError(404, 'Пульт не знайдено');
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
      throw new ApiError(404, 'Сегменти ще не зібрано. Запустіть: npm run build:segments');
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

app.delete(
  '/api/remote/:id',
  requireLocalControl,
  wrap((req, res) => {
    const id = String(req.params.id);
    if (!revokePairing(id)) throw new ApiError(404, 'Пульт не знайдено');
    dropRemote(id);
    res.json({ ok: true });
  }),
);

/**
 * LAN IPv4 addresses so the control UI can build a phone-scannable follow URL.
 * Ranked so a real Wi-Fi/Ethernet address sorts before virtual adapters
 * (Hyper-V/WSL/VirtualBox/Docker), which are commonly enumerated first on Windows
 * and aren't reachable from phones.
 */
app.get(
  '/api/host',
  wrap((_req, res) => {
    const VIRTUAL = /(vethernet|virtualbox|vmware|hyper-v|wsl|docker|loopback|default switch)/i;
    // Rank by private-range likelihood: 192.168.x (home Wi-Fi) > 10.x > 172.16–31.x.
    const rangeRank = (ip: string): number => {
      if (ip.startsWith('192.168.')) return 0;
      if (ip.startsWith('10.')) return 1;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 2;
      return 3;
    };
    const candidates: { ip: string; rank: number }[] = [];
    for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
      for (const a of addrs ?? []) {
        if (a.family !== 'IPv4' || a.internal) continue;
        if (a.address.startsWith('169.254.')) continue; // link-local (no DHCP)
        candidates.push({
          ip: a.address,
          rank: rangeRank(a.address) + (VIRTUAL.test(name) ? 10 : 0),
        });
      }
    }
    candidates.sort((x, y) => x.rank - y.rank);
    res.json({ ips: candidates.map((c) => c.ip) });
  }),
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
  wrap(async (req, res) => res.json(await library().searchSongs(String(req.query.q ?? '')))),
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
    res.status(409).json({ error: 'Перебудова вже триває' });
    return;
  }
  rebuilding = true;
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
  child.on('error', (err) => finish(500, { error: `Не вдалося запустити збірку: ${err.message}` }));
  child.on('close', (code) => {
    if (code === 0) {
      closeDb();
      finish(200, { ok: true });
    } else {
      finish(500, { error: stderr.trim().slice(-500) || `Збірка завершилась з кодом ${code}` });
    }
  });
});

/**
 * The built UI (web/dist — `npm run build --workspace @vo/web`), served next to the API so
 * the whole app is ONE process (1.4.0): what the standby waiter starts (standby.ts). In
 * development Vite serves the UI on :5173 instead; without a build this is skipped.
 * Registered after the API, so an unknown /api path still gets a JSON-less 404.
 */
const webDist = process.env.VO_WEB_DIST ?? path.join(repoRoot, 'web', 'dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(
    express.static(webDist, {
      index: false,
      setHeaders: (res, file) =>
        // hashed bundles never change; everything else revalidates
        res.setHeader(
          'Cache-Control',
          path.basename(path.dirname(file)) === 'assets'
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        ),
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
attachLiveHub(server);
