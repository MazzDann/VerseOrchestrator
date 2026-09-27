import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import { createLibrary, LibraryError, type Library, type SqlDriver } from '@vo/shared';

/**
 * The server's engine for the shared library queries (@vo/shared `createLibrary`):
 * better-sqlite3 over data/library.db, read-only. All query logic lives in shared so a
 * browser engine (sql.js) can run exactly the same code — this file is just the driver.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DB_PATH = process.env.LIBRARY_DB ?? path.join(repoRoot, 'data', 'library.db');

/** Errors carrying an HTTP status (the library's own errors are the same class). */
export { LibraryError as ApiError };

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  if (!fs.existsSync(DB_PATH)) {
    throw new LibraryError(503, 'Library not built yet. Run: npm run build:library');
  }
  db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  db.pragma('busy_timeout = 3000');
  tuneReadOnly(db);
  return db;
}

/**
 * Read-only tuning for the served library — chosen by measurement (npm run bench:db),
 * not folklore. On Windows, `mmap_size` made FTS 1.6× and concordance 2.8× SLOWER
 * (33 → 53 ms, 1.0 → 2.8 ms), so it is deliberately left off. A 64 MiB page cache and
 * in-memory temp b-trees were neutral (the OS already caches the file) but are cheap
 * insurance for DISTINCT/ORDER BY on larger libraries.
 */
export function tuneReadOnly(conn: Database.Database): void {
  conn.pragma('cache_size = -65536');
  conn.pragma('temp_store = MEMORY');
}

/**
 * better-sqlite3 as a SqlDriver: synchronous under the hood, async at the seam.
 * Prepared statements are reused per SQL text for the driver's lifetime.
 */
export function betterSqliteDriver(open: () => Database.Database): SqlDriver {
  const cache = new Map<string, Database.Statement>();
  const prep = (sql: string) => {
    let s = cache.get(sql);
    if (!s) {
      s = open().prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  return {
    dialect: 'sqlite',
    all: async (sql, params = []) => prep(sql).all(...params) as never[],
    get: async (sql, params = []) => prep(sql).get(...params) as never,
  };
}

let current: Library = createLibrary(betterSqliteDriver(getDb));

/** The library bound to the current database file. */
export function library(): Library {
  return current;
}

/**
 * Drop the cached connection so the next query reopens the database. Called after
 * a rebuild so the server serves the freshly-built library (handles the case where
 * the file was replaced, not just rewritten in place). A fresh library instance also
 * forgets its cached schema probes (tables added by the rebuild are seen).
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
  // New driver (fresh statement cache) + new library (fresh schema probes).
  current = createLibrary(betterSqliteDriver(getDb));
}
