import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import {
  ApiError,
  closeDb,
  getTranslations,
  getBooks,
  getChapters,
  getVerses,
  search,
  lookupStrong,
  lookupWord,
  strongRefs,
  getCrossrefs,
  getCommentary,
  searchSongs,
  getSong,
  listDictionaries,
} from './db.js';

const app = express();
app.use(cors());

const PORT = Number(process.env.PORT ?? 8787);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** A library rebuild (builder process) is in flight — guard against overlapping runs. */
let rebuilding = false;

function asInt(value: unknown, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new ApiError(400, `Invalid ${name}`);
  return n;
}

const wrap =
  (handler: (req: express.Request, res: express.Response) => void) =>
  (req: express.Request, res: express.Response) => {
    try {
      handler(req, res);
    } catch (err) {
      if (err instanceof ApiError) {
        res.status(err.status).json({ error: err.message });
      } else {
        console.error(err);
        res.status(500).json({ error: (err as Error).message });
      }
    }
  };

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get(
  '/api/translations',
  wrap((_req, res) => res.json(getTranslations())),
);

app.get(
  '/api/translations/:id/books',
  wrap((req, res) => res.json(getBooks(asInt(req.params.id, 'translation id')))),
);

app.get(
  '/api/translations/:id/books/:book/chapters',
  wrap((req, res) =>
    res.json(getChapters(asInt(req.params.id, 'translation id'), asInt(req.params.book, 'book'))),
  ),
);

app.get(
  '/api/translations/:id/books/:book/chapters/:chapter/verses',
  wrap((req, res) =>
    res.json(
      getVerses(
        asInt(req.params.id, 'translation id'),
        asInt(req.params.book, 'book'),
        asInt(req.params.chapter, 'chapter'),
      ),
    ),
  ),
);

app.get(
  '/api/songs',
  wrap((req, res) => res.json(searchSongs(String(req.query.q ?? '')))),
);

app.get(
  '/api/songs/:id',
  wrap((req, res) => {
    const song = getSong(asInt(req.params.id, 'song id'));
    if (!song) throw new ApiError(404, 'Song not found');
    res.json(song);
  }),
);

app.get(
  '/api/dictionaries',
  wrap((_req, res) => res.json(listDictionaries())),
);

app.get(
  '/api/strong/:num',
  wrap((req, res) => {
    const book = req.query.book != null ? Number(req.query.book) : undefined;
    res.json(lookupStrong(String(req.params.num), Number.isFinite(book) ? book : undefined));
  }),
);

app.get(
  '/api/strong/:num/refs',
  wrap((req, res) => {
    const translation = req.query.translation != null ? Number(req.query.translation) : undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    res.json(
      strongRefs(String(req.params.num), {
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
  wrap((req, res) => {
    const q = String(req.query.q ?? '').trim();
    res.json(q ? lookupWord(q) : []);
  }),
);

app.get(
  '/api/crossrefs',
  wrap((req, res) =>
    res.json(
      getCrossrefs(
        asInt(req.query.book, 'book'),
        asInt(req.query.chapter, 'chapter'),
        asInt(req.query.verse, 'verse'),
      ),
    ),
  ),
);

app.get(
  '/api/commentary',
  wrap((req, res) =>
    res.json(
      getCommentary(
        asInt(req.query.book, 'book'),
        asInt(req.query.chapter, 'chapter'),
        asInt(req.query.verse, 'verse'),
      ),
    ),
  ),
);

app.get(
  '/api/search',
  wrap((req, res) => {
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
    res.json(search(q, translations));
  }),
);

/**
 * Rebuild the merged library from the modules folder (re-runs the builder process).
 * Lets an operator add a translation/song and refresh without a terminal. The builder
 * rebuilds in place; on success we drop the cached connection so reads see fresh data.
 */
app.post('/api/rebuild', (_req, res) => {
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

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});
