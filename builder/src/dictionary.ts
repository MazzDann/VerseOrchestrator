import Database from 'better-sqlite3';

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

    // A Strong's dictionary is keyed by Strong numbers (G2424 / H7225 / 2424).
    const sample = entries.slice(0, 60).map((e) => String(e.topic).trim());
    const strongLike = sample.filter((t) => /^[ghGH]?0*\d{1,5}$/.test(t)).length;
    const isStrong = strongLike >= Math.max(1, Math.floor(sample.length * 0.6));

    return {
      name: info.description || info.title || '',
      language: info.language || '',
      type: info.dictionary_type || info.type || (isStrong ? 'strong' : 'explanatory'),
      isStrong,
      entries,
    };
  } finally {
    db.close();
  }
}

/**
 * Testament tag of a Strong topic: 'H' (Hebrew/OT) or 'G' (Greek/NT) from a
 * prefixed topic like "H7225" / "G2424"; '' when there's no prefix. Lets the
 * server disambiguate H#### from G#### that share the same digits.
 */
export function strongLang(topic: string): string {
  const m = String(topic)
    .trim()
    .match(/^([ghGH])/);
  return m ? m[1].toUpperCase() : '';
}

/** Lookup key: Strong topics -> bare digits (no prefix/zeros); words -> lowercased. */
export function dictTopicNorm(topic: string, isStrong: boolean): string {
  const t = String(topic).trim();
  if (isStrong) {
    const m = t.match(/(\d+)/);
    if (m) return String(Number.parseInt(m[1], 10));
  }
  return t.toLowerCase();
}
