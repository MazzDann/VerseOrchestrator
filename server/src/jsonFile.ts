import fs from 'node:fs';
import path from 'node:path';

/**
 * Tiny JSON file persistence for server-side state under the data directory.
 * Reads are forgiving (missing/corrupt file → the default, with a console warning);
 * writes are atomic (temp file + rename), so a crash mid-write can't leave a half file.
 */

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(
        `[data] ${path.basename(file)} unreadable, using defaults:`,
        (err as Error).message,
      );
    }
    return fallback;
  }
}

/** Atomic write. `secret` files get owner-only permissions where the OS supports it. */
export function writeJson(file: string, value: unknown, opts: { secret?: boolean } = {}): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', {
    encoding: 'utf8',
    mode: opts.secret ? 0o600 : 0o644,
  });
  fs.renameSync(tmp, file);
}
