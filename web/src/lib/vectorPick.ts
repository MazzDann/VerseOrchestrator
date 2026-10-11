/**
 * Which translations get vectors («Пошук за змістом», 1.15.1). One is enough to find a place for a
 * query in any language; one per language adds each language's own wording.
 */
export interface VectorRow {
  id: number;
  abbr: string;
  language: string;
  verses: number;
  state: 'done' | 'partial' | 'none';
}

/**
 * One translation for each language that has none with vectors yet: the main translation for its
 * own language, else one already begun, else the fullest (a whole Bible before a New Testament),
 * then by abbreviation.
 */
export function onePerLanguage(rows: VectorRow[], mainId: number | null): number[] {
  const covered = new Set(rows.filter((r) => r.state === 'done').map((r) => r.language));
  const best = new Map<string, VectorRow>();
  for (const r of rows) {
    if (r.state === 'done' || covered.has(r.language)) continue;
    const had = best.get(r.language);
    // the main one first, then one already begun (its books are kept), the fullest, by name
    const rank = (x: VectorRow) => (x.id === mainId ? 2 : x.state === 'partial' ? 1 : 0);
    const better =
      !had ||
      rank(r) > rank(had) ||
      (rank(r) === rank(had) &&
        (r.verses > had.verses || (r.verses === had.verses && r.abbr.localeCompare(had.abbr) < 0)));
    if (better) best.set(r.language, r);
  }
  return [...best.values()].map((r) => r.id);
}
