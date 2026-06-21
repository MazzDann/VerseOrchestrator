import express from 'express';
import cors from 'cors';
import {
  ApiError,
  getTranslations,
  getBooks,
  getChapters,
  getVerses,
  search,
  lookupStrong,
  lookupWord,
  strongRefs,
  listDictionaries,
} from './db.js';

const app = express();
app.use(cors());

const PORT = Number(process.env.PORT ?? 8787);

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

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});
