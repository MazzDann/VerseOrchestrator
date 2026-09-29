import { fill, N_, type Vars } from '../i18n/index.js';

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

/**
 * The server has no library yet (0.13.1): its answer to every library read. The control window
 * recognises the key and shows how to add modules instead of an empty list.
 */
export const NO_LIBRARY = N_('Бібліотеки ще немає');

/**
 * An error a transport can map to a status (the server turns `status` into HTTP). Its message
 * is a dictionary key (0.11.6): with `vars` the key and the values travel apart, so the page
 * shows it in its own language.
 */
export class LibraryError extends Error {
  readonly key: string;
  constructor(
    public status: number,
    message: string,
    public vars?: Vars,
  ) {
    super(fill(message, vars));
    this.key = message;
  }
}
