# Hybrid database

VerseOrchestrator reads its library through one schema and one set of queries on three
database engines: SQLite on the server, SQLite compiled to WebAssembly in the browser, and
PostgreSQL compiled to WebAssembly (PGlite) in the browser. This page explains how that
works and what it costs, with the numbers measured while it was built. It is for
developers who change the library or add an engine; how the rest of the app is put
together is in [Architecture](architecture.md).

## One seam: `SqlDriver`

Every read the app makes against the library is written once, in
`shared/src/library/queries.ts`, against a three-member interface
(`shared/src/library/driver.ts`):

```ts
export interface SqlDriver {
  all<T = Row>(sql: string, params?: SqlParam[]): Promise<T[]>;
  get<T = Row>(sql: string, params?: SqlParam[]): Promise<T | undefined>;
  readonly dialect: 'sqlite' | 'postgres';
}
```

The interface is asynchronous on purpose: better-sqlite3 and SQLite-WASM are synchronous,
but PGlite and a remote engine are not, and the queries must not care. The engines behind
it:

| Engine         | Where                                                  | Implementation                                                                       |
| -------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| better-sqlite3 | the app server (`server/src/db.ts`)                    | the whole `data/library.db`, read-only, served over the HTTP API                     |
| SQLite-WASM    | a module worker in the browser (`web/src/lib/engine/`) | the official `@sqlite.org/sqlite-wasm` build; the `sql.js` default build has no FTS5 |
| PGlite         | the same worker, chosen with **Рушій бази**            | PostgreSQL 18.3 in WebAssembly (PGlite 0.5.8)                                        |

`web/src/api.ts` sends each read to the server or to the worker, and validates both
answers with the same schemas, so the UI can't tell them apart.

## One schema, two dialects

The schema is SQLite's (`shared/src/library/schema.ts`): translations, books, verses,
Strong's numbers per verse, dictionaries, cross-references, commentaries, songs, and a
`sources` table that records which module file each part came from. Postgres gets the
same tables (`shared/src/library/postgres.ts`) with two differences:

- **Full-text search.** SQLite uses a contentless FTS5 table over normalized text, with
  the translation as a second column so one index serves every translation. Postgres
  uses a `tsvector` column with a GIN index, filled with `to_tsvector('simple', …)` from
  the same normalized text.
- **Parameters.** The queries use `?`; the Postgres driver rewrites them to `$1`, `$2`,
  and so on, outside quoted strings.

The queries branch on `dialect` only for schema probes and text search. A parity test
(`builder/src/pglite.test.ts`) runs the queries on both engines against a fixture; on
real data, every query without a row limit returned identical results on all three
engines.

Normalization (`shared/src/normalize.ts`) happens once, when the library is built: MyBible
markup goes (Strong's numbers, footnotes, and morphology codes with their content), letters
are lowercased, accents and other combining marks are removed (й → и, ї → і), and
punctuation becomes spaces. The same function normalizes the user's query, so matching
doesn't depend on an engine's collation.

## Segments: the library for the browser

The whole server library doesn't fit a browser: it was 636 MB when the browser engines
were added. So the builder also writes **segments** (`npm run build:segments`), one gzipped
SQLite file per translation, dictionary, study set, and song collection, with a manifest
that lists their SHA-256 hashes. The browser downloads only the segments you choose,
checks them against the manifest, keeps them in Cache Storage by hash, and merges them
into its local database (`shared/src/library/merge.ts`).

The browser can also take raw MyBible modules — dropped or picked — and convert them in
the worker with the same rules the builder uses (`shared/src/library/mybible.ts`). The
converted segment is cached, so a reload doesn't convert again.

## Measurements

The numbers come from the development PC (Windows 10) during milestone 1.2, completed on
2026-09-27; each change is in the commit named in the first column.

Storage and loading:

| Change                                                               | Before                 | After                    |
| -------------------------------------------------------------------- | ---------------------- | ------------------------ |
| 1.2.2: contentless FTS5 per translation, no duplicate text columns   | 636 MB                 | 452 MB (−29 %)           |
| 1.2.2: a search planner that uses the index's term counts («бог»)    | 37 ms                  | 14 ms                    |
| 1.2.3: segments instead of the whole library                         | 452 MB                 | 130 MB gzipped, 25 files |
| 1.2.3: normalization per verse                                       | 18.3 µs                | 12.0 µs                  |
| 1.2.6: segments carry normalized text; one SQL statement fills FTS5  | ~1.7 s per translation | 0.41–0.48 s              |
| 1.2.8: bulk inserts with `json_each` when converting a module (KJV+) | 6.5 s                  | 2.8 s                    |
| 1.2.9: a PGlite snapshot in IndexedDB instead of reloading segments  | 42 s                   | 4.4 s                    |

The engines side by side, on the `/bench` page (1.2.11), with the same segments and 16
queries:

| Measure              | Server (HTTP) | SQLite-WASM | PGlite |
| -------------------- | ------------- | ----------- | ------ |
| Engine start         | —             | 151 ms      | 2.5 s  |
| Loading the segments | —             | 1.1 s       | 10.4 s |
| Database size        | —             | 36 MB       | 104 MB |
| Reference «Ів 3:16»  | 6.1 ms        | 0.9 ms      | 2.5 ms |
| Text search «бог»    | 21 ms         | 12 ms       | 25 ms  |

For 8 segments, the database took 229 MB in SQLite-WASM and 361 MB in PGlite. With
SQLite-WASM, jumping between chapters took 550–750 ms against the server's 580–600 ms:
the time goes to the UI, not to the engine.

## Run the benchmarks

- **In the app:** in **Налаштування вигляду** → **Застосунок** → **Джерело даних**, click
  **Порівняти рушії бази**, or open `/bench`. The page runs the server, SQLite-WASM, and
  PGlite on the same segments and queries in throwaway workers, and exports CSV or JSON.
- **On the server:** `npm run bench:db` times the library queries on `data/library.db`.

## Add an engine

To add an engine:

1. Implement `SqlDriver` for it, with `dialect` set to the SQL it speaks.
2. If it isn't SQLite or Postgres, add a dialect and branch the schema probes and text
   search in `queries.ts`, as the `pg` branches do.
3. Load the library into it: from `data/library.db`, or from segments, as
   `web/src/lib/engine/worker.ts` does for the browser engines.
4. Extend the parity test so the new engine returns the same results as SQLite.
