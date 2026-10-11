import { createHash } from 'node:crypto';
import fs from 'node:fs';
import Database from 'better-sqlite3';

/**
 * A translation's identity for its verse vectors (1.15.1): a hash of its text, place by place — the
 * same on any computer, after a copy, an unzip (2-second file times) or the same module downloaded
 * again. Before 1.15.1 it was the file's size and time, which none of those keep.
 */
export function textHash(
  verses: { book_number: number; chapter: number; verse: number; text: string }[],
): string {
  const lines = verses.map((v) => `${v.book_number}:${v.chapter}:${v.verse}\t${v.text}`).sort();
  return `t1:${createHash('sha256').update(lines.join('\n')).digest('hex').slice(0, 32)}`;
}

/**
 * The identity before 1.15.1: the module file's size and time. A file that still has the one its
 * vectors were kept by is the same file — its text is what they were made from (review: a module
 * replaced since the last build must not lend its old vectors to the new text).
 */
export function legacyHash(file: string): string | null {
  try {
    const s = fs.statSync(file);
    return `${s.size}:${Math.round(s.mtimeMs)}`;
  } catch {
    return null;
  }
}

/** The translations' identities in the library now, by module file — to carry their vectors over. */
export function oldHashes(file: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!fs.existsSync(file)) return out;
  let db: Database.Database | null = null;
  try {
    db = new Database(file, { readonly: true });
    for (const r of db.prepare('SELECT source_file, source_hash FROM translations').all() as {
      source_file: string | null;
      source_hash: string | null;
    }[])
      if (r.source_file && r.source_hash) out.set(r.source_file, r.source_hash);
  } catch {
    /* no library yet, or not one */
  } finally {
    db?.close();
  }
  return out;
}

/**
 * The vectors made under a translation's old identity, moved to its new one — data/vectors.db is
 * the server's (the builder never rebuilds it); a translation already there under the new one keeps
 * those. Returns the translations moved.
 */
export function rekeyVectors(file: string, moves: Map<string, string>): number {
  if (!moves.size || !fs.existsSync(file)) return 0;
  const db = new Database(file);
  try {
    db.pragma('busy_timeout = 5000');
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'vector_sets'").get()) return 0;
    let moved = 0;
    db.transaction(() => {
      for (const [from, to] of moves) {
        let any = false;
        for (const t of ['vector_sets', 'chapter_vectors']) {
          const n = db
            .prepare(`UPDATE OR IGNORE ${t} SET source_hash = ? WHERE source_hash = ?`)
            .run(to, from).changes;
          if (n) any = true;
          db.prepare(`DELETE FROM ${t} WHERE source_hash = ?`).run(from);
        }
        if (any) moved += 1;
      }
    })();
    return moved;
  } finally {
    db.close();
  }
}
