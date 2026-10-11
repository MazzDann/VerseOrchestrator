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

Normalization (`shared/src/normalize.ts`) happens once, when the library is built: Module
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

The browser can also take raw Module modules — dropped or picked — and convert them in
the worker with the same rules the builder uses (`shared/src/library/module.ts`). The
converted segment is cached, so a reload doesn't convert again.

## Measurements

The numbers come from the development PC (Windows 10) during milestone 0.3, completed on
2026-09-27; each change is in the commit named in the first column.

Storage and loading:

| Change                                                               | Before                 | After                    |
| -------------------------------------------------------------------- | ---------------------- | ------------------------ |
| 0.3.2: contentless FTS5 per translation, no duplicate text columns   | 636 MB                 | 452 MB (−29 %)           |
| 0.3.2: a search planner that uses the index's term counts («бог»)    | 37 ms                  | 14 ms                    |
| 0.3.3: segments instead of the whole library                         | 452 MB                 | 130 MB gzipped, 25 files |
| 0.3.3: normalization per verse                                       | 18.3 µs                | 12.0 µs                  |
| 0.3.6: segments carry normalized text; one SQL statement fills FTS5  | ~1.7 s per translation | 0.41–0.48 s              |
| 0.3.8: bulk inserts with `json_each` when converting a module (KJV+) | 6.5 s                  | 2.8 s                    |
| 0.3.9: a PGlite snapshot in IndexedDB instead of reloading segments  | 42 s                   | 4.4 s                    |

The engines side by side, on the `/bench` page (0.3.11), with the same segments and 16
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

## Vectors: search by meaning

Version 1.15 adds a query by meaning: `~ любіть своїх ворогів` finds Luke 6:27 and Matthew 5:44
without the words having to match. A multilingual embedding model turns every verse into a
vector once, and a query into one each time; the nearest verse vectors are the answer.

**The model.** Five open models were compared on the New Testament of UBIO'62 (7958 verses)
with 20 queries in the operator's own words (16 Ukrainian, 4 English), on the development PC
(i3-10100F, 8 threads, int8 ONNX on onnxruntime-node). The app offers two of them — the
operator chooses («Швидка» / «Точна»), and downloads the chosen one on a click; neither ships
with the app.

| Model (licence)                                  | File   | Dims | Verses/s | Found in top 10 | First | MRR@10 |
| ------------------------------------------------ | ------ | ---- | -------- | --------------- | ----- | ------ |
| multilingual-e5-small (MIT)                      | 118 MB | 384  | 185      | 13              | 10    | 0.54   |
| paraphrase-multilingual-MiniLM-L12-v2 — «Швидка» | 118 MB | 384  | 195      | 15              | 11    | 0.60   |
| multilingual-e5-base (MIT)                       | 279 MB | 768  | 60       | 16              | 8     | 0.53   |
| snowflake-arctic-embed-m-v2.0 — «Точна»          | 311 MB | 768  | 42       | 17              | 13    | 0.74   |
| gte-multilingual-base (Apache-2.0)               | 340 MB | 768  | 41       | 17              | 12    | 0.67   |

Vectors are kept as int8 (a unit vector ×127): no query was found or lost against float32. The
«Точна» model is cut to 256 of its 768 dimensions (it is trained for that): MRR 0.74 → 0.71, the
same 17 found. The runtime: onnxruntime-node on the server's CPU, 160–185 verses/s against
60 for onnxruntime-web (WASM) in Node; DirectML on the GPU was slower for int8 (87).

**One logical table, two physical forms.** A vector belongs to (model, translation, place); a
translation is known by its module's hash, so vectors outlive a rebuild that renumbers
translations. The server keeps them in `data/vectors.db`, attached to its read-only library
connection — never in `library.db`, which the builder writes over whole.

| Layout on better-sqlite3 (31 102 verses × 384)          | Read + scan |
| ------------------------------------------------------- | ----------- |
| a row per verse, a SQL function for the dot product     | 78 ms       |
| a row per verse, read and scanned in JS                 | 81 ms       |
| a row per **chapter** (verse numbers + vectors), in JS  | 37 ms       |
| the same, decoded once and kept (a translation ≈ 12 MB) | 22 ms       |

So SQLite — on the server and in the browser — keeps a row per chapter and scans it in shared
JS (`shared/src/embed/vectors.ts`). PostgreSQL keeps a row per verse in a pgvector column and
orders by `<#>`; the int8 values go in as they are, so float32 holds them exactly and both
engines rank alike (the parity test `builder/src/vectors.test.ts`).

PGlite with pgvector, in Node, UBIO'62 (31 170 vectors of 384): loading 2.6 s (with
seven-digit fractions as text it was about three times longer); an exact `<#>` scan 37 ms; an
HNSW index took 35 s to build and answered in 2.2 ms, but returned 40 of the 60 nearest with
its default `ef_search`. At a Bible's size the exact scan is kept.

Measured in the app (1.15.0-beta.2): the server answers «~ …» in 31–40 ms (word search 16 ms);
in the browser, typed → rows takes 0.33–0.45 s (SQLite-WASM) and 0.36–0.78 s (PGlite), with the
200 ms typing pause. The vector segment of UBIO'62 is 7.1 MB gzipped; a fresh PGlite with it
and its translation loads in 8.9 s. Making the vectors on half the CPU: «Швидка» 104 verses/s
(UBIO'62 in 5.0 min), «Точна» 22 verses/s (≈ 24 min a Bible).

## Run the benchmarks

- **In the app:** in **Налаштування вигляду** → **Дані** → **Джерело даних**, click
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
