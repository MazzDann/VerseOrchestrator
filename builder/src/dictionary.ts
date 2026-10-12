import Database from 'better-sqlite3';
import { dictMeta, readMorphology, type MorphologyRow } from '@vo/shared';

export interface DictEntry {
  topic: string;
  definition: string | null;
}

export interface DictModule {
  name: string;
  language: string;
  type: string;
  isStrong: boolean;
  entries: DictEntry[];
  /** the grammar codes it explains (1.16.0-beta.2) */
  morphology: MorphologyRow[];
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

/** Read a `*.dictionary.SQLite3` module. Returns null if not a dictionary. */
export function readDictionary(path: string): DictModule | null {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (!tableExists(db, 'dictionary')) return null;
    const info: Record<string, string> = {};
    if (tableExists(db, 'info')) {
      for (const r of db.prepare('SELECT name, value FROM info').all() as {
        name: string;
        value: string;
      }[]) {
        info[r.name] = r.value;
      }
    }
    const entries = db.prepare('SELECT topic, definition FROM dictionary').all() as DictEntry[];
    if (entries.length === 0) return null;
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((t) => t.name);
    // name/type + the Strong's-dictionary heuristic are shared with the browser converter.
    return {
      ...dictMeta(
        info,
        entries.map((e) => String(e.topic)),
      ),
      entries,
      morphology: readMorphology(
        (sql) => db.prepare(sql).all() as Record<string, unknown>[],
        tables,
      ),
    };
  } finally {
    db.close();
  }
}
