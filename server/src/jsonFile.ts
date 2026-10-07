import fs from 'node:fs';
import path from 'node:path';

/**
 * Tiny JSON file persistence for server-side state under the data directory.
 * Reads are forgiving (missing/corrupt file → the default, with a console warning);
 * writes are atomic (temp file + rename), so a crash mid-write can't leave a half file.
 *
 * Most callers read, change and write back (albums, videos, pictures, remotes, ui-state), so a
 * default read in place of the real list would be written over the file and lose it (1.9.3, the
 * review of 1.9.2: a truncated or locked albums.json, then «Додати папку…», left one album). So:
 * a byte-order mark is read past; a file that isn't JSON is copied aside before anything replaces
 * it; a file that can't be read now (locked, no access) is tried again briefly and, if still
 * unreadable, isn't written over until a read succeeds.
 */

/** A write refused: the file couldn't be read a moment ago (the server says it in words). */
export class UnreadableFile extends Error {
  file: string; // a plain field: plain-Node files keep to erasable syntax (no parameter properties)
  constructor(file: string) {
    super(`${file} could not be read a moment ago, so it was not written over. Try again.`);
    this.file = file;
  }
}

/** Files whose last read failed for a reason other than «not there» or «not JSON». */
const unreadable = new Set<string>();

const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** A copy of a broken file next to it, once per version of it (its time and size). */
function keepBroken(file: string): string {
  try {
    const st = fs.statSync(file);
    const copy = `${file}.bad-${Math.round(st.mtimeMs)}-${st.size}`;
    if (!fs.existsSync(copy)) fs.copyFileSync(file, copy);
    return path.basename(copy);
  } catch {
    return '(no copy)';
  }
}

export function readJson<T>(file: string, fallback: T): T {
  let text = '';
  for (let attempt = 0; ; attempt++) {
    try {
      text = fs.readFileSync(file, 'utf8');
      break;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        unreadable.delete(file);
        return fallback;
      }
      // Windows: an antivirus, an indexer or a sync tool may hold it for a moment
      if (attempt < 2) {
        pause(50);
        continue;
      }
      unreadable.add(file);
      console.warn(
        `[data] ${path.basename(file)} unreadable (${code ?? 'error'}), using defaults; not written over until it reads:`,
        (err as Error).message,
      );
      return fallback;
    }
  }
  unreadable.delete(file);
  try {
    // a byte-order mark (a Windows editor) is no reason to lose the file
    return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) as T;
  } catch (err) {
    console.warn(
      `[data] ${path.basename(file)} is not valid JSON, using defaults; its content is kept in ${keepBroken(file)}:`,
      (err as Error).message,
    );
    return fallback;
  }
}

/**
 * Atomic write. `secret` files get owner-only permissions where the OS supports it. A file whose
 * last read failed (not «missing», not «not JSON») isn't written over — what is written was made
 * from the defaults — unless `replace` says the value doesn't come from reading it (a restore).
 */
export function writeJson(
  file: string,
  value: unknown,
  opts: { secret?: boolean; replace?: boolean } = {},
): void {
  if (unreadable.has(file) && !opts.replace) throw new UnreadableFile(path.basename(file));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', {
    encoding: 'utf8',
    mode: opts.secret ? 0o600 : 0o644,
  });
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true }); // no stray *.tmp next to the list (Windows: the file held)
    throw err;
  }
  unreadable.delete(file);
}
