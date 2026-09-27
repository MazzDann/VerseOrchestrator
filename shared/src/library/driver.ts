/**
 * The seam between the library's queries and a concrete database engine — the "hybrid
 * DB" of the thesis. One schema (schema.ts), one set of queries (queries.ts), several
 * engines implementing this tiny interface:
 *   - better-sqlite3 on the server (server/src/db.ts)
 *   - SQLite compiled to WASM in the browser — offline, segments and dropped modules
 *   - PGlite (PostgreSQL compiled to WASM) in the browser — postgres.ts: same tables,
 *     FTS5 → tsvector, `?` → `$n`
 *
 * It is async on purpose: better-sqlite3 and SQLite-WASM are synchronous, but PGlite and
 * a remote engine are not, and the queries must not care.
 */
export type SqlParam = string | number | null;
export type Row = Record<string, unknown>;

export interface SqlDriver {
  /** All rows of a SELECT with positional `?` parameters. */
  all<T = Row>(sql: string, params?: SqlParam[]): Promise<T[]>;
  /** First row of a SELECT, or undefined. */
  get<T = Row>(sql: string, params?: SqlParam[]): Promise<T | undefined>;
  /** Which SQL dialect the engine speaks (queries branch on it where they must). */
  readonly dialect: 'sqlite' | 'postgres';
}

/** An error a transport can map to a status (the server turns `status` into HTTP). */
export class LibraryError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
