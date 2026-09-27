import Database from 'better-sqlite3';
import { dictMeta } from '@vo/shared';

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
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

/** Read a MyBible `*.dictionary.SQLite3` module. Returns null if not a dictionary. */
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
    // name/type + the Strong's-dictionary heuristic are shared with the browser converter.
    return {
      ...dictMeta(
        info,
        entries.map((e) => String(e.topic)),
      ),
      entries,
    };
  } finally {
    db.close();
  }
}
